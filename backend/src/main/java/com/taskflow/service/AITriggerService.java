package com.taskflow.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskflow.entity.AISuggestion;
import com.taskflow.entity.Task;
import com.taskflow.repository.AISuggestionRepository;
import com.taskflow.repository.TaskRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AITriggerService {

    private static final Logger log = LoggerFactory.getLogger(AITriggerService.class);

    private final AISuggestionRepository suggestionRepo;
    private final TaskRepository taskRepo;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Value("${app.ai.url}")
    private String aiBaseUrl;

    @Value("${app.ai.internal-secret}")
    private String internalSecret;

    public AITriggerService(AISuggestionRepository suggestionRepo,
                             TaskRepository taskRepo,
                             ObjectMapper objectMapper) {
        this.suggestionRepo = suggestionRepo;
        this.taskRepo = taskRepo;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .version(HttpClient.Version.HTTP_1_1)
                .build();
    }

    /**
     * Call FastAPI triage endpoint and persist the suggestion.
     * This runs inside an @Async listener — must not propagate exceptions.
     */
    public void triggerTriage(UUID taskId, UUID projectId,
                               String title, String description,
                               String type, String userToken) {
        try {
            Map<String, Object> requestBody = Map.of(
                    "task_id", taskId.toString(),
                    "title", title,
                    "description", description != null ? description : "",
                    "type", type != null ? type : "task"
            );

            String json = objectMapper.writeValueAsString(requestBody);
            log.info("[AI Triage] Calling FastAPI for task {} — token length: {}", taskId,
                    userToken != null ? userToken.length() : 0);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(aiBaseUrl + "/api/triage/task"))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + userToken)
                    .header("X-Internal-Secret", internalSecret)
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();

            HttpResponse<String> response = httpClient.send(request,
                    HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                log.warn("[AI Triage] FastAPI returned {} for task {} — body: {}",
                        response.statusCode(), taskId, response.body());
                return;
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> payload = objectMapper.readValue(response.body(), Map.class);

            Task task = taskRepo.findById(taskId).orElse(null);
            if (task == null) {
                log.warn("[AI Triage] Task {} not found after creation — skipping", taskId);
                return;
            }

            AISuggestion suggestion = new AISuggestion();
            suggestion.setTask(task);
            suggestion.setType("triage");

            // Build structured content map
            Object priorityVal = payload.get("priority");
            Object labelsVal = payload.get("labels");
            Object spVal = payload.get("story_points");
            Object reasoningVal = payload.get("reasoning");

            suggestion.setContent(Map.of(
                    "priority", priorityVal != null ? priorityVal.toString() : "medium",
                    "labels", labelsVal instanceof List ? labelsVal : List.of(),
                    "story_points", spVal instanceof Number ? ((Number) spVal).intValue() : 3,
                    "reasoning", reasoningVal != null ? reasoningVal.toString() : ""
            ));

            suggestionRepo.save(suggestion);
            log.info("[AI Triage] Saved suggestion for task {}", taskId);

        } catch (Exception e) {
            log.error("[AI Triage] Failed for task {}: {}", taskId, e.getMessage());
        }
    }
}
