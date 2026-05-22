package com.taskflow.controller;

import com.taskflow.dto.TaskDto;
import com.taskflow.entity.Sprint;
import com.taskflow.entity.Task;
import com.taskflow.entity.User;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.SprintRepository;
import com.taskflow.repository.TaskRepository;
import com.taskflow.repository.UserRepository;
import com.taskflow.service.ActivityService;
import com.taskflow.service.NotificationService;
import com.taskflow.sse.EventBroker;
import com.taskflow.sse.SseEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;

@RestController
@RequestMapping("/projects/{projectId}/tasks")
@Transactional
public class TaskController {

    private final ProjectRepository projectRepo;
    private final TaskRepository taskRepo;
    private final UserRepository userRepo;
    private final SprintRepository sprintRepo;
    private final EventBroker broker;
    private final ActivityService activityService;
    private final NotificationService notificationService;

    public TaskController(ProjectRepository projectRepo, TaskRepository taskRepo,
                          UserRepository userRepo, SprintRepository sprintRepo,
                          EventBroker broker, ActivityService activityService,
                          NotificationService notificationService) {
        this.projectRepo = projectRepo;
        this.taskRepo = taskRepo;
        this.userRepo = userRepo;
        this.sprintRepo = sprintRepo;
        this.broker = broker;
        this.activityService = activityService;
        this.notificationService = notificationService;
    }

    public record CreateTaskRequest(
            String title,
            String description,
            String status,
            String priority,
            String assigneeId,
            String dueDate,
            String type,
            String parentId,
            String sprintId,
            Integer storyPoints
    ) {}

    public record UpdateTaskRequest(
            String title,
            String description,
            String status,
            String priority,
            String assigneeId,
            String dueDate,
            String type,
            String parentId,
            String sprintId,
            Integer storyPoints
    ) {}

    public record MoveTaskRequest(String status, Integer position, String sprintId) {}

    @GetMapping
    public ResponseEntity<?> listTasks(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String assignee,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (status != null && !isValidStatus(status)) {
            return ResponseEntity.badRequest().body(Map.of("error", "validation failed", "fields", Map.of("filter", "invalid status")));
        }
        limit = Math.min(limit, 100);
        PageRequest pr = PageRequest.of(page - 1, limit, Sort.by("createdAt").descending());

        Page<Task> result;
        UUID assigneeUuid = parseUuid(assignee);
        Task.TaskStatus taskStatus = status != null ? Task.TaskStatus.valueOf(status) : null;

        if (taskStatus != null && assigneeUuid != null) {
            result = taskRepo.findByProjectIdAndStatusAndAssigneeId(projectId, taskStatus, assigneeUuid, pr);
        } else if (taskStatus != null) {
            result = taskRepo.findByProjectIdAndStatus(projectId, taskStatus, pr);
        } else if (assigneeUuid != null) {
            result = taskRepo.findByProjectIdAndAssigneeId(projectId, assigneeUuid, pr);
        } else {
            result = taskRepo.findByProjectId(projectId, pr);
        }

        List<TaskDto> dtos = result.getContent().stream().map(TaskDto::from).toList();
        return ResponseEntity.ok(Map.of("tasks", dtos, "page", page, "limit", limit, "total", result.getTotalElements()));
    }

