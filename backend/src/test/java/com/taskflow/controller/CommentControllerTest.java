package com.taskflow.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskflow.dto.CommentDto;
import com.taskflow.entity.Comment;
import com.taskflow.entity.Project;
import com.taskflow.entity.Task;
import com.taskflow.entity.User;
import com.taskflow.repository.*;
import com.taskflow.security.JwtUtil;
import com.taskflow.service.ActivityService;
import com.taskflow.service.NotificationService;
import com.taskflow.sse.EventBroker;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(CommentController.class)
class CommentControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @MockBean ProjectRepository projectRepo;
    @MockBean TaskRepository taskRepo;
    @MockBean CommentRepository commentRepo;
    @MockBean ProjectMemberRepository memberRepo;
    @MockBean UserRepository userRepo;
    @MockBean EventBroker broker;
    @MockBean ActivityService activityService;
    @MockBean NotificationService notificationService;
    @MockBean JwtUtil jwtUtil;
    @MockBean ClientRegistrationRepository clientRegistrationRepository;

    private static final UUID USER_ID    = UUID.randomUUID();
    private static final UUID PROJECT_ID = UUID.randomUUID();
    private static final UUID TASK_ID    = UUID.randomUUID();
    private static final UUID COMMENT_ID = UUID.randomUUID();

    private User testUser;
    private Task testTask;
    private Comment testComment;

    @BeforeEach
    void setUp() {
        testUser = new User();
        testUser.setId(USER_ID);
        testUser.setName("Test User");
        testUser.setEmail("test@example.com");
        testUser.setPassword("hashed");

        Project testProject = new Project();
        testProject.setId(PROJECT_ID);
        testProject.setName("Test Project");
        testProject.setOwner(testUser);

        testTask = new Task();
        testTask.setId(TASK_ID);
        testTask.setTitle("A task");
        testTask.setStatus(Task.TaskStatus.todo);
        testTask.setPriority(Task.TaskPriority.medium);
        testTask.setProject(testProject);
        testTask.setCreatedBy(testUser);
        testTask.setType("task");

        testComment = new Comment();
        testComment.setId(COMMENT_ID);
        testComment.setBody("Great progress");
        testComment.setTask(testTask);
        testComment.setAuthor(testUser);
        testComment.setCreatedAt(OffsetDateTime.now());
        testComment.setUpdatedAt(OffsetDateTime.now());
    }

    private UsernamePasswordAuthenticationToken auth() {
        return new UsernamePasswordAuthenticationToken(testUser, null, List.of());
    }

    // ── GET comments ─────────────────────────────────────────────────────────

    @Test
    void listComments_found_returns200() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.of(testTask));
        when(commentRepo.findByTaskIdOrderByCreatedAtAsc(TASK_ID)).thenReturn(List.of(testComment));

        mockMvc.perform(get("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/comments")
                        .with(authentication(auth())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.comments").isArray())
                .andExpect(jsonPath("$.comments[0].body").value("Great progress"));
    }

    @Test
    void listComments_projectNotAccessible_returns404() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(false);

        mockMvc.perform(get("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/comments")
                        .with(authentication(auth())))
                .andExpect(status().isNotFound());
    }

    @Test
    void listComments_taskNotFound_returns404() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.empty());

        mockMvc.perform(get("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/comments")
                        .with(authentication(auth())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("task not found"));
    }

    @Test
    void listComments_unauthenticated_redirects() throws Exception {
        mockMvc.perform(get("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/comments"))
                .andExpect(status().is3xxRedirection());
    }

    // ── POST comment ─────────────────────────────────────────────────────────

    @Test
    void createComment_validBody_returns201() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.of(testTask));
        when(commentRepo.save(any(Comment.class))).thenReturn(testComment);
        when(commentRepo.findByIdWithDetails(COMMENT_ID)).thenReturn(Optional.of(testComment));
        when(userRepo.findByNameContainingIgnoreCase(anyString())).thenReturn(List.of());
        doNothing().when(broker).publish(any(), any());
        doNothing().when(activityService).log(any(), any(), any(), any(), any());

        mockMvc.perform(post("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/comments")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("body", "Great progress"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.body").value("Great progress"));
    }

    @Test
    void createComment_emptyBody_returns400() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.of(testTask));

        mockMvc.perform(post("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/comments")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("body", "  "))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("body is required"));
    }

    @Test
    void createComment_blankBody_returns400() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.of(testTask));

        mockMvc.perform(post("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/comments")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("body", ""))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createComment_taskNotFound_returns404() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.empty());

        mockMvc.perform(post("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/comments")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("body", "Hi"))))
                .andExpect(status().isNotFound());
    }

    // ── PATCH comment ─────────────────────────────────────────────────────────

    @Test
    void updateComment_author_returns200() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.of(testTask));
        when(commentRepo.findByIdWithDetails(COMMENT_ID)).thenReturn(Optional.of(testComment));
        when(commentRepo.save(any(Comment.class))).thenReturn(testComment);
        doNothing().when(broker).publish(any(), any());

        mockMvc.perform(patch("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/comments/" + COMMENT_ID)
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("body", "Updated comment"))))
                .andExpect(status().isOk());
    }

    @Test
    void updateComment_notAuthor_returns403() throws Exception {
        User otherUser = new User();
        otherUser.setId(UUID.randomUUID());
        otherUser.setName("Other");
        otherUser.setEmail("other@example.com");
        otherUser.setPassword("hashed");
        testComment.setAuthor(otherUser); // different author

        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.of(testTask));
        when(commentRepo.findByIdWithDetails(COMMENT_ID)).thenReturn(Optional.of(testComment));

        mockMvc.perform(patch("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/comments/" + COMMENT_ID)
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("body", "Hacked"))))
                .andExpect(status().isForbidden());
    }

    // ── DELETE comment ────────────────────────────────────────────────────────

    @Test
    void deleteComment_authorCanDelete_returns204() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.of(testTask));
        when(commentRepo.findByIdWithDetails(COMMENT_ID)).thenReturn(Optional.of(testComment));
        // testComment.author == testUser (same USER_ID), so isAuthor=true → allowed
        doNothing().when(broker).publish(any(), any());
        doNothing().when(activityService).log(any(), any(), any(), any(), any());

        mockMvc.perform(delete("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/comments/" + COMMENT_ID)
                        .with(authentication(auth())).with(csrf()))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteComment_notFound_returns404() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.of(testTask));
        when(commentRepo.findByIdWithDetails(COMMENT_ID)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/comments/" + COMMENT_ID)
                        .with(authentication(auth())).with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteComment_unauthenticated_redirects() throws Exception {
        mockMvc.perform(delete("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/comments/" + COMMENT_ID).with(csrf()))
                .andExpect(status().is3xxRedirection());
    }
}
