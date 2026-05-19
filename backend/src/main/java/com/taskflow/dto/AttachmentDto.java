package com.taskflow.dto;

import com.taskflow.entity.Attachment;

import java.time.OffsetDateTime;
import java.util.UUID;

public record AttachmentDto(
        UUID id,
        UUID taskId,
        UUID uploadedById,
        String uploadedByName,
        String filename,
        String mimeType,
        long sizeBytes,
        OffsetDateTime createdAt,
        String url
) {
    /** Build without a presigned URL (used internally). */
    public static AttachmentDto from(Attachment a) {
        return new AttachmentDto(
                a.getId(),
                a.getTask().getId(),
                a.getUploadedBy().getId(),
                a.getUploadedBy().getName(),
                a.getFilename(),
                a.getMimeType(),
                a.getSizeBytes(),
                a.getCreatedAt(),
                null
        );
    }

    /** Build with a presigned URL supplied by AttachmentService. */
    public static AttachmentDto withUrl(Attachment a, String url) {
        return new AttachmentDto(
                a.getId(),
                a.getTask().getId(),
                a.getUploadedBy().getId(),
                a.getUploadedBy().getName(),
                a.getFilename(),
                a.getMimeType(),
                a.getSizeBytes(),
                a.getCreatedAt(),
                url
        );
    }
}
