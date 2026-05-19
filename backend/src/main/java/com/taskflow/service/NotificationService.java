package com.taskflow.service;

import com.taskflow.dto.NotificationDto;
import com.taskflow.entity.Notification;
import com.taskflow.entity.User;
import com.taskflow.repository.NotificationRepository;
import com.taskflow.repository.UserRepository;
import com.taskflow.sse.EventBroker;
import com.taskflow.sse.SseEvent;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class NotificationService {

    private final NotificationRepository notificationRepo;
    private final UserRepository userRepo;
    private final EventBroker broker;

    public NotificationService(NotificationRepository notificationRepo,
                                UserRepository userRepo,
                                EventBroker broker) {
        this.notificationRepo = notificationRepo;
        this.userRepo = userRepo;
        this.broker = broker;
    }

    /**
     * Create a notification for a user and push it via SSE personal channel.
     *
     * @param userId  recipient user ID
     * @param type    notification type string
     * @param payload arbitrary key-value metadata
     */
    public void notify(UUID userId, String type, Map<String, Object> payload) {
        User user = userRepo.findById(userId).orElse(null);
        if (user == null) return;

        Notification n = new Notification();
        n.setUser(user);
        n.setType(type);
        n.setPayload(payload != null ? payload : Map.of());
        n = notificationRepo.save(n);

        NotificationDto dto = NotificationDto.from(n);
        broker.publishToUser(userId, new SseEvent("notification", dto));
    }

    /** Convenience builder — builds payload as a simple map from alternating key/value args. */
    public static Map<String, Object> payload(Object... keyValuePairs) {
        Map<String, Object> map = new HashMap<>();
        for (int i = 0; i + 1 < keyValuePairs.length; i += 2) {
            map.put(String.valueOf(keyValuePairs[i]), keyValuePairs[i + 1]);
        }
        return map;
    }
}
