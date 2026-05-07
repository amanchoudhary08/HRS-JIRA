package com.taskflow.repository;

import com.taskflow.entity.Project;
import com.taskflow.entity.ProjectMember;
import com.taskflow.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ProjectMemberRepository extends JpaRepository<ProjectMember, UUID> {

    @Query("SELECT pm FROM ProjectMember pm JOIN FETCH pm.user WHERE pm.project.id = :projectId ORDER BY pm.joinedAt ASC")
    List<ProjectMember> findByProjectIdWithUser(@Param("projectId") UUID projectId);

    @Query("SELECT pm FROM ProjectMember pm WHERE pm.project.id = :projectId AND pm.user.id = :userId")
    Optional<ProjectMember> findByProjectIdAndUserId(@Param("projectId") UUID projectId, @Param("userId") UUID userId);

    boolean existsByProjectAndUser(Project project, User user);

    @Query("SELECT pm FROM ProjectMember pm JOIN FETCH pm.user WHERE pm.project.id IN :projectIds ORDER BY pm.joinedAt ASC")
    List<ProjectMember> findByProjectIdIn(@Param("projectIds") List<UUID> projectIds);
}
