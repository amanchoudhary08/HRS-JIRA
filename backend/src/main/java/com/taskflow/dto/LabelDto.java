package com.taskflow.dto;

import com.taskflow.entity.Label;

import java.util.UUID;

public record LabelDto(
        UUID id,
        UUID projectId,
        String name,
        String color
) {
    public static LabelDto from(Label l) {
        return new LabelDto(
                l.getId(),
                l.getProject().getId(),
                l.getName(),
                l.getColor()
        );
    }
}
