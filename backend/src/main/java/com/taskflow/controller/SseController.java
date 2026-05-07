package com.taskflow.controller;

import com.taskflow.entity.User;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.UserRepository;
import com.taskflow.security.JwtUtil;
import com.taskflow.sse.EventBroker;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
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

    @GetMapping
    public SseEmitter stream(
            @PathVariable UUID projectId,
            @RequestParam(required = false) String token,
            HttpServletResponse response) throws IOException {

        if (token == null || token.isEmpty()) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "unauthorized");
            return null;
        }
        User user;
        try {
            UUID userId = jwtUtil.extractUserId(token);
            String email = jwtUtil.extractEmail(token);
            user = userRepo.findById(userId).orElse(null);
            if (user == null || !user.getEmail().equals(email)) {
                response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "unauthorized");
                return null;
            }
        } catch (Exception e) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "unauthorized");
            return null;
        }
        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            response.sendError(HttpServletResponse.SC_NOT_FOUND, "not found");
            return null;
        }

        SseEmitter emitter = broker.subscribe(projectId);
        try {
            emitter.send(SseEmitter.event().comment("connected"));
        } catch (IOException e) {
            emitter.complete();
        }
        return emitter;
    }
}
