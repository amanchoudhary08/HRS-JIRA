package com.taskflow.dto;

import com.taskflow.entity.Notification;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

public record NotificationDto(
        UUID id,
        UUID userId,
        String type,
        Map<String, Object> payload,
        boolean read,
        OffsetDateTime createdAt
) {
    public static NotificationDto from(Notification n) {
        return new NotificationDto(
                n.getId(),
                n.getUser().getId(),
                n.getType(),
                n.getPayload(),
                n.isRead(),
                n.getCreatedAt()
        );
    }
}
