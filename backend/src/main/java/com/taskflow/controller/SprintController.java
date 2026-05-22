package com.taskflow.controller;

import com.taskflow.dto.SprintDto;
import com.taskflow.dto.TaskDto;
import com.taskflow.entity.Sprint;
import com.taskflow.entity.Task;
import com.taskflow.entity.User;
import com.taskflow.repository.ProjectMemberRepository;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.SprintRepository;
import com.taskflow.repository.TaskRepository;
import com.taskflow.service.ActivityService;
import com.taskflow.sse.EventBroker;
import com.taskflow.sse.SseEvent;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/projects/{projectId}/sprints")
public class SprintController {

    private final ProjectRepository projectRepo;
    private final SprintRepository sprintRepo;
    private final TaskRepository taskRepo;
    private final ProjectMemberRepository memberRepo;
    private final EventBroker broker;
    private final ActivityService activityService;

    public SprintController(ProjectRepository projectRepo, SprintRepository sprintRepo,
                            TaskRepository taskRepo, ProjectMemberRepository memberRepo,
                            EventBroker broker, ActivityService activityService) {
        this.projectRepo = projectRepo;
        this.sprintRepo = sprintRepo;
        this.taskRepo = taskRepo;
        this.memberRepo = memberRepo;
        this.broker = broker;
        this.activityService = activityService;
    }

    public record CreateSprintRequest(
            String name,
            String goal,
            String startDate,
            String endDate
    ) {}

    public record UpdateSprintRequest(
            String name,
            String goal,
            String startDate,
            String endDate,
            String status
    ) {}

    @GetMapping
    public ResponseEntity<?> listSprints(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        List<SprintDto> sprints = sprintRepo.findByProjectIdOrderByCreatedAtAsc(projectId)
                .stream().map(SprintDto::from).toList();
        return ResponseEntity.ok(Map.of("sprints", sprints));
    }

    @PostMapping
    public ResponseEntity<?> createSprint(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @RequestBody CreateSprintRequest req) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (!isAdminOrOwner(user.getId(), projectId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }
        if (req.name() == null || req.name().trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "validation failed", "fields", Map.of("name", "is required")));
        }

        Sprint sprint = new Sprint();
        sprint.setProject(projectRepo.getReferenceById(projectId));
        sprint.setName(req.name().trim());
        sprint.setGoal(req.goal() != null ? req.goal().trim() : null);
        if (req.startDate() != null && !req.startDate().isEmpty()) sprint.setStartDate(LocalDate.parse(req.startDate()));
        if (req.endDate() != null && !req.endDate().isEmpty()) sprint.setEndDate(LocalDate.parse(req.endDate()));
        sprint = sprintRepo.save(sprint);
        return ResponseEntity.status(HttpStatus.CREATED).body(SprintDto.from(sprint));
    }

    @PatchMapping("/{sprintId}")
    public ResponseEntity<?> updateSprint(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID sprintId,
            @RequestBody UpdateSprintRequest req) {

        Sprint sprint = sprintRepo.findByIdAndProjectId(sprintId, projectId).orElse(null);
        if (sprint == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (!isAdminOrOwner(user.getId(), projectId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }

        if (req.name() != null && !req.name().trim().isEmpty()) sprint.setName(req.name().trim());
        if (req.goal() != null) sprint.setGoal(req.goal().trim().isEmpty() ? null : req.goal().trim());
        if (req.startDate() != null) sprint.setStartDate(req.startDate().isEmpty() ? null : LocalDate.parse(req.startDate()));
        if (req.endDate() != null) sprint.setEndDate(req.endDate().isEmpty() ? null : LocalDate.parse(req.endDate()));
        if (req.status() != null && !req.status().isEmpty()) {
            String newStatus = req.status();
            if (!List.of("planning", "active", "completed").contains(newStatus)) {
                return ResponseEntity.badRequest().body(Map.of("error", "invalid status"));
            }
            String oldStatus = sprint.getStatus();
            sprint.setStatus(newStatus);
            sprint = sprintRepo.save(sprint);
            SprintDto dto = SprintDto.from(sprint);
            if ("active".equals(newStatus) && !"active".equals(oldStatus)) {
                broker.publish(projectId, new SseEvent("sprint_started", dto));
                activityService.log(projectId, null, user.getId(), "sprint_started",
                        ActivityService.payload("sprintName", sprint.getName()));
            } else if ("completed".equals(newStatus) && !"completed".equals(oldStatus)) {
                broker.publish(projectId, new SseEvent("sprint_completed", dto));
                activityService.log(projectId, null, user.getId(), "sprint_completed",
                        ActivityService.payload("sprintName", sprint.getName()));
            }
            return ResponseEntity.ok(dto);
        }
        sprint = sprintRepo.save(sprint);
        return ResponseEntity.ok(SprintDto.from(sprint));
    }

    @DeleteMapping("/{sprintId}")
    public ResponseEntity<?> deleteSprint(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID sprintId) {

        Sprint sprint = sprintRepo.findByIdAndProjectId(sprintId, projectId).orElse(null);
        if (sprint == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (!isAdminOrOwner(user.getId(), projectId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }
        sprintRepo.delete(sprint);
        return ResponseEntity.noContent().build();
    }

    @Transactional
    @PostMapping("/{sprintId}/tasks/{taskId}")
    public ResponseEntity<?> addTaskToSprint(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID sprintId,
            @PathVariable UUID taskId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (!isAdminOrOwner(user.getId(), projectId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }
        Sprint sprint = sprintRepo.findByIdAndProjectId(sprintId, projectId).orElse(null);
        if (sprint == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "sprint not found"));
        Task task = taskRepo.findByIdAndProjectId(taskId, projectId).orElse(null);
        if (task == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));

        task.setSprint(sprint);
        task = taskRepo.save(task);
        TaskDto dto = TaskDto.from(task);
        broker.publish(projectId, new SseEvent("task_moved", dto));
        return ResponseEntity.ok(dto);
    }

    @Transactional
    @DeleteMapping("/{sprintId}/tasks/{taskId}")
    public ResponseEntity<?> removeTaskFromSprint(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID sprintId,
            @PathVariable UUID taskId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (!isAdminOrOwner(user.getId(), projectId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }
        Task task = taskRepo.findByIdAndProjectId(taskId, projectId).orElse(null);
        if (task == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));

        task.setSprint(null);
        task = taskRepo.save(task);
        TaskDto dto = TaskDto.from(task);
        broker.publish(projectId, new SseEvent("task_moved", dto));
        return ResponseEntity.ok(dto);
    }

    private boolean isAdminOrOwner(UUID userId, UUID projectId) {
        if (projectRepo.existsByIdAndOwnerId(projectId, userId)) return true;
        return memberRepo.findByProjectIdAndUserId(projectId, userId)
                .map(m -> "owner".equals(m.getRole()) || "admin".equals(m.getRole()))
                .orElse(false);
    }
}
