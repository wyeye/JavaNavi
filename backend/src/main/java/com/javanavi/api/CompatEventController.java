package com.javanavi.api;

import com.javanavi.events.CompatEventFixtures;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.CompatEventDto;
import com.javanavi.model.CompatEventReplayRequestDto;
import com.javanavi.security.SecretRedactor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/events")
public class CompatEventController {
    private final CompatEventPublisher publisher;
    private final CompatEventFixtures fixtures;
    private final I18nMessages messages;

    public CompatEventController(CompatEventPublisher publisher, CompatEventFixtures fixtures, I18nMessages messages) {
        this.publisher = publisher;
        this.fixtures = fixtures;
        this.messages = messages;
    }

    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return publisher.subscribe();
    }

    @GetMapping("/status")
    public ApiEnvelope<Map<String, Object>> status() {
        return ApiEnvelope.ok(Map.of(
                "bridge", "sse",
                "subscriberCount", publisher.subscriberCount(),
                "fixtureFamilies", fixtures.supportedFamilies()
        ));
    }

    @GetMapping("/fixtures")
    public ApiEnvelope<Map<String, List<CompatEventDto>>> fixtures() {
        return ApiEnvelope.ok(fixtures.allFixtures());
    }

    @PostMapping("/fixtures/replay")
    public ApiEnvelope<List<CompatEventDto>> replayFixture(@RequestBody(required = false) CompatEventReplayRequestDto request) {
        List<CompatEventDto> events = fixtures.fixturesFor(request);
        events.forEach(publisher::publish);
        return ApiEnvelope.ok(events);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiEnvelope<Void> badRequest(IllegalArgumentException error) {
        return ApiEnvelope.failKey(messages, "events.invalidFixture", "message", SecretRedactor.redact(messages.localizeFallback(error.getMessage())));
    }
}
