package com.taskflow.controller;

import com.taskflow.dto.TaskLinkDto;
import com.taskflow.entity.Task;
import com.taskflow.entity.TaskLink;
import com.taskflow.entity.User;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.TaskLinkRepository;
import com.taskflow.repository.TaskRepository;
import com.taskflow.service.ActivityService;
import com.taskflow.service.NotificationService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/projects/{projectId}/tasks/{taskId}/links")
@Transactional
public class TaskLinkController {

    private final ProjectRepository projectRepo;
    private final TaskRepository taskRepo;
    private final TaskLinkRepository taskLinkRepo;
    private final ActivityService activityService;

    public TaskLinkController(ProjectRepository projectRepo,
                               TaskRepository taskRepo,
                               TaskLinkRepository taskLinkRepo,
                               ActivityService activityService) {
        this.projectRepo = projectRepo;
        this.taskRepo = taskRepo;
        this.taskLinkRepo = taskLinkRepo;
        this.activityService = activityService;
    }

    public record CreateLinkRequest(String targetTaskId, String linkType) {}

    @GetMapping
    public ResponseEntity<?> listLinks(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (taskRepo.findByIdAndProjectId(taskId, projectId).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));
        }

        List<TaskLink> links = taskLinkRepo.findByTaskId(taskId);
        List<TaskLinkDto> dtos = links.stream().map(TaskLinkDto::from).toList();
        return ResponseEntity.ok(Map.of("links", dtos));
    }

    @PostMapping
    public ResponseEntity<?> createLink(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId,
            @RequestBody CreateLinkRequest req) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }

        Task sourceTask = taskRepo.findByIdAndProjectId(taskId, projectId).orElse(null);
        if (sourceTask == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "source task not found"));
        }

        if (req.targetTaskId() == null || req.targetTaskId().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "target_task_id is required"));
        }

        UUID targetId;
        try {
            targetId = UUID.fromString(req.targetTaskId());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid target_task_id"));
        }

        if (taskId.equals(targetId)) {
            return ResponseEntity.badRequest().body(Map.of("error", "cannot link a task to itself"));
        }

        Task targetTask = taskRepo.findByIdAndProjectId(targetId, projectId).orElse(null);
        if (targetTask == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "target task not found or not in same project"));
        }

        if (req.linkType() == null || req.linkType().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "linkType is required"));
        }

        TaskLink.LinkType linkType;
        try {
            linkType = TaskLink.LinkType.valueOf(req.linkType());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "invalid linkType; must be one of: blocks, is_blocked_by, relates_to, duplicates"));
        }

        if (taskLinkRepo.existsBySource_IdAndTarget_IdAndLinkType(taskId, targetId, linkType)) {
            return ResponseEntity.badRequest().body(Map.of("error", "link already exists"));
        }

        TaskLink link = new TaskLink();
        link.setSource(sourceTask);
        link.setTarget(targetTask);
        link.setLinkType(linkType);
        link.setCreatedBy(user);
        link = taskLinkRepo.save(link);

        // Create the inverse link automatically for blocks <-> is_blocked_by
        if (linkType == TaskLink.LinkType.blocks) {
            if (!taskLinkRepo.existsBySource_IdAndTarget_IdAndLinkType(targetId, taskId, TaskLink.LinkType.is_blocked_by)) {
                TaskLink inverse = new TaskLink();
                inverse.setSource(targetTask);
                inverse.setTarget(sourceTask);
                inverse.setLinkType(TaskLink.LinkType.is_blocked_by);
                inverse.setCreatedBy(user);
                taskLinkRepo.save(inverse);
            }
        } else if (linkType == TaskLink.LinkType.is_blocked_by) {
            if (!taskLinkRepo.existsBySource_IdAndTarget_IdAndLinkType(targetId, taskId, TaskLink.LinkType.blocks)) {
                TaskLink inverse = new TaskLink();
                inverse.setSource(targetTask);
                inverse.setTarget(sourceTask);
                inverse.setLinkType(TaskLink.LinkType.blocks);
                inverse.setCreatedBy(user);
                taskLinkRepo.save(inverse);
            }
        }

        activityService.log(
                projectId,
                taskId,
                user.getId(),
                "task_linked",
                NotificationService.payload(
                        "title", sourceTask.getTitle(),
                        "targetTitle", targetTask.getTitle(),
                        "linkType", linkType.name()
                )
        );

        return ResponseEntity.status(HttpStatus.CREATED).body(TaskLinkDto.from(link));
    }

    @DeleteMapping("/{linkId}")
    public ResponseEntity<?> deleteLink(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId,
            @PathVariable UUID linkId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }

        TaskLink link = taskLinkRepo.findById(linkId).orElse(null);
        if (link == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "link not found"));
        }

        // Delete the inverse link when removing blocks <-> is_blocked_by pair
        if (link.getLinkType() == TaskLink.LinkType.blocks) {
            taskLinkRepo.deleteBySource_IdAndTarget_IdAndLinkType(
                    link.getTarget().getId(),
                    link.getSource().getId(),
                    TaskLink.LinkType.is_blocked_by
            );
        } else if (link.getLinkType() == TaskLink.LinkType.is_blocked_by) {
            taskLinkRepo.deleteBySource_IdAndTarget_IdAndLinkType(
                    link.getTarget().getId(),
                    link.getSource().getId(),
                    TaskLink.LinkType.blocks
            );
        }

        taskLinkRepo.delete(link);
        return ResponseEntity.noContent().build();
    }
}
