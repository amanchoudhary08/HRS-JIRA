package com.taskflow.listener;

import com.taskflow.event.TaskCreatedEvent;
import com.taskflow.service.AITriggerService;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class TaskAITriggerListener {

    private final AITriggerService aiTriggerService;

    public TaskAITriggerListener(AITriggerService aiTriggerService) {
        this.aiTriggerService = aiTriggerService;
    }

    /**
     * @Async + @TransactionalEventListener(AFTER_COMMIT) ensures:
     * 1. The task row is committed to DB before this runs (no race condition)
     * 2. The call to FastAPI happens in a background thread (non-blocking)
     */
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onTaskCreated(TaskCreatedEvent event) {
        aiTriggerService.triggerTriage(
                event.getTaskId(),
                event.getProjectId(),
                event.getTitle(),
                event.getDescription(),
                event.getType(),
                event.getUserToken()
        );
    }
}
