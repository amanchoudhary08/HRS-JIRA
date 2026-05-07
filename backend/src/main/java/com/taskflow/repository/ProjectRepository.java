package com.taskflow.repository;

import com.taskflow.entity.Project;
import com.taskflow.entity.ProjectMember;
import com.taskflow.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface ProjectRepository extends JpaRepository<Project, UUID> {

    @Query(value = """
        SELECT DISTINCT p FROM Project p
        LEFT JOIN Task t ON t.project = p
        WHERE p.owner = :user
           OR t.assignee = :user
           OR EXISTS (SELECT pm FROM ProjectMember pm WHERE pm.project = p AND pm.user = :user)
        """,
        countQuery = """
        SELECT COUNT(DISTINCT p) FROM Project p
        LEFT JOIN Task t ON t.project = p
        WHERE p.owner = :user
           OR t.assignee = :user
           OR EXISTS (SELECT pm FROM ProjectMember pm WHERE pm.project = p AND pm.user = :user)
        """)
    Page<Project> findAccessibleByUser(@Param("user") User user, Pageable pageable);

    @Query("""
        SELECT CASE WHEN COUNT(p) > 0 THEN true ELSE false END
        FROM Project p
        LEFT JOIN Task t ON t.project = p
        WHERE p.id = :projectId AND (
            p.owner.id = :userId
            OR t.assignee.id = :userId
            OR EXISTS (SELECT pm FROM ProjectMember pm WHERE pm.project = p AND pm.user.id = :userId)
        )
        """)
    boolean existsAccessibleByUserAndId(@Param("projectId") UUID projectId, @Param("userId") UUID userId);

    boolean existsByIdAndOwnerId(UUID id, UUID ownerId);
}
