package com.taskflow.repository;

import com.taskflow.entity.Attachment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AttachmentRepository extends JpaRepository<Attachment, UUID> {

    @Query("SELECT a FROM Attachment a JOIN FETCH a.uploadedBy WHERE a.task.id = :taskId ORDER BY a.createdAt ASC")
    List<Attachment> findByTaskIdOrderByCreatedAtAsc(UUID taskId);

    @Query("SELECT a FROM Attachment a JOIN FETCH a.uploadedBy WHERE a.id = :id AND a.task.id = :taskId")
    Optional<Attachment> findByIdAndTaskId(UUID id, UUID taskId);
}
