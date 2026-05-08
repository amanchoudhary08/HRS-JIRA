package com.taskflow.repository;

import com.taskflow.entity.Sprint;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SprintRepository extends JpaRepository<Sprint, UUID> {

    List<Sprint> findByProjectIdOrderByCreatedAtAsc(UUID projectId);

    Optional<Sprint> findByIdAndProjectId(UUID id, UUID projectId);
}
