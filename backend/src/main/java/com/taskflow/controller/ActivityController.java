package com.taskflow.controller;

import com.taskflow.dto.ActivityEventDto;
import com.taskflow.entity.User;
import com.taskflow.repository.ActivityEventRepository;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.TaskRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
public class ActivityController {

    private final ProjectRepository projectRepo;
    private final TaskRepository taskRepo;
    private final ActivityEventRepository activityRepo;

    public ActivityController(ProjectRepository projectRepo,
                              TaskRepository taskRepo,
                              ActivityEventRepository activityRepo) {
        this.projectRepo = projectRepo;
        this.taskRepo = taskRepo;
        this.activityRepo = activityRepo;
    }

    // ─── GET /projects/{id}/activity?limit=50 ────────────────────────────────

    @GetMapping("/projects/{projectId}/activity")
    public ResponseEntity<?> projectActivity(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @RequestParam(defaultValue = "50") int limit) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        limit = Math.min(limit, 200);
        List<ActivityEventDto> events = activityRepo
                .findByProjectIdOrderByCreatedAtDesc(projectId, PageRequest.of(0, limit))
                .stream()
                .map(ActivityEventDto::from)
                .toList();
        return ResponseEntity.ok(Map.of("activity", events));
    }

    // ─── GET /projects/{id}/tasks/{taskId}/activity ───────────────────────────

    @GetMapping("/projects/{projectId}/tasks/{taskId}/activity")
    public ResponseEntity<?> taskActivity(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (taskRepo.findByIdAndProjectId(taskId, projectId).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));
        }
        List<ActivityEventDto> events = activityRepo
                .findByTaskIdOrderByCreatedAtDesc(taskId)
                .stream()
                .map(ActivityEventDto::from)
                .toList();
        return ResponseEntity.ok(Map.of("activity", events));
    }
}
