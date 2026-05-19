package com.taskflow.repository;

import com.taskflow.entity.TaskLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface TaskLinkRepository extends JpaRepository<TaskLink, UUID> {

    @Query("SELECT l FROM TaskLink l WHERE l.source.id = :id OR l.target.id = :id")
    List<TaskLink> findByTaskId(@Param("id") UUID taskId);

    boolean existsBySource_IdAndTarget_IdAndLinkType(UUID sourceId, UUID targetId, TaskLink.LinkType linkType);

    void deleteBySource_IdAndTarget_IdAndLinkType(UUID sourceId, UUID targetId, TaskLink.LinkType linkType);
}
