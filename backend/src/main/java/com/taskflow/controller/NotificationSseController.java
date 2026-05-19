package com.taskflow.controller;

import com.taskflow.entity.User;
import com.taskflow.sse.EventBroker;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.UUID;

@RestController
@RequestMapping("/notifications/events")
public class NotificationSseController {

    private final EventBroker broker;

    public NotificationSseController(EventBroker broker) {
        this.broker = broker;
    }

    /**
     * GET /notifications/events — personal SSE channel for notification push.
     * Token is passed as a query param because EventSource cannot set headers.
     */
    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter subscribe(@AuthenticationPrincipal User user) throws IOException {
        SseEmitter emitter = broker.subscribeUser(user.getId());
        // Send initial ping so browser confirms connection
        emitter.send(SseEmitter.event().comment("connected"));
        return emitter;
    }
}
