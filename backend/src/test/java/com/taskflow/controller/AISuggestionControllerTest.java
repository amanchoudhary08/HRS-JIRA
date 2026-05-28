package com.taskflow.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskflow.entity.AISuggestion;
import com.taskflow.entity.Project;
import com.taskflow.entity.Task;
import com.taskflow.entity.User;
import com.taskflow.repository.AISuggestionRepository;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.TaskRepository;
import com.taskflow.repository.UserRepository;
import com.taskflow.security.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
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

@WebMvcTest(AISuggestionController.class)
class AISuggestionControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @MockBean ProjectRepository projectRepo;
    @MockBean TaskRepository taskRepo;
    @MockBean AISuggestionRepository suggestionRepo;
    @MockBean JwtUtil jwtUtil;
    @MockBean UserRepository userRepo;
    @MockBean ClientRegistrationRepository clientRegistrationRepository;

    private static final UUID USER_ID       = UUID.randomUUID();
    private static final UUID PROJECT_ID    = UUID.randomUUID();
    private static final UUID TASK_ID       = UUID.randomUUID();
    private static final UUID SUGGESTION_ID = UUID.randomUUID();

    private User testUser;
    private Task testTask;
    private AISuggestion testSuggestion;

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
        testTask.setTitle("Fix login bug");
        testTask.setStatus(Task.TaskStatus.todo);
        testTask.setPriority(Task.TaskPriority.medium);
        testTask.setProject(testProject);
        testTask.setCreatedBy(testUser);
        testTask.setType("bug");

        testSuggestion = new AISuggestion();
        testSuggestion.setId(SUGGESTION_ID);
        testSuggestion.setTask(testTask);
        testSuggestion.setType("triage");
        testSuggestion.setContent(Map.of(
                "priority", "high",
                "labels", List.of("backend"),
                "story_points", 3,
                "reasoning", "Login issues are critical"));
        testSuggestion.setAccepted(false);
        testSuggestion.setCreatedAt(OffsetDateTime.now());
    }

    private UsernamePasswordAuthenticationToken auth() {
        return new UsernamePasswordAuthenticationToken(testUser, null, List.of());
    }

    // ── GET suggestions ───────────────────────────────────────────────────────

    @Test
    void listSuggestions_found_returns200WithList() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.of(testTask));
        when(suggestionRepo.findByTaskIdOrderByCreatedAtDesc(TASK_ID)).thenReturn(List.of(testSuggestion));

        mockMvc.perform(get("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/ai-suggestions")
                        .with(authentication(auth())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestions").isArray())
                .andExpect(jsonPath("$.suggestions[0].type").value("triage"))
                .andExpect(jsonPath("$.suggestions[0].accepted").value(false));
    }

    @Test
    void listSuggestions_empty_returnsEmptyArray() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.of(testTask));
        when(suggestionRepo.findByTaskIdOrderByCreatedAtDesc(TASK_ID)).thenReturn(List.of());

        mockMvc.perform(get("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/ai-suggestions")
                        .with(authentication(auth())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestions").isEmpty());
    }

    @Test
    void listSuggestions_projectNotAccessible_returns404() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(false);

        mockMvc.perform(get("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/ai-suggestions")
                        .with(authentication(auth())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("not found"));
    }

    @Test
    void listSuggestions_taskNotFound_returns404() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(taskRepo.findByIdAndProjectId(TASK_ID, PROJECT_ID)).thenReturn(Optional.empty());

        mockMvc.perform(get("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/ai-suggestions")
                        .with(authentication(auth())))
                .andExpect(status().isNotFound());
    }

    @Test
    void listSuggestions_unauthenticated_redirects() throws Exception {
        mockMvc.perform(get("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID + "/ai-suggestions"))
                .andExpect(status().is3xxRedirection());
    }

    // ── PATCH suggestions/{id}/accept ─────────────────────────────────────────

    @Test
    void acceptSuggestion_valid_returns200Accepted() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(suggestionRepo.findById(SUGGESTION_ID)).thenReturn(Optional.of(testSuggestion));
        when(suggestionRepo.save(any(AISuggestion.class))).thenReturn(testSuggestion);

        mockMvc.perform(patch("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID
                                + "/ai-suggestions/" + SUGGESTION_ID + "/accept")
                        .with(authentication(auth())).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accepted").value(true));
    }

    @Test
    void acceptSuggestion_notFound_returns404() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(suggestionRepo.findById(SUGGESTION_ID)).thenReturn(Optional.empty());

        mockMvc.perform(patch("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID
                                + "/ai-suggestions/" + SUGGESTION_ID + "/accept")
                        .with(authentication(auth())).with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("not found"));
    }

    @Test
    void acceptSuggestion_wrongTask_returns404() throws Exception {
        // Suggestion belongs to a different task
        Task otherTask = new Task();
        otherTask.setId(UUID.randomUUID()); // different TASK_ID
        testSuggestion.setTask(otherTask);

        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(suggestionRepo.findById(SUGGESTION_ID)).thenReturn(Optional.of(testSuggestion));

        mockMvc.perform(patch("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID
                                + "/ai-suggestions/" + SUGGESTION_ID + "/accept")
                        .with(authentication(auth())).with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test
    void acceptSuggestion_projectNotAccessible_returns404() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(false);

        mockMvc.perform(patch("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID
                                + "/ai-suggestions/" + SUGGESTION_ID + "/accept")
                        .with(authentication(auth())).with(csrf()))
                .andExpect(status().isNotFound());
    }

    @Test
    void acceptSuggestion_unauthenticated_redirects() throws Exception {
        mockMvc.perform(patch("/projects/" + PROJECT_ID + "/tasks/" + TASK_ID
                                + "/ai-suggestions/" + SUGGESTION_ID + "/accept").with(csrf()))
                .andExpect(status().is3xxRedirection());
    }
}
