package com.taskflow.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskflow.entity.Project;
import com.taskflow.entity.User;
import com.taskflow.repository.ProjectMemberRepository;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.TaskRepository;
import com.taskflow.repository.UserRepository;
import com.taskflow.security.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
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
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(ProjectController.class)
class ProjectControllerTest {

    @Autowired  MockMvc mockMvc;
    @Autowired  ObjectMapper objectMapper;

    @MockBean ProjectRepository projectRepo;
    @MockBean TaskRepository taskRepo;
    @MockBean ProjectMemberRepository memberRepo;
    @MockBean JwtUtil jwtUtil;
    @MockBean UserRepository userRepo;
    @MockBean ClientRegistrationRepository clientRegistrationRepository;

    private static final UUID USER_ID    = UUID.randomUUID();
    private static final UUID PROJECT_ID = UUID.randomUUID();

    private User testUser;
    private Project testProject;

    @BeforeEach
    void setUp() {
        testUser = new User();
        testUser.setId(USER_ID);
        testUser.setName("Test User");
        testUser.setEmail("test@example.com");
        testUser.setPassword("hashed");

        testProject = new Project();
        testProject.setId(PROJECT_ID);
        testProject.setName("Alpha");
        testProject.setDescription("desc");
        testProject.setOwner(testUser);
        testProject.setCreatedAt(OffsetDateTime.now());
    }

    private UsernamePasswordAuthenticationToken auth() {
        return new UsernamePasswordAuthenticationToken(testUser, null, List.of());
    }

    // ── GET /projects ─────────────────────────────────────────────────────────

    @Test
    void listProjects_authenticated_returns200() throws Exception {
        when(projectRepo.findAccessibleByUser(eq(testUser), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(testProject)));
        when(memberRepo.findByProjectIdIn(anyList())).thenReturn(List.of());

        mockMvc.perform(get("/projects").with(authentication(auth())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projects").isArray())
                .andExpect(jsonPath("$.projects[0].name").value("Alpha"))
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void listProjects_unauthenticated_redirects() throws Exception {
        mockMvc.perform(get("/projects"))
                .andExpect(status().is3xxRedirection());
    }

    @Test
    void listProjects_emptyList_returnsEmptyArray() throws Exception {
        when(projectRepo.findAccessibleByUser(eq(testUser), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        when(memberRepo.findByProjectIdIn(anyList())).thenReturn(List.of());

        mockMvc.perform(get("/projects").with(authentication(auth())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.projects").isEmpty());
    }

    // ── POST /projects ────────────────────────────────────────────────────────

    @Test
    void createProject_validRequest_returns201() throws Exception {
        when(projectRepo.save(any(Project.class))).thenReturn(testProject);
        when(memberRepo.save(any())).thenReturn(null);

        mockMvc.perform(post("/projects")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", "Alpha", "description", "desc"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Alpha"));
    }

    @Test
    void createProject_blankName_returns400() throws Exception {
        mockMvc.perform(post("/projects")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", ""))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createProject_missingName_returns400() throws Exception {
        mockMvc.perform(post("/projects")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("description", "no name"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createProject_unauthenticated_redirects() throws Exception {
        mockMvc.perform(post("/projects").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", "Alpha"))))
                .andExpect(status().is3xxRedirection());
    }

    // ── GET /projects/{id} ────────────────────────────────────────────────────

    @Test
    void getProject_accessible_returns200() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(projectRepo.findById(PROJECT_ID)).thenReturn(Optional.of(testProject));
        when(taskRepo.findTop100ByProjectIdOrderByCreatedAtDesc(PROJECT_ID)).thenReturn(List.of());
        when(memberRepo.findByProjectIdWithUser(PROJECT_ID)).thenReturn(List.of());

        mockMvc.perform(get("/projects/" + PROJECT_ID).with(authentication(auth())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Alpha"))
                .andExpect(jsonPath("$.tasks").isArray())
                .andExpect(jsonPath("$.members").isArray());
    }

    @Test
    void getProject_notAccessible_returns404() throws Exception {
        when(projectRepo.existsAccessibleByUserAndId(PROJECT_ID, USER_ID)).thenReturn(false);

        mockMvc.perform(get("/projects/" + PROJECT_ID).with(authentication(auth())))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("not found"));
    }

    @Test
    void getProject_nonExistentId_returns404() throws Exception {
        UUID otherId = UUID.randomUUID();
        when(projectRepo.existsAccessibleByUserAndId(otherId, USER_ID)).thenReturn(true);
        when(projectRepo.findById(otherId)).thenReturn(Optional.empty());

        mockMvc.perform(get("/projects/" + otherId).with(authentication(auth())))
                .andExpect(status().isNotFound());
    }

    // ── PATCH /projects/{id} ─────────────────────────────────────────────────

    @Test
    void updateProject_owner_returns200() throws Exception {
        when(projectRepo.existsByIdAndOwnerId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(projectRepo.findById(PROJECT_ID)).thenReturn(Optional.of(testProject));
        when(projectRepo.save(any(Project.class))).thenReturn(testProject);

        mockMvc.perform(patch("/projects/" + PROJECT_ID)
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", "Beta"))))
                .andExpect(status().isOk());
    }

    @Test
    void updateProject_nonOwner_returns403() throws Exception {
        when(projectRepo.existsByIdAndOwnerId(PROJECT_ID, USER_ID)).thenReturn(false);

        mockMvc.perform(patch("/projects/" + PROJECT_ID)
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", "Beta"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("forbidden"));
    }

    @Test
    void updateProject_blankName_returns400() throws Exception {
        when(projectRepo.existsByIdAndOwnerId(PROJECT_ID, USER_ID)).thenReturn(true);
        when(projectRepo.findById(PROJECT_ID)).thenReturn(Optional.of(testProject));

        mockMvc.perform(patch("/projects/" + PROJECT_ID)
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", "  "))))
                .andExpect(status().isBadRequest());
    }

    // ── DELETE /projects/{id} ────────────────────────────────────────────────

    @Test
    void deleteProject_owner_returns204() throws Exception {
        when(projectRepo.existsByIdAndOwnerId(PROJECT_ID, USER_ID)).thenReturn(true);

        mockMvc.perform(delete("/projects/" + PROJECT_ID).with(authentication(auth())).with(csrf()))
                .andExpect(status().isNoContent());
    }

    @Test
    void deleteProject_nonOwner_returns403() throws Exception {
        when(projectRepo.existsByIdAndOwnerId(PROJECT_ID, USER_ID)).thenReturn(false);

        mockMvc.perform(delete("/projects/" + PROJECT_ID).with(authentication(auth())).with(csrf()))
                .andExpect(status().isForbidden());
    }

    @Test
    void deleteProject_unauthenticated_redirects() throws Exception {
        mockMvc.perform(delete("/projects/" + PROJECT_ID).with(csrf()))
                .andExpect(status().is3xxRedirection());
    }
}
