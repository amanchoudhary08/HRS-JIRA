package com.taskflow.dto;

import com.taskflow.entity.Task;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public record TaskDto(
        UUID id,
        String title,
        String description,
        String status,
        String priority,
        UUID projectId,
        UUID assigneeId,
        UUID createdBy,
        LocalDate dueDate,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
    public static TaskDto from(Task t) {
        return new TaskDto(
                t.getId(),
                t.getTitle(),
                t.getDescription() != null ? t.getDescription() : "",
                t.getStatus().name(),
                t.getPriority().name(),
                t.getProject().getId(),
                t.getAssignee() != null ? t.getAssignee().getId() : null,
                t.getCreatedBy().getId(),
                t.getDueDate(),
                t.getCreatedAt(),
                t.getUpdatedAt()
        );
    }
}
