package com.taskflow.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;

import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;

@Service
public class AttachmentService {

    private static final Logger log = LoggerFactory.getLogger(AttachmentService.class);

    private static final long MAX_SIZE_BYTES = 50L * 1024 * 1024; // 50 MB

    private static final java.util.Set<String> ALLOWED_MIME_PREFIXES = java.util.Set.of(
            "image/", "application/pdf", "text/"
    );
    private static final java.util.Set<String> ALLOWED_MIME_EXACT = java.util.Set.of(
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );

    private final S3Client s3Client;
    private final String bucket;

    public AttachmentService(S3Client s3Client,
                             @Value("${app.s3.bucket}") String bucket) {
        this.s3Client = s3Client;
        this.bucket = bucket;
    }

    /** Validate, upload to S3, and return the generated storage key. */
    public String upload(MultipartFile file) throws IOException {
        if (file.getSize() > MAX_SIZE_BYTES) {
            throw new IllegalArgumentException("File exceeds the 50 MB limit.");
        }
        String mime = file.getContentType() != null ? file.getContentType() : "application/octet-stream";
        if (!isMimeAllowed(mime)) {
            throw new IllegalArgumentException("File type not allowed: " + mime);
        }
        String key = UUID.randomUUID() + "/" + sanitizeFilename(file.getOriginalFilename());
        try (InputStream in = file.getInputStream()) {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(key)
                            .contentType(mime)
                            .contentLength(file.getSize())
                            .build(),
                    RequestBody.fromInputStream(in, file.getSize()));
        }
        return key;
    }

    /** Stream an object from S3 — used by the download proxy endpoint. */
    public InputStream getObject(String storageKey) {
        return s3Client.getObject(GetObjectRequest.builder()
                .bucket(bucket)
                .key(storageKey)
                .build());
    }

    /** Delete an object from S3 by its storage key. */
    public void delete(String storageKey) {
        s3Client.deleteObject(DeleteObjectRequest.builder()
                .bucket(bucket)
                .key(storageKey)
                .build());
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private boolean isMimeAllowed(String mime) {
        if (ALLOWED_MIME_EXACT.contains(mime)) return true;
        for (String prefix : ALLOWED_MIME_PREFIXES) {
            if (mime.startsWith(prefix)) return true;
        }
        return false;
    }

    private String sanitizeFilename(String name) {
        if (name == null || name.isBlank()) return "file";
        return name.replaceAll("[/\\\\\\x00]", "_");
    }
}


