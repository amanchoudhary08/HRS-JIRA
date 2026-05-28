package com.taskflow.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskflow.entity.User;
import com.taskflow.repository.UserRepository;
import com.taskflow.security.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(AuthController.class)
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private UserRepository userRepo;

    @MockBean
    private PasswordEncoder passwordEncoder;

    @MockBean
    private JwtUtil jwtUtil;

    @MockBean
    private ClientRegistrationRepository clientRegistrationRepository;

    private User testUser;

    @BeforeEach
    void setUp() {
        testUser = new User();
        testUser.setId(UUID.randomUUID());
        testUser.setEmail("test@example.com");
    }

    private UsernamePasswordAuthenticationToken auth() {
        return new UsernamePasswordAuthenticationToken(testUser, null, List.of());
    }

    // ── Register ──────────────────────────────────────────────────────────────

    @Test
    void register_validRequest_returns201WithToken() throws Exception {
        User saved = new User();
        saved.setId(UUID.randomUUID());
        saved.setName("Alice");
        saved.setEmail("alice@example.com");

        when(userRepo.save(any(User.class))).thenReturn(saved);
        when(jwtUtil.generateToken(any(User.class))).thenReturn("mock-jwt-token");
        when(passwordEncoder.encode(anyString())).thenReturn("hashed");

        mockMvc.perform(post("/auth/register")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", "Alice",
                                "email", "alice@example.com",
                                "password", "password123"
                        ))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.token").value("mock-jwt-token"))
                .andExpect(jsonPath("$.user.email").value("alice@example.com"));
    }

    @Test
    void register_blankName_returns400() throws Exception {
        mockMvc.perform(post("/auth/register")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", "",
                                "email", "alice@example.com",
                                "password", "password123"
                        ))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void register_shortPassword_returns400() throws Exception {
        mockMvc.perform(post("/auth/register")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "name", "Alice",
                                "email", "alice@example.com",
                                "password", "short"
                        ))))
                .andExpect(status().isBadRequest());
    }

    // ── Login ─────────────────────────────────────────────────────────────────

    @Test
    void login_validCredentials_returns200WithToken() throws Exception {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setName("Bob");
        user.setEmail("bob@example.com");
        user.setPassword("hashed");

        when(userRepo.findByEmail("bob@example.com")).thenReturn(Optional.of(user));
        when(userRepo.findByEmpId("bob@example.com")).thenReturn(Optional.empty());
        when(passwordEncoder.matches("password123", "hashed")).thenReturn(true);
        when(jwtUtil.generateToken(any(User.class))).thenReturn("mock-jwt-token");

        mockMvc.perform(post("/auth/login")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "bob@example.com",
                                "password", "password123"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").value("mock-jwt-token"));
    }

    @Test
    void login_wrongPassword_returns401() throws Exception {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail("bob@example.com");
        user.setPassword("hashed");

        when(userRepo.findByEmail("bob@example.com")).thenReturn(Optional.of(user));
        when(userRepo.findByEmpId("bob@example.com")).thenReturn(Optional.empty());
        when(passwordEncoder.matches(anyString(), anyString())).thenReturn(false);

        mockMvc.perform(post("/auth/login")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "bob@example.com",
                                "password", "wrongpassword"
                        ))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void login_unknownEmail_returns401() throws Exception {
        when(userRepo.findByEmail(anyString())).thenReturn(Optional.empty());
        when(userRepo.findByEmpId(anyString())).thenReturn(Optional.empty());

        mockMvc.perform(post("/auth/login")
                        .with(authentication(auth())).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "email", "nobody@example.com",
                                "password", "password123"
                        ))))
                .andExpect(status().isUnauthorized());
    }

    // ── Protected endpoint ────────────────────────────────────────────────────

    @Test
    void listUsers_withoutToken_redirects() throws Exception {
        mockMvc.perform(get("/users"))
                .andExpect(status().is3xxRedirection());
    }
}
