package com.taskflow.dto;

import com.taskflow.entity.User;

import java.util.UUID;

public record UserDto(UUID id, String name, String email) {
    public static UserDto from(User u) {
        return new UserDto(u.getId(), u.getName(), u.getEmail());
    }
}