    @PostMapping
    public ResponseEntity<?> createTask(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @RequestBody CreateTaskRequest req) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        Map<String, String> errors = validateTaskInput(req.title(), req.status(), req.priority(), req.assigneeId(), req.dueDate(), true, true);
        if (!errors.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "validation failed", "fields", errors));
        }

        Task task = new Task();
        task.setTitle(req.title().trim());
        task.setDescription(req.description() != null ? req.description().trim() : null);
        task.setStatus(req.status() != null && !req.status().isEmpty() ? Task.TaskStatus.valueOf(req.status()) : Task.TaskStatus.todo);
        task.setPriority(req.priority() != null && !req.priority().isEmpty() ? Task.TaskPriority.valueOf(req.priority()) : Task.TaskPriority.medium);
        task.setProject(projectRepo.getReferenceById(projectId));
        task.setCreatedBy(user);
        if (req.assigneeId() != null && !req.assigneeId().isEmpty()) {
            userRepo.findById(UUID.fromString(req.assigneeId())).ifPresent(task::setAssignee);
        }
        if (req.dueDate() != null && !req.dueDate().isEmpty()) {
            task.setDueDate(LocalDate.parse(req.dueDate()));
        }
        if (req.type() != null && !req.type().isEmpty()) {
            task.setType(req.type());
        }
        if (req.parentId() != null && !req.parentId().isEmpty()) {
            Task parent = taskRepo.findByIdAndProjectId(UUID.fromString(req.parentId()), projectId).orElse(null);
            if (parent != null && parent.getParent() == null) {
                task.setParent(parent);
            }
        }
        if (req.sprintId() != null && !req.sprintId().isEmpty()) {
            sprintRepo.findByIdAndProjectId(UUID.fromString(req.sprintId()), projectId)
                    .ifPresent(task::setSprint);
        }
        task.setStoryPoints(req.storyPoints());
        task = taskRepo.save(task);
        TaskDto dto = TaskDto.from(task);
        broker.publish(projectId, new SseEvent("task_created", dto));
        // Log activity
        activityService.log(projectId, task.getId(), user.getId(), "task_created",
                ActivityService.payload("title", task.getTitle(), "type", task.getType()));
        if (task.getParent() != null) {
            activityService.log(projectId, task.getParent().getId(), user.getId(), "subtask_created",
                    ActivityService.payload("title", task.getTitle(), "type", task.getType()));
        }
        // Notify assignee if they are not the creator
        if (task.getAssignee() != null && !task.getAssignee().getId().equals(user.getId())) {
            notificationService.notify(task.getAssignee().getId(), "task_assigned",
                    NotificationService.payload(
                            "taskId", task.getId().toString(),
                            "taskTitle", task.getTitle(),
                            "projectId", projectId.toString(),
                            "assignedBy", user.getName()));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(dto);
    }

    @PatchMapping("/{taskId}")
    public ResponseEntity<?> updateTask(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId,
            @RequestBody UpdateTaskRequest req) {

        Task task = taskRepo.findByIdAndProjectId(taskId, projectId).orElse(null);
        if (task == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        boolean isOwner = projectRepo.existsByIdAndOwnerId(projectId, user.getId());
        boolean isCreator = task.getCreatedBy().getId().equals(user.getId());
        boolean isAssignee = task.getAssignee() != null && task.getAssignee().getId().equals(user.getId());
        if (!isOwner && !isCreator && !isAssignee) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }

        String title = req.title() != null ? req.title().trim() : task.getTitle();
        String description = req.description() != null ? req.description().trim() : task.getDescription();
        String status = req.status() != null ? req.status() : task.getStatus().name();
        String priority = req.priority() != null ? req.priority() : task.getPriority().name();
        String assigneeId = req.assigneeId();
        String dueDate = req.dueDate();

        Map<String, String> errors = validateTaskInput(title, status, priority, assigneeId, dueDate, true, false);
        if (!errors.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "validation failed", "fields", errors));
        }

        // Capture old values before mutation for activity logging
        String oldTitle = task.getTitle();
        String oldStatus = task.getStatus().name();
        String oldPriority = task.getPriority().name();
        String oldType = task.getType();
        UUID oldAssigneeId = task.getAssignee() != null ? task.getAssignee().getId() : null;
        String oldAssigneeName = oldAssigneeId != null
                ? userRepo.findById(oldAssigneeId).map(User::getName).orElse("Unknown") : null;
        LocalDate oldDueDate = task.getDueDate();
        UUID oldSprintId = task.getSprint() != null ? task.getSprint().getId() : null;
        String oldSprintName = oldSprintId != null
                ? sprintRepo.findById(oldSprintId).map(Sprint::getName).orElse("Unknown") : null;

        task.setTitle(title);
        task.setDescription(description == null || description.isEmpty() ? null : description);
        task.setStatus(Task.TaskStatus.valueOf(status));
        task.setPriority(Task.TaskPriority.valueOf(priority));

        if (assigneeId != null) {
            if (assigneeId.isEmpty()) {
                task.setAssignee(null);
            } else {
                userRepo.findById(UUID.fromString(assigneeId)).ifPresent(task::setAssignee);
            }
        }
        if (dueDate != null) {
            task.setDueDate(dueDate.isEmpty() ? null : LocalDate.parse(dueDate));
        }
        if (req.type() != null && !req.type().isEmpty()) {
            task.setType(req.type());
        }
        if (req.parentId() != null) {
            if (req.parentId().isEmpty()) {
                task.setParent(null);
            } else {
                Task parent = taskRepo.findByIdAndProjectId(UUID.fromString(req.parentId()), projectId).orElse(null);
                if (parent != null && parent.getParent() == null && !parent.getId().equals(task.getId())) {
                    task.setParent(parent);
                }
            }
        }
        if (req.sprintId() != null) {
            if (req.sprintId().isEmpty()) {
                task.setSprint(null);
            } else {
                sprintRepo.findByIdAndProjectId(UUID.fromString(req.sprintId()), projectId)
                        .ifPresent(task::setSprint);
            }
        }
        task.setStoryPoints(req.storyPoints());

        task = taskRepo.save(task);

        // Capture new values after save for activity logging
        UUID newAssigneeId = task.getAssignee() != null ? task.getAssignee().getId() : null;
        String newAssigneeName = newAssigneeId != null
                ? userRepo.findById(newAssigneeId).map(User::getName).orElse("Unknown") : null;
        UUID newSprintId = task.getSprint() != null ? task.getSprint().getId() : null;
        String newSprintName = newSprintId != null
                ? sprintRepo.findById(newSprintId).map(Sprint::getName).orElse("Unknown") : null;

        // Log activity for each changed field
        if (!oldTitle.equals(task.getTitle())) {
            activityService.log(projectId, taskId, user.getId(), "title_changed",
                    ActivityService.payload("title", task.getTitle(), "from", oldTitle, "to", task.getTitle()));
        }
        if (!oldStatus.equals(task.getStatus().name())) {
            activityService.log(projectId, taskId, user.getId(), "status_changed",
                    ActivityService.payload("title", task.getTitle(), "from", oldStatus, "to", task.getStatus().name()));
        }
        if (!oldPriority.equals(task.getPriority().name())) {
            activityService.log(projectId, taskId, user.getId(), "priority_changed",
                    ActivityService.payload("title", task.getTitle(), "from", oldPriority, "to", task.getPriority().name()));
        }
        if (!oldType.equals(task.getType())) {
            activityService.log(projectId, taskId, user.getId(), "type_changed",
                    ActivityService.payload("title", task.getTitle(), "from", oldType, "to", task.getType()));
        }
        if (!Objects.equals(oldAssigneeId, newAssigneeId)) {
            activityService.log(projectId, taskId, user.getId(), "assignee_changed",
                    ActivityService.payload("title", task.getTitle(), "from", oldAssigneeName, "to", newAssigneeName));
            if (newAssigneeId != null && !newAssigneeId.equals(user.getId())) {
                notificationService.notify(newAssigneeId, "task_assigned",
                        NotificationService.payload(
                                "taskId", task.getId().toString(),
                                "taskTitle", task.getTitle(),
                                "projectId", projectId.toString(),
                                "assignedBy", user.getName()));
            }
        }
        if (!Objects.equals(oldDueDate, task.getDueDate())) {
            activityService.log(projectId, taskId, user.getId(), "due_date_changed",
                    ActivityService.payload("title", task.getTitle(),
                            "from", oldDueDate != null ? oldDueDate.toString() : null,
                            "to", task.getDueDate() != null ? task.getDueDate().toString() : null));
        }
        if (!Objects.equals(oldSprintId, newSprintId)) {
            activityService.log(projectId, taskId, user.getId(), "sprint_changed",
                    ActivityService.payload("title", task.getTitle(), "from", oldSprintName, "to", newSprintName));
        }

        TaskDto dto = TaskDto.from(task);
        broker.publish(projectId, new SseEvent("task_updated", dto));
        return ResponseEntity.ok(dto);
    }

    @PatchMapping("/{taskId}/position")
    public ResponseEntity<?> moveTask(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId,
            @RequestBody MoveTaskRequest req) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        Task task = taskRepo.findByIdAndProjectId(taskId, projectId).orElse(null);
        if (task == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));
        }
        if (req.status() != null && !req.status().isEmpty()) {
            if (!isValidStatus(req.status())) {
                return ResponseEntity.badRequest().body(Map.of("error", "invalid status"));
            }
            task.setStatus(Task.TaskStatus.valueOf(req.status()));
        }
        if (req.position() != null) {
            task.setPosition(req.position());
        }
        if (req.sprintId() != null) {
            if (req.sprintId().isEmpty()) {
                task.setSprint(null);
            } else {
                sprintRepo.findByIdAndProjectId(UUID.fromString(req.sprintId()), projectId)
                        .ifPresent(task::setSprint);
            }
        }
        task = taskRepo.save(task);
        TaskDto dto = TaskDto.from(task);
        broker.publish(projectId, new SseEvent("task_moved", dto));
        return ResponseEntity.ok(dto);
    }

    @DeleteMapping("/{taskId}")
    public ResponseEntity<?> deleteTask(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId) {

        Task task = taskRepo.findByIdAndProjectId(taskId, projectId).orElse(null);
        if (task == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        boolean isOwner = projectRepo.existsByIdAndOwnerId(projectId, user.getId());
        boolean isCreator = task.getCreatedBy().getId().equals(user.getId());
        if (!isOwner && !isCreator) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }
        String deletedTitle = task.getTitle();
        taskRepo.delete(task);
        broker.publish(projectId, new SseEvent("task_deleted", Map.of("id", taskId.toString(), "project_id", projectId.toString())));
        activityService.log(projectId, null, user.getId(), "task_deleted",
                ActivityService.payload("title", deletedTitle));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{taskId}/subtasks")
    public ResponseEntity<?> listSubtasks(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (taskRepo.findByIdAndProjectId(taskId, projectId).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));
        }
        List<TaskDto> subtasks = taskRepo.findByProjectIdAndParentId(projectId, taskId)
                .stream().map(TaskDto::from).toList();
        return ResponseEntity.ok(Map.of("subtasks", subtasks));
    }

    private Map<String, String> validateTaskInput(String title, String status, String priority,
                                                   String assigneeId, String dueDate, boolean titleRequired,
                                                   boolean dueDateRequired) {
        Map<String, String> errors = new LinkedHashMap<>();
        if (titleRequired && (title == null || title.trim().isEmpty())) {
            errors.put("title", "is required");
        }
        if (dueDateRequired && (dueDate == null || dueDate.trim().isEmpty())) {
            errors.put("due_date", "is required");
        }
        if (status != null && !status.isEmpty() && !isValidStatus(status)) {
            errors.put("status", "must be todo, in_progress, or done");
        }
        if (priority != null && !priority.isEmpty() && !isValidPriority(priority)) {
            errors.put("priority", "must be low, medium, or high");
        }
        if (assigneeId != null && !assigneeId.isEmpty()) {
            try { UUID.fromString(assigneeId); } catch (IllegalArgumentException e) {
                errors.put("assignee_id", "must be a valid user id");
            }
        }
        if (dueDate != null && !dueDate.isEmpty()) {
            try { LocalDate.parse(dueDate); } catch (Exception e) {
                errors.put("due_date", "must be YYYY-MM-DD");
            }
        }
        return errors;
    }

    private boolean isValidStatus(String s) {
        return s.equals("todo") || s.equals("in_progress") || s.equals("done")
                || s.equals("blocked") || s.equals("in_review");
    }

    private boolean isValidPriority(String s) {
        return s.equals("low") || s.equals("medium") || s.equals("high");
    }

    private UUID parseUuid(String s) {
        if (s == null || s.isEmpty()) return null;
        try { return UUID.fromString(s); } catch (Exception e) { return null; }
    }
}
