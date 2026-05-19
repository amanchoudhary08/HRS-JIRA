package com.taskflow.sse;

import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.List;

@Component
public class EventBroker {

    // Project-scoped emitters: projectId → list of emitters
    private final Map<UUID, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    // User-scoped (personal) emitters: userId → list of emitters
    private final Map<UUID, List<SseEmitter>> userEmitters = new ConcurrentHashMap<>();

    public SseEmitter subscribe(UUID projectId) {
        SseEmitter emitter = new SseEmitter(0L); // no timeout
        emitters.computeIfAbsent(projectId, k -> new CopyOnWriteArrayList<>()).add(emitter);
        Runnable cleanup = () -> remove(projectId, emitter);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(e -> cleanup.run());
        return emitter;
    }

    /** Subscribe to a personal (user-scoped) SSE channel. */
    public SseEmitter subscribeUser(UUID userId) {
        SseEmitter emitter = new SseEmitter(0L);
        userEmitters.computeIfAbsent(userId, k -> new CopyOnWriteArrayList<>()).add(emitter);
        Runnable cleanup = () -> removeUser(userId, emitter);
        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(e -> cleanup.run());
        return emitter;
    }

    public void publish(UUID projectId, SseEvent event) {
        send(emitters.get(projectId), event, projectId, emitters);
    }

    /** Publish an event to a specific user's personal channel. */
    public void publishToUser(UUID userId, SseEvent event) {
        send(userEmitters.get(userId), event, userId, userEmitters);
    }

    private void send(List<SseEmitter> list, SseEvent event, UUID key, Map<UUID, List<SseEmitter>> map) {
        if (list == null || list.isEmpty()) return;
        List<SseEmitter> dead = new java.util.ArrayList<>();
        for (SseEmitter emitter : list) {
            try {
                emitter.send(SseEmitter.event()
                        .name(event.type())
                        .data(event.data()));
            } catch (IOException e) {
                dead.add(emitter);
            }
        }
        list.removeAll(dead);
    }

    private void remove(UUID projectId, SseEmitter emitter) {
        List<SseEmitter> list = emitters.get(projectId);
        if (list != null) list.remove(emitter);
    }

    private void removeUser(UUID userId, SseEmitter emitter) {
        List<SseEmitter> list = userEmitters.get(userId);
        if (list != null) list.remove(emitter);
    }
}
