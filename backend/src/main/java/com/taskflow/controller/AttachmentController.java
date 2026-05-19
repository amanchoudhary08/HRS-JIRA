package com.taskflow.controller;

import com.taskflow.dto.AttachmentDto;
import com.taskflow.entity.Attachment;
import com.taskflow.entity.Task;
import com.taskflow.entity.User;
import com.taskflow.repository.AttachmentRepository;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.TaskRepository;
import com.taskflow.service.AttachmentService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/projects/{projectId}/tasks/{taskId}/attachments")
public class AttachmentController {

    private final ProjectRepository projectRepo;
    private final TaskRepository taskRepo;
    private final AttachmentRepository attachmentRepo;
    private final AttachmentService attachmentService;

    public AttachmentController(ProjectRepository projectRepo,
                                TaskRepository taskRepo,
                                AttachmentRepository attachmentRepo,
                                AttachmentService attachmentService) {
        this.projectRepo = projectRepo;
        this.taskRepo = taskRepo;
        this.attachmentRepo = attachmentRepo;
        this.attachmentService = attachmentService;
    }

    // ─── GET /projects/{projectId}/tasks/{taskId}/attachments ─────────────────

    @GetMapping
    public ResponseEntity<?> listAttachments(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (taskRepo.findByIdAndProjectId(taskId, projectId).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));
        }
        List<AttachmentDto> attachments = attachmentRepo.findByTaskIdOrderByCreatedAtAsc(taskId)
                .stream()
                .map(AttachmentDto::from)
                .toList();
        return ResponseEntity.ok(Map.of("attachments", attachments));
    }

    // ─── GET /projects/{projectId}/tasks/{taskId}/attachments/{id}/download ───

    @GetMapping("/{attachmentId}/download")
    public ResponseEntity<StreamingResponseBody> downloadAttachment(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId,
            @PathVariable UUID attachmentId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        if (taskRepo.findByIdAndProjectId(taskId, projectId).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
        Attachment attachment = attachmentRepo.findByIdAndTaskId(attachmentId, taskId).orElse(null);
        if (attachment == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        StreamingResponseBody body = outputStream -> {
            try (InputStream in = attachmentService.getObject(attachment.getStorageKey())) {
                in.transferTo(outputStream);
            } catch (IOException e) {
                throw e;
            } catch (Exception e) {
                throw new IOException("Failed to stream attachment", e);
            }
        };

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\"" + attachment.getFilename().replace("\"", "") + "\"")
                .contentType(MediaType.parseMediaType(attachment.getMimeType()))
                .contentLength(attachment.getSizeBytes())
                .body(body);
    }

    // ─── POST /projects/{projectId}/tasks/{taskId}/attachments ────────────────

    @PostMapping
    public ResponseEntity<?> uploadAttachment(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId,
            @RequestParam("file") MultipartFile file) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        Task task = taskRepo.findByIdAndProjectId(taskId, projectId).orElse(null);
        if (task == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));
        }

        String storageKey;
        try {
            storageKey = attachmentService.upload(file);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Upload failed: " + e.getMessage()));
        }

        Attachment attachment = new Attachment();
        attachment.setTask(task);
        attachment.setUploadedBy(user);
        attachment.setFilename(file.getOriginalFilename() != null ? file.getOriginalFilename() : "file");
        attachment.setMimeType(file.getContentType() != null ? file.getContentType() : "application/octet-stream");
        attachment.setSizeBytes(file.getSize());
        attachment.setStorageKey(storageKey);
        Attachment saved = attachmentRepo.save(attachment);

        return ResponseEntity.status(HttpStatus.CREATED).body(AttachmentDto.from(saved));
    }

    // ─── DELETE /projects/{projectId}/tasks/{taskId}/attachments/{id} ─────────

    @DeleteMapping("/{attachmentId}")
    public ResponseEntity<?> deleteAttachment(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID taskId,
            @PathVariable UUID attachmentId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (taskRepo.findByIdAndProjectId(taskId, projectId).isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "task not found"));
        }

        Attachment attachment = attachmentRepo.findByIdAndTaskId(attachmentId, taskId).orElse(null);
        if (attachment == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "attachment not found"));
        }

        boolean isUploader = attachment.getUploadedBy().getId().equals(user.getId());
        boolean isOwner = projectRepo.existsByIdAndOwnerId(projectId, user.getId());
        if (!isUploader && !isOwner) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }

        try {
            attachmentService.delete(attachment.getStorageKey());
        } catch (Exception ignored) {
        }
        attachmentRepo.delete(attachment);
        return ResponseEntity.noContent().build();
    }
}
