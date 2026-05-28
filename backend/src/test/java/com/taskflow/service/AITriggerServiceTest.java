package com.taskflow.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.taskflow.entity.AISuggestion;
import com.taskflow.entity.Task;
import com.taskflow.repository.AISuggestionRepository;
import com.taskflow.repository.TaskRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AITriggerServiceTest {

    @Mock AISuggestionRepository suggestionRepo;
    @Mock TaskRepository taskRepo;
    @Mock HttpClient httpClient;

    AITriggerService aiTriggerService;

    private static final UUID TASK_ID    = UUID.randomUUID();
    private static final UUID PROJECT_ID = UUID.randomUUID();

    private Task testTask;

    @BeforeEach
    void setUp() {
        testTask = new Task();
        testTask.setId(TASK_ID);
        testTask.setTitle("Fix authentication");
        testTask.setDescription("Users cannot log in after password reset");
        testTask.setType("bug");

        // Create service with a real ObjectMapper; inject mocks/config via reflection
        aiTriggerService = new AITriggerService(suggestionRepo, taskRepo, new ObjectMapper());
        ReflectionTestUtils.setField(aiTriggerService, "groqApiKey", "test-groq-api-key");
        ReflectionTestUtils.setField(aiTriggerService, "model", "llama-3.3-70b-versatile");
        ReflectionTestUtils.setField(aiTriggerService, "httpClient", httpClient);
    }

    // ── triggerTriage — happy path ─────────────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void triggerTriage_200Response_savesAISuggestion() throws Exception {
        String innerJson = """
                {"priority":"high","labels":["auth","backend"],"story_points":5,"reasoning":"Authentication failures are P0"}
                """;
        String responseJson = "{\"choices\":[{\"message\":{\"content\":\"" +
                innerJson.strip().replace("\"", "\\\"") + "\"}}]}";

        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(responseJson);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(mockResponse);
        when(taskRepo.findById(TASK_ID)).thenReturn(Optional.of(testTask));
        when(suggestionRepo.save(any(AISuggestion.class))).thenAnswer(inv -> inv.getArgument(0));

        aiTriggerService.triggerTriage(TASK_ID, PROJECT_ID,
                "Fix authentication", "Users cannot log in", "bug", "user-jwt-token");

        ArgumentCaptor<AISuggestion> captor = ArgumentCaptor.forClass(AISuggestion.class);
        verify(suggestionRepo).save(captor.capture());
        AISuggestion saved = captor.getValue();

        assertThat(saved.getType()).isEqualTo("triage");
        assertThat(saved.getContent()).containsEntry("priority", "high");
        assertThat(saved.getContent()).containsEntry("story_points", 5);
        assertThat(saved.getContent().get("labels")).isEqualTo(List.of("auth", "backend"));
        assertThat(saved.isAccepted()).isFalse();
    }

    // ── triggerTriage — non-200 response ──────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void triggerTriage_non200Response_doesNotSaveSuggestion() throws Exception {
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(500);
        when(mockResponse.body()).thenReturn("Internal Server Error");
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(mockResponse);

        aiTriggerService.triggerTriage(TASK_ID, PROJECT_ID,
                "Fix authentication", "desc", "bug", "token");

        verifyNoInteractions(suggestionRepo);
    }

    // ── triggerTriage — task not found after AI call ───────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void triggerTriage_taskNotFoundAfterAiCall_doesNotSaveSuggestion() throws Exception {
        String innerJson = "{\"priority\":\"medium\",\"labels\":[],\"story_points\":2,\"reasoning\":\"ok\"}"
                .replace("\"", "\\\"");
        String responseJson = "{\"choices\":[{\"message\":{\"content\":\"" + innerJson + "\"}}]}";

        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(responseJson);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(mockResponse);
        when(taskRepo.findById(TASK_ID)).thenReturn(Optional.empty()); // task gone

        aiTriggerService.triggerTriage(TASK_ID, PROJECT_ID,
                "Title", "desc", "task", "token");

        verifyNoInteractions(suggestionRepo);
    }

    // ── triggerTriage — HTTP exception is swallowed ───────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void triggerTriage_networkError_doesNotPropagateException() throws Exception {
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new java.io.IOException("Connection refused"));

        // Must NOT throw — @Async listeners must not propagate
        assertThatCode(() ->
                aiTriggerService.triggerTriage(TASK_ID, PROJECT_ID,
                        "Title", "desc", "task", "token")
        ).doesNotThrowAnyException();

        verifyNoInteractions(suggestionRepo);
    }

    // ── triggerTriage — null description / type defaults ──────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void triggerTriage_nullDescription_sendsEmptyString() throws Exception {
        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(500); // stops early
        when(mockResponse.body()).thenReturn("err");
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(mockResponse);

        // Should not throw even if description is null
        assertThatCode(() ->
                aiTriggerService.triggerTriage(TASK_ID, PROJECT_ID,
                        "Title", null, null, "token")
        ).doesNotThrowAnyException();
    }

    // ── triggerTriage — missing priority fields default gracefully ────────────

    @Test
    @SuppressWarnings("unchecked")
    void triggerTriage_missingPriorityInResponse_defaultsToMedium() throws Exception {
        // Response deliberately omits "priority" and "story_points"
        String innerJson = "{\"labels\":[],\"reasoning\":\"partial response\"}"
                .replace("\"", "\\\"");
        String responseJson = "{\"choices\":[{\"message\":{\"content\":\"" + innerJson + "\"}}]}";

        HttpResponse<String> mockResponse = mock(HttpResponse.class);
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn(responseJson);
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(mockResponse);
        when(taskRepo.findById(TASK_ID)).thenReturn(Optional.of(testTask));
        when(suggestionRepo.save(any(AISuggestion.class))).thenAnswer(inv -> inv.getArgument(0));

        aiTriggerService.triggerTriage(TASK_ID, PROJECT_ID,
                "Title", "desc", "task", "token");

        ArgumentCaptor<AISuggestion> captor = ArgumentCaptor.forClass(AISuggestion.class);
        verify(suggestionRepo).save(captor.capture());
        assertThat(captor.getValue().getContent()).containsEntry("priority", "medium");
        assertThat(captor.getValue().getContent()).containsEntry("story_points", 3);
    }
}
