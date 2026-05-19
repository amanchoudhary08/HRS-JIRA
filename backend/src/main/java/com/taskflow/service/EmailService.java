package com.taskflow.service;

import com.taskflow.entity.Notification;
import com.taskflow.entity.User;
import com.taskflow.repository.NotificationRepository;
import com.taskflow.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class EmailService {

    private final JavaMailSender mailSender;
    private final NotificationRepository notificationRepo;
    private final UserRepository userRepo;

    @Value("${app.mail.from:noreply@taskflow.local}")
    private String fromAddress;

    @Value("${app.mail.enabled:false}")
    private boolean mailEnabled;

    @Value("${app.frontend-url:http://localhost:5173}")
    private String frontendUrl;

    public EmailService(JavaMailSender mailSender,
                        NotificationRepository notificationRepo,
                        UserRepository userRepo) {
        this.mailSender = mailSender;
        this.notificationRepo = notificationRepo;
        this.userRepo = userRepo;
    }

    /**
     * Hourly digest: for every user with unread notifications, send a summary email.
     * Only runs when {@code app.mail.enabled=true}.
     */
    @Scheduled(fixedDelay = 3_600_000) // every 1 hour
    @Transactional(readOnly = true)
    public void sendHourlyDigests() {
        if (!mailEnabled) return;

        List<User> users = userRepo.findAll();
        for (User user : users) {
            if (user.getEmail() == null || user.getEmail().isBlank()) continue;
            List<Notification> unread = notificationRepo.findUnreadByUserId(user.getId());
            if (unread.isEmpty()) continue;
            try {
                sendDigest(user, unread);
            } catch (Exception e) {
                // Mail failure must not propagate — log and continue
                System.err.println("Failed to send digest to " + user.getEmail() + ": " + e.getMessage());
            }
        }
    }

    private void sendDigest(User user, List<Notification> notifications) {
        StringBuilder sb = new StringBuilder();
        sb.append("Hi ").append(user.getName()).append(",\n\n");
        sb.append("You have ").append(notifications.size()).append(" unread notification(s) on TaskFlow:\n\n");

        for (Notification n : notifications) {
            sb.append("• ").append(formatMessage(n)).append("\n");
        }

        sb.append("\nVisit TaskFlow: ").append(frontendUrl).append("\n\n");
        sb.append("You are receiving this because you have unread notifications.\n");

        SimpleMailMessage msg = new SimpleMailMessage();
        msg.setFrom(fromAddress);
        msg.setTo(user.getEmail());
        msg.setSubject("TaskFlow — " + notifications.size() + " unread notification(s)");
        msg.setText(sb.toString());
        mailSender.send(msg);
    }

    private String formatMessage(Notification n) {
        String type = n.getType();
        var p = n.getPayload();
        return switch (type) {
            case "task_assigned" -> "Task \"" + p.getOrDefault("taskTitle", "unknown") + "\" was assigned to you by " + p.getOrDefault("assignedBy", "someone");
            case "comment_added"  -> p.getOrDefault("commentBy", "Someone") + " commented on task \"" + p.getOrDefault("taskTitle", "unknown") + "\"";
            default -> "You have a new " + type + " notification";
        };
    }
}
