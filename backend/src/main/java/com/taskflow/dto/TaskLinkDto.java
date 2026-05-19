package com.taskflow.dto;

import com.taskflow.entity.TaskLink;

import java.util.UUID;

public record TaskLinkDto(
        UUID id,
        UUID sourceTaskId,
        String sourceTaskTitle,
        UUID targetTaskId,
        String targetTaskTitle,
        String linkType,
        UUID createdById
) {
    public static TaskLinkDto from(TaskLink l) {
        return new TaskLinkDto(
                l.getId(),
                l.getSource().getId(),
                l.getSource().getTitle(),
                l.getTarget().getId(),
                l.getTarget().getTitle(),
                l.getLinkType().name(),
                l.getCreatedBy().getId()
        );
    }
}
