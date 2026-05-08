package com.taskflow.repository;

import com.taskflow.entity.ActivityEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface ActivityEventRepository extends JpaRepository<ActivityEvent, UUID> {

    @Query("SELECT a FROM ActivityEvent a JOIN FETCH a.actor WHERE a.project.id = :projectId ORDER BY a.createdAt DESC")
    List<ActivityEvent> findByProjectIdOrderByCreatedAtDesc(@Param("projectId") UUID projectId, Pageable pageable);

    @Query("SELECT a FROM ActivityEvent a JOIN FETCH a.actor WHERE a.task.id = :taskId ORDER BY a.createdAt DESC")
    List<ActivityEvent> findByTaskIdOrderByCreatedAtDesc(@Param("taskId") UUID taskId);
}
