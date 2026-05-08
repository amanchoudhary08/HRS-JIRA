package com.taskflow.dto;

import com.taskflow.entity.Sprint;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

public record SprintDto(
        UUID id,
        UUID projectId,
        String name,
        String goal,
        LocalDate startDate,
        LocalDate endDate,
        String status,
        OffsetDateTime createdAt
) {
    public static SprintDto from(Sprint s) {
        return new SprintDto(
                s.getId(),
                s.getProject().getId(),
                s.getName(),
                s.getGoal(),
                s.getStartDate(),
                s.getEndDate(),
                s.getStatus(),
                s.getCreatedAt()
        );
    }
}
