package com.taskflow.controller;

import com.taskflow.dto.LabelDto;
import com.taskflow.dto.TaskDto;
import com.taskflow.entity.Label;
import com.taskflow.entity.Task;
import com.taskflow.entity.User;
import com.taskflow.repository.LabelRepository;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.TaskRepository;
import com.taskflow.service.ActivityService;
import com.taskflow.sse.EventBroker;
import com.taskflow.sse.SseEvent;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/projects/{projectId}")
public class LabelController {

    private final ProjectRepository projectRepo;
    private final LabelRepository labelRepo;
    private final TaskRepository taskRepo;
    private final EventBroker broker;
    private final ActivityService activityService;

    public LabelController(ProjectRepository projectRepo,
                           LabelRepository labelRepo,
                           TaskRepository taskRepo,
                           EventBroker broker,
                           ActivityService activityService) {
        this.projectRepo = projectRepo;
        this.labelRepo = labelRepo;
        this.taskRepo = taskRepo;
        this.broker = broker;
        this.activityService = activityService;
    }

    public record CreateLabelRequest(
            @NotBlank String name,
            @Pattern(regexp = "#[0-9a-fA-F]{3,6}") String color
    ) {}

    public record UpdateLabelRequest(String name, String color) {}

    // ─── GET /projects/{id}/labels ────────────────────────────────────────────

    @GetMapping("/labels")
    public ResponseEntity<?> listLabels(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        List<LabelDto> labels = labelRepo.findByProjectIdOrderByName(projectId)
                .stream().map(LabelDto::from).toList();
        return ResponseEntity.ok(Map.of("labels", labels));
    }

    // ─── POST /projects/{id}/labels ───────────────────────────────────────────

    @PostMapping("/labels")
    public ResponseEntity<?> createLabel(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @RequestBody CreateLabelRequest req) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (req.name() == null || req.name().isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "name is required"));
        }
        if (labelRepo.existsByProjectIdAndName(projectId, req.name().trim())) {
            return ResponseEntity.badRequest().body(Map.of("error", "label already exists"));
        }

        Label label = new Label();
        label.setProject(projectRepo.getReferenceById(projectId));
        label.setName(req.name().trim());
        if (req.color() != null && !req.color().isBlank()) {
            label.setColor(req.color());
        }
        label = labelRepo.save(label);
        return ResponseEntity.status(HttpStatus.CREATED).body(LabelDto.from(label));
    }

    // ─── PATCH /projects/{id}/labels/{labelId} ────────────────────────────────

    @PatchMapping("/labels/{labelId}")
    public ResponseEntity<?> updateLabel(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID labelId,
            @RequestBody UpdateLabelRequest req) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        Label label = labelRepo.findByIdAndProjectId(labelId, projectId).orElse(null);
        if (label == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "label not found"));
        }
        if (req.name() != null && !req.name().isBlank()) {
            label.setName(req.name().trim());
        }
        if (req.color() != null && !req.color().isBlank()) {
            label.setColor(req.color());
        }
        label = labelRepo.save(label);
        return ResponseEntity.ok(LabelDto.from(label));
    }

    // ─── DELETE /projects/{id}/labels/{labelId} ───────────────────────────────

    @DeleteMapping("/labels/{labelId}")
    public ResponseEntity<?> deleteLabel(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID labelId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        Label label = labelRepo.findByIdAndProjectId(labelId, projectId).orElse(null);
        if (label == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "label not found"));
        }
        labelRepo.delete(label);
        return ResponseEntity.noContent().build();
    }

    // ─── POST /projects/{id}/tasks/{taskId}/labels/{labelId} — attach ─────────

    @PostMapping("/tasks/{taskId}/labels/{labelId}")
    public ResponseEntity<?> attachLabel(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId,
            @PathVariable UUID labelId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        Task task = taskRepo.findByIdAndProjectId(taskId, projectId).orElse(null);
        if (task == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));
        }
        Label label = labelRepo.findByIdAndProjectId(labelId, projectId).orElse(null);
        if (label == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "label not found"));
        }

        // Load labels eagerly to avoid LazyInitializationException
        List<Task> withLabels = taskRepo.findWithLabelsByIdIn(List.of(taskId));
        Task taskWithLabels = withLabels.isEmpty() ? task : withLabels.get(0);
        taskWithLabels.getLabels().add(label);
        Task saved = taskRepo.save(taskWithLabels);

        // Re-fetch with labels to build DTO
        Task reloaded = taskRepo.findWithLabelsByIdIn(List.of(saved.getId())).get(0);
        TaskDto dto = TaskDto.from(reloaded);
        broker.publish(projectId, new SseEvent("task_updated", dto));
        activityService.log(projectId, taskId, user.getId(), "label_added",
                ActivityService.payload("title", task.getTitle(), "label", label.getName()));
        return ResponseEntity.ok(dto);
    }

    // ─── DELETE /projects/{id}/tasks/{taskId}/labels/{labelId} — detach ───────

    @DeleteMapping("/tasks/{taskId}/labels/{labelId}")
    public ResponseEntity<?> detachLabel(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId,
            @PathVariable UUID labelId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        Task task = taskRepo.findByIdAndProjectId(taskId, projectId).orElse(null);
        if (task == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));
        }
        Label label = labelRepo.findByIdAndProjectId(labelId, projectId).orElse(null);
        if (label == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "label not found"));
        }

        List<Task> withLabels = taskRepo.findWithLabelsByIdIn(List.of(taskId));
        Task taskWithLabels = withLabels.isEmpty() ? task : withLabels.get(0);
        taskWithLabels.getLabels().removeIf(l -> l.getId().equals(labelId));
        Task saved = taskRepo.save(taskWithLabels);

        Task reloaded = taskRepo.findWithLabelsByIdIn(List.of(saved.getId())).get(0);
        TaskDto dto = TaskDto.from(reloaded);
        broker.publish(projectId, new SseEvent("task_updated", dto));
        activityService.log(projectId, taskId, user.getId(), "label_removed",
                ActivityService.payload("title", task.getTitle(), "label", label.getName()));
        return ResponseEntity.ok(dto);
    }
}
