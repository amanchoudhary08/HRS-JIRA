package com.taskflow.service;

import com.taskflow.entity.Notification;
import com.taskflow.entity.User;
import com.taskflow.repository.NotificationRepository;
import com.taskflow.repository.UserRepository;
import com.taskflow.sse.EventBroker;
import com.taskflow.sse.SseEvent;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock NotificationRepository notificationRepo;
    @Mock UserRepository userRepo;
    @Mock EventBroker broker;

    @InjectMocks NotificationService notificationService;

    private User testUser;
    private static final UUID USER_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        testUser = new User();
        testUser.setId(USER_ID);
        testUser.setName("Alice");
        testUser.setEmail("alice@example.com");
        testUser.setPassword("hashed");
    }

    // ── notify() ─────────────────────────────────────────────────────────────

    @Test
    void notify_userExists_savesNotificationAndPublishesEvent() {
        Notification saved = new Notification();
        saved.setId(UUID.randomUUID());
        saved.setUser(testUser);
        saved.setType("task_assigned");
        saved.setPayload(Map.of("taskTitle", "Fix bug"));
        saved.setRead(false);
        saved.setCreatedAt(OffsetDateTime.now());

        when(userRepo.findById(USER_ID)).thenReturn(Optional.of(testUser));
        when(notificationRepo.save(any(Notification.class))).thenReturn(saved);

        notificationService.notify(USER_ID, "task_assigned",
                Map.of("taskTitle", "Fix bug"));

        verify(notificationRepo).save(argThat(n ->
                "task_assigned".equals(n.getType()) &&
                "Fix bug".equals(n.getPayload().get("taskTitle"))
        ));
        verify(broker).publishToUser(eq(USER_ID), any(SseEvent.class));
    }

    @Test
    void notify_userNotFound_doesNothing() {
        when(userRepo.findById(USER_ID)).thenReturn(Optional.empty());

        notificationService.notify(USER_ID, "task_assigned", Map.of());

        verifyNoInteractions(notificationRepo);
        verifyNoInteractions(broker);
    }

    @Test
    void notify_nullPayload_savesEmptyMap() {
        Notification saved = new Notification();
        saved.setId(UUID.randomUUID());
        saved.setUser(testUser);
        saved.setType("comment_added");
        saved.setPayload(Map.of());
        saved.setRead(false);
        saved.setCreatedAt(OffsetDateTime.now());

        when(userRepo.findById(USER_ID)).thenReturn(Optional.of(testUser));
        when(notificationRepo.save(any(Notification.class))).thenReturn(saved);

        notificationService.notify(USER_ID, "comment_added", null);

        ArgumentCaptor<Notification> captor = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepo).save(captor.capture());
        assertThat(captor.getValue().getPayload()).isEmpty();
    }

    @Test
    void notify_publishesCorrectSseEventType() {
        Notification saved = new Notification();
        saved.setId(UUID.randomUUID());
        saved.setUser(testUser);
        saved.setType("mentioned_in_comment");
        saved.setPayload(Map.of());
        saved.setRead(false);
        saved.setCreatedAt(OffsetDateTime.now());

        when(userRepo.findById(USER_ID)).thenReturn(Optional.of(testUser));
        when(notificationRepo.save(any(Notification.class))).thenReturn(saved);

        notificationService.notify(USER_ID, "mentioned_in_comment", Map.of());

        ArgumentCaptor<SseEvent> sseCaptor = ArgumentCaptor.forClass(SseEvent.class);
        verify(broker).publishToUser(eq(USER_ID), sseCaptor.capture());
        assertThat(sseCaptor.getValue().type()).isEqualTo("notification");
    }

    // ── payload() static builder ──────────────────────────────────────────────

    @Test
    void payload_evenPairs_buildsCorrectMap() {
        Map<String, Object> result = NotificationService.payload(
                "taskId", "abc-123",
                "taskTitle", "Login fix",
                "projectId", "proj-456"
        );
        assertThat(result)
                .containsEntry("taskId", "abc-123")
                .containsEntry("taskTitle", "Login fix")
                .containsEntry("projectId", "proj-456")
                .hasSize(3);
    }

    @Test
    void payload_emptyArgs_returnsEmptyMap() {
        Map<String, Object> result = NotificationService.payload();
        assertThat(result).isEmpty();
    }

    @Test
    void payload_oddPairs_ignoresLastKey() {
        // 3 args: pairs are (k1,v1) and then k2 is alone → k2 not added
        Map<String, Object> result = NotificationService.payload("k1", "v1", "k2");
        assertThat(result).containsEntry("k1", "v1").hasSize(1);
    }
}
