package com.taskflow.dto;

import com.taskflow.entity.ActivityEvent;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

public record ActivityEventDto(
        UUID id,
        UUID projectId,
        UUID taskId,
        UUID actorId,
        String actorName,
        String type,
        Map<String, Object> payload,
        OffsetDateTime createdAt
) {
    public static ActivityEventDto from(ActivityEvent e) {
        return new ActivityEventDto(
                e.getId(),
                e.getProject().getId(),
                e.getTask() != null ? e.getTask().getId() : null,
                e.getActor().getId(),
                e.getActor().getName(),
                e.getType(),
                e.getPayload(),
                e.getCreatedAt()
        );
    }
}
