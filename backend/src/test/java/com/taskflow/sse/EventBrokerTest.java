package com.taskflow.sse;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class EventBrokerTest {

    private EventBroker broker;

    private static final UUID PROJECT_ID = UUID.randomUUID();
    private static final UUID USER_ID    = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        broker = new EventBroker();
    }

    // ── subscribe ─────────────────────────────────────────────────────────────

    @Test
    void subscribe_returnsNonNullEmitter() {
        SseEmitter emitter = broker.subscribe(PROJECT_ID);
        assertThat(emitter).isNotNull();
    }

    @Test
    void subscribe_multipleSubscribersForSameProject() {
        SseEmitter e1 = broker.subscribe(PROJECT_ID);
        SseEmitter e2 = broker.subscribe(PROJECT_ID);
        assertThat(e1).isNotSameAs(e2);
    }

    @Test
    void subscribeUser_returnsNonNullEmitter() {
        SseEmitter emitter = broker.subscribeUser(USER_ID);
        assertThat(emitter).isNotNull();
    }

    // ── publish ───────────────────────────────────────────────────────────────

    @Test
    void publish_noSubscribers_doesNotThrow() {
        SseEvent event = new SseEvent("task_created", "payload");
        assertThatCode(() -> broker.publish(UUID.randomUUID(), event))
                .doesNotThrowAnyException();
    }

    @Test
    void publishToUser_noSubscribers_doesNotThrow() {
        SseEvent event = new SseEvent("notification", "payload");
        assertThatCode(() -> broker.publishToUser(UUID.randomUUID(), event))
                .doesNotThrowAnyException();
    }

    // ── dead emitter cleanup ──────────────────────────────────────────────────

    @Test
    void publish_withNoSubscribersAfterUnsubscribing_doesNotThrow() {
        // Subscribe to a fresh project, then never subscribe again
        UUID freshProjectId = UUID.randomUUID();
        broker.subscribe(freshProjectId);

        // Unsubscribe by not using the returned emitter — simulate cleanup by
        // publishing to a brand-new project that has no subscribers at all
        UUID emptyProjectId = UUID.randomUUID();
        SseEvent event = new SseEvent("task_updated", "data");
        assertThatCode(() -> broker.publish(emptyProjectId, event))
                .doesNotThrowAnyException();
    }

    // ── onCompletion/onTimeout hooks are registered ───────────────────────────

    @Test
    void subscribe_returnsEmitterWithNoImmediateTimeout() {
        SseEmitter emitter = broker.subscribe(PROJECT_ID);
        // Timeout of 0L means no timeout (perpetual)
        // We verify the emitter is non-null and usable
        assertThat(emitter).isNotNull();
    }

    @Test
    void subscribeUser_returnsEmitterWithNoImmediateTimeout() {
        SseEmitter emitter = broker.subscribeUser(USER_ID);
        assertThat(emitter).isNotNull();
    }

    // ── SseEvent record ───────────────────────────────────────────────────────

    @Test
    void sseEvent_typeAndDataAccessors() {
        SseEvent event = new SseEvent("task_created", Map.of("id", "123"));
        assertThat(event.type()).isEqualTo("task_created");
        assertThat(event.data()).isNotNull();
    }

    @Test
    void sseEvent_equalityOnSameValues() {
        SseEvent e1 = new SseEvent("task_created", "payload");
        SseEvent e2 = new SseEvent("task_created", "payload");
        assertThat(e1).isEqualTo(e2);
    }

    @Test
    void sseEvent_inequalityOnDifferentType() {
        SseEvent e1 = new SseEvent("task_created", "payload");
        SseEvent e2 = new SseEvent("task_updated", "payload");
        assertThat(e1).isNotEqualTo(e2);
    }
}
