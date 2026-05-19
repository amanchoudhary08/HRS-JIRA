package com.taskflow.controller;

import com.taskflow.dto.SearchResultDto;
import com.taskflow.dto.TaskDto;
import com.taskflow.entity.Project;
import com.taskflow.entity.Task;
import com.taskflow.entity.User;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.TaskRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
public class SearchController {

    private final ProjectRepository projectRepo;
    private final TaskRepository taskRepo;

    public SearchController(ProjectRepository projectRepo, TaskRepository taskRepo) {
        this.projectRepo = projectRepo;
        this.taskRepo = taskRepo;
    }

    // ─── GET /projects/{id}/tasks/search?q= ──────────────────────────────────

    @GetMapping("/projects/{projectId}/tasks/search")
    @Transactional(readOnly = true)
    public ResponseEntity<?> searchInProject(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @RequestParam(defaultValue = "") String q) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (q.isBlank() || q.length() < 2) {
            return ResponseEntity.ok(Map.of("tasks", List.of()));
        }

        List<TaskDto> tasks = taskRepo
                .searchInProject(projectId, q, PageRequest.of(0, 20))
                .stream()
                .map(TaskDto::from)
                .toList();

        return ResponseEntity.ok(Map.of("tasks", tasks));
    }

    // ─── GET /search?q= — global search across all accessible projects ────────

    @GetMapping("/search")
    @Transactional(readOnly = true)
    public ResponseEntity<?> globalSearch(
            @AuthenticationPrincipal User user,
            @RequestParam(defaultValue = "") String q) {

        if (q.isBlank() || q.length() < 2) {
            return ResponseEntity.ok(Map.of("results", List.of()));
        }

        List<Project> projects = projectRepo
                .findAccessibleByUser(user, PageRequest.of(0, 100))
                .getContent();

        if (projects.isEmpty()) {
            return ResponseEntity.ok(Map.of("results", List.of()));
        }

        List<UUID> projectIds = projects.stream().map(Project::getId).toList();
        Map<UUID, String> projectNames = projects.stream()
                .collect(Collectors.toMap(Project::getId, Project::getName));

        List<Task> tasks = taskRepo.searchAcrossProjects(projectIds, q, PageRequest.of(0, 50));

        // Group tasks by project
        Map<UUID, List<Task>> byProject = tasks.stream()
                .collect(Collectors.groupingBy(t -> t.getProject().getId()));

        List<SearchResultDto> results = byProject.entrySet().stream()
                .map(e -> new SearchResultDto(
                        e.getKey(),
                        projectNames.getOrDefault(e.getKey(), "Unknown Project"),
                        e.getValue().stream().map(TaskDto::from).toList()
                ))
                .sorted(Comparator.comparing(SearchResultDto::projectName))
                .toList();

        return ResponseEntity.ok(Map.of("results", results));
    }
}
