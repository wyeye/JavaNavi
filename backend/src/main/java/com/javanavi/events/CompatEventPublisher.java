package com.javanavi.events;

import com.javanavi.model.CompatEventDto;
import com.javanavi.security.LocalSessionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public class CompatEventPublisher {
    private static final Logger LOGGER = LoggerFactory.getLogger(CompatEventPublisher.class);
    private static final long SSE_TIMEOUT_MS = 0L;

    private final LocalSessionService localSessionService;
    private final ConcurrentMap<SseEmitter, String> emitters = new ConcurrentHashMap<>();

    public CompatEventPublisher(LocalSessionService localSessionService) {
        this.localSessionService = localSessionService;
    }

    public SseEmitter subscribe() {
        String localSessionId = localSessionService.currentSessionId()
                .orElseThrow(() -> new IllegalStateException("JavaNavi event stream requires an authenticated local session."));
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        emitters.put(emitter, localSessionId);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(error -> emitters.remove(emitter));
        send(emitter, bridgeReadyEvent(localSessionId));
        return emitter;
    }

    public CompatEventDto publish(CompatEventDto event) {
        String localSessionId = localSessionService.currentSessionId()
                .orElse(LocalSessionService.SECURITY_DISABLED_SESSION_ID);
        emitters.forEach((emitter, subscriberSessionId) -> {
            if (subscriberSessionId.equals(localSessionId)) {
                send(emitter, event);
            }
        });
        return event;
    }

    public int subscriberCount() {
        return localSessionService.currentSessionId()
                .map(this::subscriberCount)
                .orElseGet(emitters::size);
    }

    private int subscriberCount(String localSessionId) {
        return (int) emitters.values().stream()
                .filter(localSessionId::equals)
                .count();
    }

    private void send(SseEmitter emitter, CompatEventDto event) {
        try {
            emitter.send(SseEmitter.event()
                    .id(event.id())
                    .reconnectTime(3_000L)
                    .data(event, MediaType.APPLICATION_JSON));
        } catch (IOException | IllegalStateException error) {
            emitters.remove(emitter);
            LOGGER.debug("Removed stale JavaNavi compatibility event subscriber.", error);
        }
    }

    private CompatEventDto bridgeReadyEvent(String localSessionId) {
        return new CompatEventDto(
                UUID.randomUUID().toString(),
                "runtime:bridge-ready",
                "runtime",
                "javanavi-backend",
                localSessionId,
                "connected",
                "JavaNavi compatibility event bridge connected",
                Instant.now(),
                Map.of(
                        "subscriberCount", subscriberCount(localSessionId),
                        "localSessionScoped", true
                )
        );
    }
}
