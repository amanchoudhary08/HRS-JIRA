package com.taskflow.dto;

import java.util.List;
import java.util.UUID;

public record SearchResultDto(
        UUID projectId,
        String projectName,
        List<TaskDto> tasks
) {}
