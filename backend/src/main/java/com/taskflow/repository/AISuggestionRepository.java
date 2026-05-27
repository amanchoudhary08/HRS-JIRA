package com.taskflow.repository;

import com.taskflow.entity.AISuggestion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AISuggestionRepository extends JpaRepository<AISuggestion, UUID> {
    List<AISuggestion> findByTaskIdOrderByCreatedAtDesc(UUID taskId);
    void deleteByTaskId(UUID taskId);
}
