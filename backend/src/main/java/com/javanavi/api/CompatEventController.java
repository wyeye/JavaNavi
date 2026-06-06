package com.javanavi.api;

import com.javanavi.app.ErrorLogService;
import com.javanavi.events.CompatEventFixtures;
import com.javanavi.events.CompatEventPublisher;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.CompatEventDto;
import com.javanavi.model.CompatEventReplayRequestDto;
import com.javanavi.model.CompatEventStatusDto;
import com.javanavi.security.SecretRedactor;
import org.springframework.beans.factory.annotation.Autowired;
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
    private final ErrorLogService errorLogService;

    public CompatEventController(CompatEventPublisher publisher, CompatEventFixtures fixtures, I18nMessages messages) {
        this(publisher, fixtures, messages, null);
    }

    @Autowired
    public CompatEventController(CompatEventPublisher publisher, CompatEventFixtures fixtures, I18nMessages messages, ErrorLogService errorLogService) {
        this.publisher = publisher;
        this.fixtures = fixtures;
        this.messages = messages;
        this.errorLogService = errorLogService;
    }

    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream() {
        return publisher.subscribe();
    }

    @GetMapping("/status")
    public ApiEnvelope<CompatEventStatusDto> status() {
        return ApiEnvelope.ok(new CompatEventStatusDto(
                "sse",
                publisher.subscriberCount(),
                fixtures.supportedFamilies()
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
        String message = messages.message("events.invalidFixture", "message", SecretRedactor.redact(error == null ? "" : String.valueOf(error.getMessage())));
        if (errorLogService == null) {
            return ApiEnvelope.fail("events.invalidFixture", message);
        }
        String errorId = errorLogService.record(error, "events.invalidFixture", message);
        return ApiEnvelope.fail("events.invalidFixture", message, errorId);
    }
}
