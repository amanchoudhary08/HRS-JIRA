package com.taskflow.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.web.servlet.MockMvc;

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

@WebMvcTest(TaskController.class)
class TaskControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @MockBean ProjectRepository projectRepo;
    @MockBean TaskRepository taskRepo;
    @MockBean UserRepository userRepo;
    @MockBean SprintRepository sprintRepo;
    @MockBean EventBroker broker;
    @MockBean ActivityService activityService;
    @MockBean NotificationService notificationService;
    @MockBean ApplicationEventPublisher eventPublisher;
    @MockBean JwtUtil jwtUtil;
    @MockBean ClientRegistrationRepository clientRegistrationRepository;

    private static final UUID USER_ID    = UUID.randomUUID();
    private static final UUID PROJECT_ID = UUID.randomUUID();
    private static final UUID TASK_ID    = UUID.randomUUID();

    private User testUser;
    private Task testTask;

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
        testTask.setTitle("Fix bug");
        testTask.setStatus(Task.TaskStatus.todo);
        testTask.setPriority(Task.TaskPriority.medium);
        testTask.setProject(testProject);
        testTask.setCreatedBy(testUser);
        testTask.setType("task");
    }

    private UsernamePasswordAuthenticationToken auth() {
        return new UsernamePasswordAuthenticationToken(testUser, null, List.of());
    }

    // ── GET /projects/{id}/tasks ──────────────────────────────────────────────

    @Test
    void listTasks_authenticated_returns200WithPagination() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByProjectId(eq(PROJECT_ID), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(testTask)));

        mockMvc.perform(get("/projects/" + PROJECT_ID + "/tasks")
                        .with(authentication(auth())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks").isArray())
                .andExpect(jsonPath("$.tasks[0].title").value("Fix bug"))
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void listTasks_projectNotFound_returns404() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(false);

        mockMvc.perform(get("/projects/" + PROJECT_ID + "/tasks")
                        .with(authentication(auth())))
                .andExpect(status().isNotFound());
    }

    @Test
    void listTasks_unauthenticated_redirects() throws Exception {
        mockMvc.perform(get("/projects/" + PROJECT_ID + "/tasks"))
                .andExpect(status().is3xxRedirection());
    }

    @Test
    void listTasks_invalidStatusFilter_returns400() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);

        mockMvc.perform(get("/projects/" + PROJECT_ID + "/tasks")
                        .with(authentication(auth()))
                        .param("status", "INVALID_STATUS"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void listTasks_withStatusFilter_callsFilteredRepo() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByProjectIdAndStatus(eq(PROJECT_ID), eq(Task.TaskStatus.todo), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(testTask)));

        mockMvc.perform(get("/projects/" + PROJECT_ID + "/tasks")
                        .with(authentication(auth()))
                        .param("status", "todo"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tasks[0].status").value("todo"));
    }

    // ── POST /projects/{id}/tasks ─────────────────────────────────────────────

    @Test
    void createTask_validRequest_returns201() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(projectRepo.getReferenceById(PROJECT_ID)).thenReturn(testTask.getProject());
        when(taskRepo.save(any(Task.class))).thenReturn(testTask);
        doNothing().when(broker).publish(any(), any());
        doNothing().when(activityService).log(any(), any(), any(), any(), any());

        mockMvc.perform(post("/projects/" + PROJECT_ID + "/tasks")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "title", "Fix bug",
                                "status", "todo",
                                "priority", "medium",
                                "due_date", "2027-01-01"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("Fix bug"));
    }

    @Test
    void createTask_blankTitle_returns400() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);

        mockMvc.perform(post("/projects/" + PROJECT_ID + "/tasks")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "title", "",
                                "status", "todo"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation failed"));
    }

    @Test
    void createTask_invalidStatus_returns400() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);

        mockMvc.perform(post("/projects/" + PROJECT_ID + "/tasks")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "title", "Task",
                                "status", "INVALID"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createTask_projectNotAccessible_returns404() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(false);

        mockMvc.perform(post("/projects/" + PROJECT_ID + "/tasks")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("title", "Task"))))
                .andExpect(status().isNotFound());
    }

    @Test
    void createTask_unauthenticated_redirects() throws Exception {
        mockMvc.perform(post("/projects/" + PROJECT_ID + "/tasks").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("title", "Task"))))
                .andExpect(status().is3xxRedirection());
    }

    // ── PATCH /projects/{id}/tasks/{taskId} ───────────────────────────────────

    @Test
    void updateTask_found_returns200() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.of(testTask));
        when(taskRepo.save(any(Task.class))).thenReturn(testTask);
        doNothing().when(broker).publish(any(), any());
        doNothing().when(activityService).log(any(), any(), any(), any(), any());

        mockMvc.perform(patch("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID)
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("title", "Updated"))))
                .andExpect(status().isOk());
    }

    @Test
    void updateTask_notFound_returns404() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.empty());

        mockMvc.perform(patch("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID)
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("title", "Updated"))))
                .andExpect(status().isNotFound());
    }

    // ── DELETE /projects/{id}/tasks/{taskId} ──────────────────────────────────

    @Test
    void deleteTask_found_returns204() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.of(testTask));
        doNothing().when(broker).publish(any(), any());
        doNothing().when(activityService).log(any(), any(), any(), any(), any());

        mockMvc.perform(delete("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID)
                        .with(authentication(auth())).with(csrf()))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteTask_notFound_returns404() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.empty());

        mockMvc.perform(delete("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID)
                        .with(authentication(auth())).with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteTask_unauthenticated_redirects() throws Exception {
        mockMvc.perform(delete("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID).with(csrf()))
                .andExpect(status().is3xxRedirection());
    }
}
