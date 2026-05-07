package com.taskflow.repository;

import com.taskflow.entity.Project;
import com.taskflow.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface ProjectRepository extends JpaRepository<Project, UUID> {

    @Query("""
        SELECT DISTINCT p FROM Project p
        LEFT JOIN Task t ON t.project = p
        WHERE p.owner = :user OR t.assignee = :user
        ORDER BY p.createdAt DESC
        """)
    Page<Project> findAccessibleByUser(@Param("user") User user, Pageable pageable);

    @Query("""
        SELECT COUNT(DISTINCT p.id) FROM Project p
        LEFT JOIN Task t ON t.project = p
        WHERE p.owner = :user OR t.assignee = :user
        """)
    long countAccessibleByUser(@Param("user") User user);

    @Query("""
        SELECT CASE WHEN COUNT(p) > 0 THEN true ELSE false END
        FROM Project p
        LEFT JOIN Task t ON t.project = p
        WHERE p.id = :projectId AND (p.owner.id = :userId OR t.assignee.id = :userId)
        """)
    boolean existsAccessibleByUserAndId(@Param("projectId") UUID projectId, @Param("userId") UUID userId);

    boolean existsByIdAndOwnerId(UUID id, UUID ownerId);
}
