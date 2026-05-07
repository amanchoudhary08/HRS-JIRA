package com.taskflow.repository;

import com.taskflow.entity.Task;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

public interface TaskRepository extends JpaRepository<Task, UUID> {

    Page<Task> findByProjectId(UUID projectId, Pageable pageable);

    Page<Task> findByProjectIdAndStatus(UUID projectId, Task.TaskStatus status, Pageable pageable);

    Page<Task> findByProjectIdAndAssigneeId(UUID projectId, UUID assigneeId, Pageable pageable);

    Page<Task> findByProjectIdAndStatusAndAssigneeId(UUID projectId, Task.TaskStatus status, UUID assigneeId, Pageable pageable);

    List<Task> findTop1000ByProjectIdOrderByCreatedAtDesc(UUID projectId);

    @Query("SELECT t.status as status, COUNT(t) as count FROM Task t WHERE t.project.id = :projectId GROUP BY t.status")
    List<Object[]> countByStatusForProject(@Param("projectId") UUID projectId);

    @Query("""
        SELECT COALESCE(u.id, null) as assigneeId, COALESCE(u.name, 'Unassigned') as name, COUNT(t) as count
        FROM Task t
        LEFT JOIN t.assignee u
        WHERE t.project.id = :projectId
        GROUP BY u.id, u.name
        ORDER BY u.name
        """)
    List<Object[]> countByAssigneeForProject(@Param("projectId") UUID projectId);

    Optional<Task> findByIdAndProjectId(UUID id, UUID projectId);
}
