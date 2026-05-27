package com.taskflow.event;

import org.springframework.context.ApplicationEvent;

import java.util.UUID;

public class TaskCreatedEvent extends ApplicationEvent {

    private final UUID taskId;
    private final UUID projectId;
    private final String title;
    private final String description;
    private final String type;
    private final String userToken;

    public TaskCreatedEvent(Object source, UUID taskId, UUID projectId,
                             String title, String description, String type,
                             String userToken) {
        super(source);
        this.taskId = taskId;
        this.projectId = projectId;
        this.title = title;
        this.description = description;
        this.type = type;
        this.userToken = userToken;
    }

    public UUID getTaskId() { return taskId; }
    public UUID getProjectId() { return projectId; }
    public String getTitle() { return title; }
    public String getDescription() { return description; }
    public String getType() { return type; }
    public String getUserToken() { return userToken; }
}
