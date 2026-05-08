package com.taskflow.controller;

import com.taskflow.dto.ProjectMemberDto;
import com.taskflow.entity.Project;
import com.taskflow.entity.ProjectMember;
import com.taskflow.entity.User;
import com.taskflow.repository.ProjectMemberRepository;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.UserRepository;
import com.taskflow.service.ActivityService;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/projects/{projectId}/members")
public class ProjectMemberController {

    private static final Set<String> VALID_ROLES = Set.of("owner", "admin", "member", "viewer");

    private final ProjectRepository projectRepo;
    private final ProjectMemberRepository memberRepo;
    private final UserRepository userRepo;
    private final ActivityService activityService;

    public ProjectMemberController(ProjectRepository projectRepo,
                                   ProjectMemberRepository memberRepo,
                                   UserRepository userRepo,
                                   ActivityService activityService) {
        this.projectRepo = projectRepo;
        this.memberRepo = memberRepo;
        this.userRepo = userRepo;
        this.activityService = activityService;
    }

    public record InviteRequest(
            @NotBlank @Email String email,
            @Pattern(regexp = "owner|admin|member|viewer") String role
    ) {}

    public record UpdateRoleRequest(
            @NotBlank @Pattern(regexp = "owner|admin|member|viewer") String role
    ) {}

    // ─── GET /projects/{projectId}/members ────────────────────────────────────

    @GetMapping
    public ResponseEntity<?> listMembers(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId) {

        if (!projectRepo.existsAccessibleByUserAndId(projectId, user.getId())) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        List<ProjectMemberDto> members = memberRepo.findByProjectIdWithUser(projectId)
                .stream().map(ProjectMemberDto::from).toList();
        return ResponseEntity.ok(Map.of("members", members));
    }

    // ─── POST /projects/{projectId}/members ───────────────────────────────────

    @PostMapping
    public ResponseEntity<?> inviteMember(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @RequestBody InviteRequest req) {

        Project project = projectRepo.findById(projectId).orElse(null);
        if (project == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (!canManageMembers(user, project)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }

        User invitee = userRepo.findByEmail(req.email()).orElse(null);
        if (invitee == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "user not found"));
        }
        if (memberRepo.existsByProjectAndUser(project, invitee)) {
            return ResponseEntity.badRequest().body(Map.of("error", "user is already a member"));
        }

        String role = (req.role() != null && VALID_ROLES.contains(req.role())) ? req.role() : "member";
        // Prevent directly assigning 'owner' via invite — ownership is set at project creation
        if ("owner".equals(role)) role = "admin";

        ProjectMember pm = new ProjectMember();
        pm.setProject(project);
        pm.setUser(invitee);
        pm.setRole(role);
        pm = memberRepo.save(pm);
        activityService.log(project.getId(), null, user.getId(), "member_added",
                ActivityService.payload("userName", invitee.getName(), "role", pm.getRole()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ProjectMemberDto.from(pm));
    }

    // ─── PATCH /projects/{projectId}/members/{userId} ─────────────────────────

    @PatchMapping("/{userId}")
    public ResponseEntity<?> updateRole(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID userId,
            @RequestBody UpdateRoleRequest req) {

        Project project = projectRepo.findById(projectId).orElse(null);
        if (project == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        // Only the project owner can change roles
        if (!project.getOwner().getId().equals(user.getId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }

        ProjectMember pm = memberRepo.findByProjectIdAndUserId(projectId, userId).orElse(null);
        if (pm == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "member not found"));
        }
        // Cannot change the owner's own role via this endpoint
        if ("owner".equals(pm.getRole())) {
            return ResponseEntity.badRequest().body(Map.of("error", "cannot change owner role"));
        }
        // Cannot assign 'owner' role via this endpoint
        if ("owner".equals(req.role())) {
            return ResponseEntity.badRequest().body(Map.of("error", "cannot assign owner role"));
        }

        pm.setRole(req.role());
        pm = memberRepo.save(pm);
        activityService.log(projectId, null, user.getId(), "role_changed",
                ActivityService.payload("userName", pm.getUser().getName(), "role", pm.getRole()));
        return ResponseEntity.ok(ProjectMemberDto.from(pm));
    }

    // ─── DELETE /projects/{projectId}/members/{userId} ────────────────────────

    @DeleteMapping("/{userId}")
    public ResponseEntity<?> removeMember(
            @AuthenticationPrincipal User user,
            @PathVariable UUID projectId,
            @PathVariable UUID userId) {

        Project project = projectRepo.findById(projectId).orElse(null);
        if (project == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "not found"));
        }
        if (!canManageMembers(user, project)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }

        ProjectMember pm = memberRepo.findByProjectIdAndUserId(projectId, userId).orElse(null);
        if (pm == null) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "member not found"));
        }
        // Prevent removing the project owner
        if ("owner".equals(pm.getRole())) {
            return ResponseEntity.badRequest().body(Map.of("error", "cannot remove the project owner"));
        }

        memberRepo.delete(pm);
        activityService.log(projectId, null, user.getId(), "member_removed",
                ActivityService.payload("userName", pm.getUser().getName()));
        return ResponseEntity.noContent().build();
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Returns true if the given user is the project owner OR has an 'owner'/'admin'
     * role in project_members for the given project.
     */
    private boolean canManageMembers(User user, Project project) {
        if (project.getOwner().getId().equals(user.getId())) return true;
        return memberRepo.findByProjectIdAndUserId(project.getId(), user.getId())
                .map(pm -> "owner".equals(pm.getRole()) || "admin".equals(pm.getRole()))
                .orElse(false);
    }
}
