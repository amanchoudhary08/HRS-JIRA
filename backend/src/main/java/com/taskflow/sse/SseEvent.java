package com.taskflow.sse;

public record SseEvent(String type, Object data) {}
