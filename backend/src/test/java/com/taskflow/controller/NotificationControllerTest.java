package com.taskflow.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskflow.entity.Notification;
import com.taskflow.entity.User;
import com.taskflow.repository.NotificationRepository;
import com.taskflow.repository.UserRepository;
import com.taskflow.security.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
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

@WebMvcTest(NotificationController.class)
class NotificationControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @MockBean NotificationRepository notificationRepo;
    @MockBean JwtUtil jwtUtil;
    @MockBean UserRepository userRepo;
    @MockBean ClientRegistrationRepository clientRegistrationRepository;

    private static final UUID USER_ID         = UUID.randomUUID();
    private static final UUID NOTIFICATION_ID = UUID.randomUUID();

    private User testUser;
    private Notification testNotification;

    @BeforeEach
    void setUp() {
        testUser = new User();
        testUser.setId(USER_ID);
        testUser.setName("Test User");
        testUser.setEmail("test@example.com");
        testUser.setPassword("hashed");

        testNotification = new Notification();
        testNotification.setId(NOTIFICATION_ID);
        testNotification.setUser(testUser);
        testNotification.setType("task_assigned");
        testNotification.setPayload(Map.of("taskTitle", "Fix login bug"));
        testNotification.setRead(false);
        testNotification.setCreatedAt(OffsetDateTime.now());
    }

    private UsernamePasswordAuthenticationToken auth() {
        return new UsernamePasswordAuthenticationToken(testUser, null, List.of());
    }

    // ── GET /notifications ────────────────────────────────────────────────────

    @Test
    void listNotifications_authenticated_returns200WithPage() throws Exception {
        when(notificationRepo.findByUserIdOrderByReadAscCreatedAtDesc(eq(USER_ID), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(testNotification)));

        mockMvc.perform(get("/notifications").with(authentication(auth())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notifications").isArray())
                .andExpect(jsonPath("$.notifications[0].type").value("task_assigned"))
                .andExpect(jsonPath("$.total").value(1));
    }

    @Test
    void listNotifications_unauthenticated_redirects() throws Exception {
        mockMvc.perform(get("/notifications"))
                .andExpect(status().is3xxRedirection());
    }

    @Test
    void listNotifications_emptyList_returnsEmpty() throws Exception {
        when(notificationRepo.findByUserIdOrderByReadAscCreatedAtDesc(eq(USER_ID), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));

        mockMvc.perform(get("/notifications").with(authentication(auth())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notifications").isEmpty());
    }

    // ── GET /notifications/count ──────────────────────────────────────────────

    @Test
    void countNotifications_returnsUnreadCount() throws Exception {
        when(notificationRepo.countByUserIdAndReadFalse(USER_ID)).thenReturn(3L);

        mockMvc.perform(get("/notifications/count").with(authentication(auth())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unread").value(3));
    }

    @Test
    void countNotifications_zeroUnread_returnsZero() throws Exception {
        when(notificationRepo.countByUserIdAndReadFalse(USER_ID)).thenReturn(0L);

        mockMvc.perform(get("/notifications/count").with(authentication(auth())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unread").value(0));
    }

    // ── PATCH /notifications/{id}/read ────────────────────────────────────────

    @Test
    void markRead_ownNotification_returns200() throws Exception {
        when(notificationRepo.findById(NOTIFICATION_ID)).thenReturn(Optional.of(testNotification));
        when(notificationRepo.save(any(Notification.class))).thenReturn(testNotification);

        mockMvc.perform(patch("/notifications/" + NOTIFICATION_ID + "/read")
                        .with(authentication(auth())).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("task_assigned"));
    }

    @Test
    void markRead_notFound_returns404() throws Exception {
        when(notificationRepo.findById(NOTIFICATION_ID)).thenReturn(Optional.empty());

        mockMvc.perform(patch("/notifications/" + NOTIFICATION_ID + "/read")
                        .with(authentication(auth())).with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("not found"));
    }

    @Test
    void markRead_belongsToOtherUser_returns404() throws Exception {
        User otherUser = new User();
        otherUser.setId(UUID.randomUUID());
        otherUser.setName("Other");
        otherUser.setEmail("other@example.com");
        otherUser.setPassword("hashed");

        testNotification.setUser(otherUser);
        when(notificationRepo.findById(NOTIFICATION_ID)).thenReturn(Optional.of(testNotification));

        mockMvc.perform(patch("/notifications/" + NOTIFICATION_ID + "/read")
                        .with(authentication(auth())).with(csrf()))
                .andExpect(status().isNotFound());
    }

    // ── PATCH /notifications/read-all ─────────────────────────────────────────

    @Test
    void markAllRead_authenticated_returns200() throws Exception {
        doNothing().when(notificationRepo).markAllReadForUser(USER_ID);

        mockMvc.perform(patch("/notifications/read-all").with(authentication(auth())).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
    }

    @Test
    void markAllRead_unauthenticated_redirects() throws Exception {
        mockMvc.perform(patch("/notifications/read-all").with(csrf()))
                .andExpect(status().is3xxRedirection());
    }
}
