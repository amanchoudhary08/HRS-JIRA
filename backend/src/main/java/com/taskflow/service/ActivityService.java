package com.taskflow.service;

import com.taskflow.dto.ActivityEventDto;
import com.taskflow.entity.ActivityEvent;
import com.taskflow.entity.User;
import com.taskflow.repository.ActivityEventRepository;
import com.taskflow.repository.ProjectRepository;
import com.taskflow.repository.TaskRepository;
import com.taskflow.repository.UserRepository;
import com.taskflow.sse.EventBroker;
import com.taskflow.sse.SseEvent;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class ActivityService {

    private final ActivityEventRepository activityRepo;
    private final ProjectRepository projectRepo;
    private final TaskRepository taskRepo;
    private final UserRepository userRepo;
    private final EventBroker broker;

    public ActivityService(ActivityEventRepository activityRepo,
                           ProjectRepository projectRepo,
                           TaskRepository taskRepo,
                           UserRepository userRepo,
                           EventBroker broker) {
        this.activityRepo = activityRepo;
        this.projectRepo = projectRepo;
        this.taskRepo = taskRepo;
        this.userRepo = userRepo;
        this.broker = broker;
    }

    /**
     * Log an activity event and broadcast it via SSE.
     *
     * @param projectId the project this event belongs to
     * @param taskId    optional task ID (may be null)
     * @param actorId   the user who triggered the action
     * @param type      event type string (e.g. "task_created", "comment_added")
     * @param payload   extra key/value metadata to store with the event
     */
    public void log(UUID projectId, UUID taskId, UUID actorId, String type, Map<String, Object> payload) {
        // Load actor eagerly so we have the name for the DTO
        User actor = userRepo.findById(actorId).orElse(null);
        if (actor == null) return;

        ActivityEvent event = new ActivityEvent();
        event.setProject(projectRepo.getReferenceById(projectId));
        if (taskId != null) {
            event.setTask(taskRepo.getReferenceById(taskId));
        }
        event.setActor(actor);
        event.setType(type);
        event.setPayload(payload != null ? payload : Map.of());

        event = activityRepo.save(event);

        // Build the DTO from known values — avoids lazy-loading associations after save
        ActivityEventDto dto = new ActivityEventDto(
                event.getId(),
                projectId,
                taskId,
                actorId,
                actor.getName(),
                type,
                event.getPayload(),
                event.getCreatedAt()
        );
        broker.publish(projectId, new SseEvent("activity_created", dto));
    }

    /** Convenience overload — no payload. */
    public void log(UUID projectId, UUID taskId, UUID actorId, String type) {
        log(projectId, taskId, actorId, type, Map.of());
    }

    /** Convenience builder — builds payload as a simple map. */
    public static Map<String, Object> payload(Object... keyValuePairs) {
        Map<String, Object> map = new HashMap<>();
        for (int i = 0; i + 1 < keyValuePairs.length; i += 2) {
            map.put(String.valueOf(keyValuePairs[i]), keyValuePairs[i + 1]);
        }
        return map;
    }
}
