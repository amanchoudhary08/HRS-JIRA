package com.taskflow.dto;

import com.taskflow.entity.Project;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ProjectDto(
        UUID id,
        String name,
        String description,
        UUID ownerId,
        OffsetDateTime createdAt
) {
    public static ProjectDto from(Project p) {
        return new ProjectDto(
                p.getId(),
                p.getName(),
                p.getDescription() != null ? p.getDescription() : "",
                p.getOwner().getId(),
                p.getCreatedAt()
        );
    }
}
