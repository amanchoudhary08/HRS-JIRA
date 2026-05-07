package com.taskflow.controller;

import com.taskflow.entity.User;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.UserRepository;
import com.taskflow.security.JwtUtil;
import com.taskflow.sse.EventBroker;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/projects/{projectId}/events")
public class SseController {

    private final JwtUtil jwtUtil;
    private final UserRepository userRepo;
    private final ProjectRepository projectRepo;
    private final EventBroker broker;

    public SseController(JwtUtil jwtUtil, UserRepository userRepo,
                         ProjectRepository projectRepo, EventBroker broker) {
        this.jwtUtil = jwtUtil;
        this.userRepo = userRepo;
        this.projectRepo = projectRepo;
        this.broker = broker;
    }

    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<?> stream(
            @PathVariable UUID projectId,
            @RequestParam(required = false) String token) {

        if (token == null || token.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "unauthorized"));
        }
        User user;
        try {
            UUID userId = jwtUtil.extractUserId(token);
            String email = jwtUtil.extractEmail(token);
            user = userRepo.findById(userId).orElse(null);
            if (user == null || !user.getEmail().equals(email)) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "unauthorized"));
            }
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "unauthorized"));
        }
        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }

        SseEmitter emitter = broker.subscribe(projectId);
        // Send initial connection comment
        try {
            emitter.send(SseEmitter.event().comment("connected"));
        } catch (IOException e) {
            emitter.complete();
        }
        return ResponseEntity.ok().contentType(MediaType.TEXT_EVENT_STREAM).body(emitter);
    }
}
