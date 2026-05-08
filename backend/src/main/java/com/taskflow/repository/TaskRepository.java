package com.taskflow.repository;

import com.taskflow.entity.Task;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
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

    List<Task> findByProjectIdAndParentId(UUID projectId, UUID parentId);

    // Stats: count tasks grouped by type
    @Query("SELECT t.type, COUNT(t) FROM Task t WHERE t.project.id = :projectId GROUP BY t.type ORDER BY COUNT(t) DESC")
    List<Object[]> countByTypeForProject(@Param("projectId") UUID projectId);

    // Stats: count tasks grouped by sprint (null sprint = Backlog)
    @Query("""
        SELECT COALESCE(s.name, 'Backlog') as sprintName, COUNT(t) as count
        FROM Task t
        LEFT JOIN t.sprint s
        WHERE t.project.id = :projectId AND t.parent IS NULL
        GROUP BY s.name
        ORDER BY COUNT(t) DESC
        """)
    List<Object[]> countBySprintForProject(@Param("projectId") UUID projectId);

    // Stats: count tasks closed (status=done) per day for last N days
    @Query(value = """
        SELECT CAST(updated_at AS date) as day, COUNT(*) as count
        FROM tasks
        WHERE project_id = :projectId
          AND status = 'done'
          AND updated_at >= :since
        GROUP BY CAST(updated_at AS date)
        ORDER BY day
        """, nativeQuery = true)
    List<Object[]> countDonePerDaySince(@Param("projectId") UUID projectId, @Param("since") LocalDate since);

    // Stats: count overdue tasks (due_date < today and status != done)
    @Query("SELECT COUNT(t) FROM Task t WHERE t.project.id = :projectId AND t.dueDate < :today AND t.status <> 'done'")
    long countOverdueForProject(@Param("projectId") UUID projectId, @Param("today") LocalDate today);
}
