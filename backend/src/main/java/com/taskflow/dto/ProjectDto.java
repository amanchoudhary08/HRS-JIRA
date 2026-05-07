package com.taskflow.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.taskflow.entity.Project;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record ProjectDto(
        UUID id,
        String name,
        String description,
        UUID ownerId,
        OffsetDateTime createdAt,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        List<ProjectMemberDto> members
) {
    /** Convenience factory — no members included (for creation response). */
    public static ProjectDto from(Project p) {
        return new ProjectDto(
                p.getId(),
                p.getName(),
                p.getDescription() != null ? p.getDescription() : "",
                p.getOwner().getId(),
                p.getCreatedAt(),
                null
        );
    }

    /** Factory including the pre-fetched member list. */
    public static ProjectDto withMembers(Project p, List<ProjectMemberDto> members) {
        return new ProjectDto(
                p.getId(),
                p.getName(),
                p.getDescription() != null ? p.getDescription() : "",
                p.getOwner().getId(),
                p.getCreatedAt(),
                members
        );
    }
}
