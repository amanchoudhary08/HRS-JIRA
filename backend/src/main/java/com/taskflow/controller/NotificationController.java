package com.taskflow.controller;

import com.taskflow.dto.NotificationDto;
import com.taskflow.entity.Notification;
import com.taskflow.entity.User;
import com.taskflow.repository.NotificationRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/notifications")
public class NotificationController {

    private final NotificationRepository notificationRepo;

    public NotificationController(NotificationRepository notificationRepo) {
        this.notificationRepo = notificationRepo;
    }

    /** GET /notifications?page=1&limit=20 — paginated, unread first */
    @GetMapping
    public ResponseEntity<?> list(
            @AuthenticationPrincipal User user,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int limit) {

        limit = Math.min(limit, 100);
        PageRequest pr = PageRequest.of(page - 1, limit);
        Page<Notification> result = notificationRepo.findByUserIdOrderByReadAscCreatedAtDesc(user.getId(), pr);
        List<NotificationDto> dtos = result.getContent().stream().map(NotificationDto::from).toList();
        return ResponseEntity.ok(Map.of(
                "notifications", dtos,
                "page", page,
                "limit", limit,
                "total", result.getTotalElements()
        ));
    }

    /** GET /notifications/count — unread count only */
    @GetMapping("/count")
    public ResponseEntity<?> count(@AuthenticationPrincipal User user) {
        long unread = notificationRepo.countByUserIdAndReadFalse(user.getId());
        return ResponseEntity.ok(Map.of("unread", unread));
    }

    /** PATCH /notifications/{id}/read */
    @Transactional
    @PatchMapping("/{id}/read")
    public ResponseEntity<?> markRead(
            @AuthenticationPrincipal User user,
            @PathVariable UUID id) {

        Notification n = notificationRepo.findById(id).orElse(null);
        if (n == null || !n.getUser().getId().equals(user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        n.setRead(true);
        notificationRepo.save(n);
        return ResponseEntity.ok(NotificationDto.from(n));
    }

    /** PATCH /notifications/read-all */
    @Transactional
    @PatchMapping("/read-all")
    public ResponseEntity<?> markAllRead(@AuthenticationPrincipal User user) {
        notificationRepo.markAllReadForUser(user.getId());
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
