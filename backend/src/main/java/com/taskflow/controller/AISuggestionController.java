package com.taskflow.controller;

import com.taskflow.entity.AISuggestion;
import com.taskflow.entity.Task;
import com.taskflow.entity.User;
import com.taskflow.repository.AISuggestionRepository;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.TaskRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/projects/{projectId}/tasks/{taskId}/ai-suggestions")
public class AISuggestionController {

    private final ProjectRepository projectRepo;
    private final TaskRepository taskRepo;
    private final AISuggestionRepository suggestionRepo;

    public AISuggestionController(ProjectRepository projectRepo,
                                   TaskRepository taskRepo,
                                   AISuggestionRepository suggestionRepo) {
        this.projectRepo = projectRepo;
        this.taskRepo = taskRepo;
        this.suggestionRepo = suggestionRepo;
    }

    /** List all AI suggestions for a task. */
    @GetMapping
    public ResponseEntity<?> listSuggestions(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }

        Task task = taskRepo.findByIdAndProjectId(taskId, projectId).orElse(null);
        if (task == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }

        List<AISuggestion> suggestions = suggestionRepo.findByTaskIdOrderByCreatedAtDesc(taskId);
        List<Map<String, Object>> dtos = suggestions.stream().map(s -> Map.<String, Object>of(
                "id", s.getId(),
                "type", s.getType(),
                "content", s.getContent(),
                "accepted", s.isAccepted(),
                "created_at", s.getCreatedAt()
        )).toList();

        return ResponseEntity.ok(Map.of("suggestions", dtos));
    }

    /** Mark a suggestion as accepted (or dismissed — client decides). */
    @PatchMapping("/{suggestionId}/accept")
    public ResponseEntity<?> acceptSuggestion(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId,
            @PathVariable UUID suggestionId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }

        AISuggestion suggestion = suggestionRepo.findById(suggestionId).orElse(null);
        if (suggestion == null || !suggestion.getTask().getId().equals(taskId)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }

        suggestion.setAccepted(true);
        suggestionRepo.save(suggestion);

        return ResponseEntity.ok(Map.of("accepted", true));
    }
}
