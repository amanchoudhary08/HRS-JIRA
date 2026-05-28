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

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AITriggerService {

    private static final Logger log = LoggerFactory.getLogger(AITriggerService.class);

    private static final String GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

    private final AISuggestionRepository suggestionRepo;
    private final TaskRepository taskRepo;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    @Value("${app.ai.groq-api-key:}")
    private String groqApiKey;

    @Value("${app.ai.model:llama-3.3-70b-versatile}")
    private String model;

    public AITriggerService(AISuggestionRepository suggestionRepo,
                             TaskRepository taskRepo,
                             ObjectMapper objectMapper) {
        this.suggestionRepo = suggestionRepo;
        this.taskRepo = taskRepo;
        this.objectMapper = objectMapper;
        this.httpClient = buildHttpClient();
    }

    /** Trust-all SSL context so the JRE inside Docker can reach api.groq.com */
    private static HttpClient buildHttpClient() {
        try {
            SSLContext sc = SSLContext.getInstance("TLS");
            sc.init(null, new TrustManager[]{new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                public void checkClientTrusted(X509Certificate[] c, String a) {}
                public void checkServerTrusted(X509Certificate[] c, String a) {}
            }}, new SecureRandom());
            return HttpClient.newBuilder()
                    .sslContext(sc)
                    .connectTimeout(Duration.ofSeconds(10))
                    .version(HttpClient.Version.HTTP_1_1)
                    .build();
        } catch (Exception e) {
            return HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .version(HttpClient.Version.HTTP_1_1)
                    .build();
        }
    }

    /**
     * Call Groq LLM API to triage a task and persist the suggestion.
     * This runs inside an @Async listener — must not propagate exceptions.
     */
    public void triggerTriage(UUID taskId, UUID projectId,
                               String title, String description,
                               String type, String userToken) {
        if (groqApiKey == null || groqApiKey.isBlank()) {
            log.warn("[AI Triage] GROQ_API_KEY not set — skipping triage for task {}", taskId);
            return;
        }

        try {
            String userPrompt = String.format(
                    "Task title: %s\nDescription: %s\nType: %s",
                    title,
                    description != null ? description : "(none)",
                    type != null ? type : "task"
            );

            Map<String, Object> requestBody = Map.of(
                    "model", model,
                    "temperature", 0.2,
                    "max_tokens", 300,
                    "response_format", Map.of("type", "json_object"),
                    "messages", List.of(
                            Map.of("role", "system", "content",
                                    "You are a project management AI. Analyze the given task and respond with a JSON object containing exactly these fields:\n" +
                                    "- \"priority\": one of \"low\", \"medium\", \"high\", \"critical\"\n" +
                                    "- \"labels\": array of 1–3 relevant string labels (e.g. [\"backend\", \"bug\"])\n" +
                                    "- \"story_points\": integer from the Fibonacci scale (1, 2, 3, 5, 8, 13)\n" +
                                    "- \"reasoning\": one sentence explaining your assessment\n" +
                                    "Respond ONLY with the JSON object, no markdown, no extra text."),
                            Map.of("role", "user", "content", userPrompt)
                    )
            );

            String json = objectMapper.writeValueAsString(requestBody);
            log.info("[AI Triage] Calling Groq ({}) for task {}", model, taskId);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(GROQ_URL))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + groqApiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build();

            HttpResponse<String> response = httpClient.send(request,
                    HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() != 200) {
                log.warn("[AI Triage] Groq returned {} for task {} — body: {}",
                        response.statusCode(), taskId, response.body());
                return;
            }

            // Extract content from OpenAI-compatible response
            @SuppressWarnings("unchecked")
            Map<String, Object> groqResponse = objectMapper.readValue(response.body(), Map.class);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> choices = (List<Map<String, Object>>) groqResponse.get("choices");
            if (choices == null || choices.isEmpty()) {
                log.warn("[AI Triage] Empty choices from Groq for task {}", taskId);
                return;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
            String content = (String) message.get("content");

            @SuppressWarnings("unchecked")
            Map<String, Object> payload = objectMapper.readValue(content, Map.class);

            Task task = taskRepo.findById(taskId).orElse(null);
            if (task == null) {
                log.warn("[AI Triage] Task {} not found after creation — skipping", taskId);
                return;
            }

            AISuggestion suggestion = new AISuggestion();
            suggestion.setTask(task);
            suggestion.setType("triage");

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
            log.info("[AI Triage] Saved Groq suggestion for task {}", taskId);

        } catch (Exception e) {
            log.error("[AI Triage] Failed for task {}: {}", taskId, e.getMessage());
        }
    }
}
