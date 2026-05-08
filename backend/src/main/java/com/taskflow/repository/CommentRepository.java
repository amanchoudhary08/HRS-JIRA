package com.taskflow.repository;

import com.taskflow.entity.Comment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CommentRepository extends JpaRepository<Comment, UUID> {

    @Query("SELECT c FROM Comment c JOIN FETCH c.task t JOIN FETCH t.project JOIN FETCH c.author WHERE c.task.id = :taskId ORDER BY c.createdAt ASC")
    List<Comment> findByTaskIdOrderByCreatedAtAsc(@Param("taskId") UUID taskId);

    @Query("SELECT c FROM Comment c JOIN FETCH c.task t JOIN FETCH t.project JOIN FETCH c.author WHERE c.id = :id")
    Optional<Comment> findByIdWithDetails(@Param("id") UUID id);
}
