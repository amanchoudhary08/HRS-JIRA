package com.taskflow.repository;

import com.taskflow.entity.Label;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LabelRepository extends JpaRepository<Label, UUID> {

    List<Label> findByProjectIdOrderByName(UUID projectId);

    Optional<Label> findByIdAndProjectId(UUID id, UUID projectId);

    boolean existsByProjectIdAndName(UUID projectId, String name);
}
