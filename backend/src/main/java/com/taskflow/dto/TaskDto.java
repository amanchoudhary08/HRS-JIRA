package com.taskflow.dto;

import com.taskflow.entity.Task;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record TaskDto(
        UUID id,
        String title,
        String description,
        String status,
        String priority,
        String type,
        UUID projectId,
        UUID assigneeId,
        UUID createdBy,
        UUID parentId,
        UUID sprintId,
        int position,
        LocalDate dueDate,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        List<LabelDto> labels,
        Integer storyPoints
) {
    public static TaskDto from(Task t) {
        List<LabelDto> labelDtos = t.getLabels() != null
                ? t.getLabels().stream().map(LabelDto::from)
                    .sorted(java.util.Comparator.comparing(LabelDto::name))
                    .toList()
                : List.of();
        return new TaskDto(
                t.getId(),
                t.getTitle(),
                t.getDescription() != null ? t.getDescription() : "",
                t.getStatus().name(),
                t.getPriority().name(),
                t.getType() != null ? t.getType() : "task",
                t.getProject().getId(),
                t.getAssignee() != null ? t.getAssignee().getId() : null,
                t.getCreatedBy().getId(),
                t.getParent() != null ? t.getParent().getId() : null,
                t.getSprint() != null ? t.getSprint().getId() : null,
                t.getPosition(),
                t.getDueDate(),
                t.getCreatedAt(),
                t.getUpdatedAt(),
                labelDtos,
                t.getStoryPoints()
        );
    }
}
