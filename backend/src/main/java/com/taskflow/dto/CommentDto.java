package com.taskflow.dto;

import com.taskflow.entity.Comment;

import java.time.OffsetDateTime;
import java.util.UUID;

public record CommentDto(
        UUID id,
        UUID taskId,
        UUID projectId,
        UUID authorId,
        String authorName,
        String body,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
    public static CommentDto from(Comment c) {
        return new CommentDto(
                c.getId(),
                c.getTask().getId(),
                c.getTask().getProject().getId(),
                c.getAuthor().getId(),
                c.getAuthor().getName(),
                c.getBody(),
                c.getCreatedAt(),
                c.getUpdatedAt()
        );
    }
}
