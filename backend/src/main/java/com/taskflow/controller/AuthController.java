package com.taskflow.controller;

import com.taskflow.dto.UserDto;
import com.taskflow.entity.User;
import com.taskflow.repository.UserRepository;
import com.taskflow.security.JwtUtil;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

@RestController
public class AuthController {

    private final UserRepository userRepo;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    public AuthController(UserRepository userRepo, PasswordEncoder passwordEncoder, JwtUtil jwtUtil) {
        this.userRepo = userRepo;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    public record RegisterRequest(
            @NotBlank(message = "is required") String name,
            @NotBlank(message = "is required") @Email String email,
            @Size(min = 8, message = "must be at least 8 characters") String password
    ) {}

    public record LoginRequest(
            @NotBlank(message = "is required") String email,
            @NotBlank(message = "is required") String password
    ) {}

    @PostMapping("/auth/register")
    public ResponseEntity<Map<String, Object>> register(@Valid @RequestBody RegisterRequest req) {
        User user = new User();
        user.setName(req.name().trim());
        user.setEmail(req.email().trim().toLowerCase());
        user.setPassword(passwordEncoder.encode(req.password()));
        try {
            user = userRepo.save(user);
        } catch (DataIntegrityViolationException e) {
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("error", "validation failed");
            err.put("fields", Map.of("email", "is already registered"));
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(err);
        }
        String token = jwtUtil.generateToken(user);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("token", token, "user", UserDto.from(user)));
    }

    @PostMapping("/auth/login")
    public ResponseEntity<Map<String, Object>> login(@Valid @RequestBody LoginRequest req) {
        String identifier = req.email().trim().toLowerCase();
        // Try email first, then emp_id
        User user = userRepo.findByEmail(identifier)
                .or(() -> userRepo.findByEmpId(identifier))
                .orElse(null);
        if (user == null || !passwordEncoder.matches(req.password(), user.getPassword())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "unauthorized"));
        }
        String token = jwtUtil.generateToken(user);
        return ResponseEntity.ok(Map.of("token", token, "user", UserDto.from(user)));
    }

    @GetMapping("/auth/sse-token")
    public ResponseEntity<Map<String, Object>> sseToken(@AuthenticationPrincipal User user) {
        String token = jwtUtil.generateSseToken(user);
        return ResponseEntity.ok(Map.of("token", token, "expiresIn", 120));
    }

    @GetMapping("/users")
    public ResponseEntity<Map<String, Object>> listUsers(@AuthenticationPrincipal User currentUser) {
        List<UserDto> users = userRepo.findAll().stream()
                .sorted((a, b) -> a.getName().compareToIgnoreCase(b.getName()))
                .map(UserDto::from)
                .toList();
        return ResponseEntity.ok(Map.of("users", users));
    }

    @GetMapping("/users/search")
    public ResponseEntity<Map<String, Object>> searchUsers(
            @AuthenticationPrincipal User currentUser,
            @RequestParam(defaultValue = "") String q) {
        if (q.isBlank()) {
            return ResponseEntity.ok(Map.of("users", List.of()));
        }
        String term = q.trim();
        java.util.Set<java.util.UUID> seen = new java.util.LinkedHashSet<>();
        List<UserDto> users = Stream.concat(
                userRepo.findByNameContainingIgnoreCase(term).stream(),
                userRepo.findByEmailContainingIgnoreCase(term).stream()
        )
                .filter(u -> seen.add(u.getId()))
                .limit(10)
                .map(UserDto::from)
                .toList();
        return ResponseEntity.ok(Map.of("users", users));
    }
}
