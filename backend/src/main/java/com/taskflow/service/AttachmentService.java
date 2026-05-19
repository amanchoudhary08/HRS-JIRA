package com.taskflow.service;

import io.minio.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

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

    private final MinioClient minioClient;
    private final String bucket;

    public AttachmentService(MinioClient minioClient,
                             @Value("${app.minio.bucket}") String bucket) {
        this.minioClient = minioClient;
        this.bucket = bucket;
    }

    /** Validate, upload to MinIO, and return the generated storage key. */
    public String upload(MultipartFile file) throws Exception {
        if (file.getSize() > MAX_SIZE_BYTES) {
            throw new IllegalArgumentException("File exceeds the 50 MB limit.");
        }
        String mime = file.getContentType() != null ? file.getContentType() : "application/octet-stream";
        if (!isMimeAllowed(mime)) {
            throw new IllegalArgumentException("File type not allowed: " + mime);
        }
        ensureBucketExists();
        String key = UUID.randomUUID() + "/" + sanitizeFilename(file.getOriginalFilename());
        try (InputStream in = file.getInputStream()) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(key)
                    .stream(in, file.getSize(), -1)
                    .contentType(mime)
                    .build());
        }
        return key;
    }

    /** Stream an object from MinIO directly — used by the download proxy endpoint. */
    public InputStream getObject(String storageKey) throws Exception {
        return minioClient.getObject(GetObjectArgs.builder()
                .bucket(bucket)
                .object(storageKey)
                .build());
    }

    /** Delete an object from MinIO by its storage key. */
    public void delete(String storageKey) throws Exception {
        minioClient.removeObject(RemoveObjectArgs.builder()
                .bucket(bucket)
                .object(storageKey)
                .build());
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private void ensureBucketExists() throws Exception {
        boolean exists = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build());
        if (!exists) {
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
        }
    }

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

