package com.taskflow.controller;

import com.taskflow.dto.CommentDto;
import com.taskflow.entity.Comment;
import com.taskflow.entity.Task;
import com.taskflow.entity.User;
import com.taskflow.repository.CommentRepository;
import com.taskflow.repository.ProjectMemberRepository;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.TaskRepository;
import com.taskflow.service.ActivityService;
import com.taskflow.service.NotificationService;
import com.taskflow.sse.EventBroker;
import com.taskflow.sse.SseEvent;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/projects/{projectId}/tasks/{taskId}/comments")
public class CommentController {

    private final ProjectRepository projectRepo;
    private final TaskRepository taskRepo;
    private final CommentRepository commentRepo;
    private final ProjectMemberRepository memberRepo;
    private final EventBroker broker;
    private final ActivityService activityService;
    private final NotificationService notificationService;

    public CommentController(ProjectRepository projectRepo,
                             TaskRepository taskRepo,
                             CommentRepository commentRepo,
                             ProjectMemberRepository memberRepo,
                             EventBroker broker,
                             ActivityService activityService,
                             NotificationService notificationService) {
        this.projectRepo = projectRepo;
        this.taskRepo = taskRepo;
        this.commentRepo = commentRepo;
        this.memberRepo = memberRepo;
        this.broker = broker;
        this.activityService = activityService;
        this.notificationService = notificationService;
    }

    public record CreateCommentRequest(String body) {}
    public record UpdateCommentRequest(String body) {}

    // ─── GET /projects/{projectId}/tasks/{taskId}/comments ────────────────────

    @GetMapping
    public ResponseEntity<?> listComments(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (taskRepo.findByIdAndProjectId(taskId, projectId).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));
        }
        List<CommentDto> comments = commentRepo.findByTaskIdOrderByCreatedAtAsc(taskId)
                .stream().map(CommentDto::from).toList();
        return ResponseEntity.ok(Map.of("comments", comments));
    }

    // ─── POST /projects/{projectId}/tasks/{taskId}/comments ───────────────────

    @PostMapping
    public ResponseEntity<?> createComment(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId,
            @RequestBody CreateCommentRequest req) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        Task task = taskRepo.findByIdAndProjectId(taskId, projectId)
                .orElse(null);
        if (task == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));
        }
        if (req.body() == null || req.body().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "body is required"));
        }

        Comment comment = new Comment();
        comment.setTask(task);
        comment.setAuthor(user);
        comment.setBody(req.body().trim());
        comment = commentRepo.save(comment);
        // Re-fetch with all associations to avoid lazy-load issues in CommentDto.from()
        comment = commentRepo.findByIdWithDetails(comment.getId()).orElseThrow();

        CommentDto dto = CommentDto.from(comment);
        broker.publish(projectId, new SseEvent("comment_added", dto));
        activityService.log(projectId, taskId, user.getId(), "comment_added",
                ActivityService.payload("taskTitle", task.getTitle()));
        // Notify task creator if they are not the commenter
        UUID creatorId = task.getCreatedBy().getId();
        if (!creatorId.equals(user.getId())) {
            notificationService.notify(creatorId, "comment_added",
                    NotificationService.payload(
                            "taskId", task.getId().toString(),
                            "taskTitle", task.getTitle(),
                            "projectId", projectId.toString(),
                            "commentBy", user.getName()));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(dto);
    }

    // ─── PATCH /projects/{projectId}/tasks/{taskId}/comments/{commentId} ──────

    @PatchMapping("/{commentId}")
    public ResponseEntity<?> updateComment(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId,
            @PathVariable UUID commentId,
            @RequestBody UpdateCommentRequest req) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (taskRepo.findByIdAndProjectId(taskId, projectId).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));
        }
        Comment comment = commentRepo.findByIdWithDetails(commentId).orElse(null);
        if (comment == null || !comment.getTask().getId().equals(taskId)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "comment not found"));
        }
        if (!comment.getAuthor().getId().equals(user.getId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "only the author can edit this comment"));
        }
        if (req.body() == null || req.body().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "body is required"));
        }

        comment.setBody(req.body().trim());
        comment = commentRepo.save(comment);
        // Re-fetch with all associations to avoid lazy-load issues in CommentDto.from()
        comment = commentRepo.findByIdWithDetails(comment.getId()).orElseThrow();

        CommentDto dto = CommentDto.from(comment);
        broker.publish(projectId, new SseEvent("comment_updated", dto));
        return ResponseEntity.ok(dto);
    }

    // ─── DELETE /projects/{projectId}/tasks/{taskId}/comments/{commentId} ─────

    @DeleteMapping("/{commentId}")
    public ResponseEntity<?> deleteComment(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId,
            @PathVariable UUID commentId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (taskRepo.findByIdAndProjectId(taskId, projectId).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));
        }
        Comment comment = commentRepo.findByIdWithDetails(commentId).orElse(null);
        if (comment == null || !comment.getTask().getId().equals(taskId)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "comment not found"));
        }

        boolean isAuthor = comment.getAuthor().getId().equals(user.getId());
        boolean isAdminOrOwner = memberRepo.findByProjectIdAndUserId(projectId, user.getId())
                .map(m -> m.getRole().equals("owner") || m.getRole().equals("admin"))
                .orElse(false);

        if (!isAuthor && !isAdminOrOwner) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }

        commentRepo.delete(comment);
        broker.publish(projectId, new SseEvent("comment_deleted",
                Map.of("id", commentId, "task_id", taskId, "project_id", projectId)));
        activityService.log(projectId, taskId, user.getId(), "comment_deleted");
        return ResponseEntity.noContent().build();
    }
}
