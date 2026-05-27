package com.taskflow.controller;

import com.taskflow.security.JwtUtil;
import io.jsonwebtoken.JwtException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/auth")
public class AuthVerifyController {

    private final JwtUtil jwtUtil;

    public AuthVerifyController(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    /**
     * Lightweight token validation endpoint — used by the HRS.AI FastAPI service
     * to verify that a JWT was issued by this Spring Boot instance.
     *
     * GET /auth/verify
     * Authorization: Bearer <token>
     *
     * 200 { "userId": "...", "valid": true }
     * 401 { "error": "invalid or expired token" }
     */
    @GetMapping("/verify")
    public ResponseEntity<Map<String, Object>> verify(
            @RequestHeader("Authorization") String authHeader) {
        try {
            String token = authHeader.startsWith("Bearer ")
                    ? authHeader.substring(7)
                    : authHeader;
            UUID userId = jwtUtil.extractUserId(token);
            return ResponseEntity.ok(Map.of("userId", userId.toString(), "valid", true));
        } catch (JwtException | IllegalArgumentException e) {
            return ResponseEntity.status(401)
                    .body(Map.of("error", "invalid or expired token", "valid", false));
        }
    }
}
