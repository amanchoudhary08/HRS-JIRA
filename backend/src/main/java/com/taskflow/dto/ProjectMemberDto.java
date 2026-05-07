package com.taskflow.dto;

import com.taskflow.entity.ProjectMember;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ProjectMemberDto(
        UUID projectId,
        UUID userId,
        String userName,
        String userEmail,
        String role,
        OffsetDateTime joinedAt
) {
    public static ProjectMemberDto from(ProjectMember pm) {
        return new ProjectMemberDto(
                pm.getProject().getId(),
                pm.getUser().getId(),
                pm.getUser().getName(),
                pm.getUser().getEmail(),
                pm.getRole(),
                pm.getJoinedAt()
        );
    }
}
