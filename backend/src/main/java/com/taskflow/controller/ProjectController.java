package com.taskflow.controller;

import com.taskflow.dto.ProjectDto;
import com.taskflow.dto.ProjectMemberDto;
import com.taskflow.dto.TaskDto;
import com.taskflow.entity.Project;
import com.taskflow.entity.ProjectMember;
import com.taskflow.entity.Task;
import com.taskflow.entity.User;
import com.taskflow.repository.ProjectMemberRepository;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.TaskRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/projects")
public class ProjectController {

    private final ProjectRepository projectRepo;
    private final TaskRepository taskRepo;
    private final ProjectMemberRepository memberRepo;

    public ProjectController(ProjectRepository projectRepo,
                             TaskRepository taskRepo,
                             ProjectMemberRepository memberRepo) {
        this.projectRepo = projectRepo;
        this.taskRepo = taskRepo;
        this.memberRepo = memberRepo;
    }

    public record CreateProjectRequest(
            @NotBlank(message = "is required") String name,
            String description
    ) {}

    public record UpdateProjectRequest(String name, String description) {}

    @GetMapping
    public ResponseEntity<Map<String, Object>> listProjects(
            @AuthenticationPrincipal User user,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit) {

        limit = Math.min(limit, 100);
        PageRequest pr = PageRequest.of(page - 1, limit, Sort.by("createdAt").descending());
        Page<Project> result = projectRepo.findAccessibleByUser(user, pr);

        List<UUID> projectIds = result.getContent().stream().map(Project::getId).toList();

        // Batch-fetch members for all returned projects in one query
        Map<UUID, List<ProjectMemberDto>> membersByProject = Collections.emptyMap();
        if (!projectIds.isEmpty()) {
            membersByProject = memberRepo.findByProjectIdIn(projectIds).stream()
                    .collect(Collectors.groupingBy(
                            pm -> pm.getProject().getId(),
                            Collectors.mapping(ProjectMemberDto::from, Collectors.toList())
                    ));
        }

        Map<UUID, List<ProjectMemberDto>> finalMembersByProject = membersByProject;
        List<ProjectDto> dtos = result.getContent().stream()
                .map(p -> ProjectDto.withMembers(p, finalMembersByProject.getOrDefault(p.getId(), List.of())))
                .toList();

        return ResponseEntity.ok(Map.of(
                "projects", dtos,
                "page", page,
                "limit", limit,
                "total", result.getTotalElements()
        ));
    }

    @PostMapping
    public ResponseEntity<ProjectDto> createProject(
            @AuthenticationPrincipal User user,
            @Valid @RequestBody CreateProjectRequest req) {

        Project p = new Project();
        p.setName(req.name().trim());
        p.setDescription(req.description() != null ? req.description().trim() : null);
        p.setOwner(user);
        p = projectRepo.save(p);

        // Seed the creator as an 'owner' member
        ProjectMember ownerMembership = new ProjectMember();
        ownerMembership.setProject(p);
        ownerMembership.setUser(user);
        ownerMembership.setRole("owner");
        memberRepo.save(ownerMembership);

        return ResponseEntity.status(HttpStatus.CREATED).body(ProjectDto.from(p));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getProject(
            @AuthenticationPrincipal User user,
            @PathVariable UUID id) {

        if (!projectRepo.existsAccessibleByUserAndId(id, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        Project p = projectRepo.findById(id).orElse(null);
        if (p == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        List<Task> tasks = taskRepo.findTop1000ByProjectIdOrderByCreatedAtDesc(id);
        List<TaskDto> taskDtos = tasks.stream().map(TaskDto::from).toList();
        List<ProjectMemberDto> members = memberRepo.findByProjectIdWithUser(id)
                .stream().map(ProjectMemberDto::from).toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", p.getId());
        body.put("name", p.getName());
        body.put("description", p.getDescription() != null ? p.getDescription() : "");
        body.put("owner_id", p.getOwner().getId());
        body.put("created_at", p.getCreatedAt());
        body.put("tasks", taskDtos);
        body.put("members", members);
        return ResponseEntity.ok(body);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<?> updateProject(
            @AuthenticationPrincipal User user,
            @PathVariable UUID id,
            @RequestBody UpdateProjectRequest req) {

        if (!projectRepo.existsByIdAndOwnerId(id, user.getId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }
        Project p = projectRepo.findById(id).orElse(null);
        if (p == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (req.name() != null) {
            String trimmed = req.name().trim();
            if (trimmed.isEmpty()) {
                return ResponseEntity.badRequest().body(Map.of("error", "validation failed", "fields", Map.of("name", "is required")));
            }
            p.setName(trimmed);
        }
        if (req.description() != null) {
            p.setDescription(req.description().trim().isEmpty() ? null : req.description().trim());
        }
        p = projectRepo.save(p);
        return ResponseEntity.ok(ProjectDto.from(p));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteProject(
            @AuthenticationPrincipal User user,
            @PathVariable UUID id) {

        if (!projectRepo.existsByIdAndOwnerId(id, user.getId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }
        projectRepo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/stats")
    public ResponseEntity<?> projectStats(
            @AuthenticationPrincipal User user,
            @PathVariable UUID id) {

        if (!projectRepo.existsAccessibleByUserAndId(id, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        Map<String, Integer> byStatus = new LinkedHashMap<>();
        byStatus.put("todo", 0);
        byStatus.put("in_progress", 0);
        byStatus.put("done", 0);
        for (Object[] row : taskRepo.countByStatusForProject(id)) {
            byStatus.put(row[0].toString(), ((Number) row[1]).intValue());
        }

        List<Map<String, Object>> byAssignee = new ArrayList<>();
        for (Object[] row : taskRepo.countByAssigneeForProject(id)) {
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("assignee_id", row[0] != null ? row[0].toString() : "");
            entry.put("name", row[1]);
            entry.put("count", ((Number) row[2]).intValue());
            byAssignee.add(entry);
        }
        return ResponseEntity.ok(Map.of("by_status", byStatus, "by_assignee", byAssignee));
    }
}
