package com.javanavi.events;

import com.javanavi.model.CompatEventDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArraySet;

@Component
public class CompatEventPublisher {
    private static final Logger LOGGER = LoggerFactory.getLogger(CompatEventPublisher.class);
    private static final long SSE_TIMEOUT_MS = 0L;

    private final Set<SseEmitter> emitters = new CopyOnWriteArraySet<>();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(error -> emitters.remove(emitter));
        send(emitter, bridgeReadyEvent());
        return emitter;
    }

    public CompatEventDto publish(CompatEventDto event) {
        emitters.forEach(emitter -> send(emitter, event));
        return event;
    }

    public int subscriberCount() {
        return emitters.size();
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

    private CompatEventDto bridgeReadyEvent() {
        return new CompatEventDto(
                UUID.randomUUID().toString(),
                "runtime:bridge-ready",
                "runtime",
                "javanavi-backend",
                "runtime",
                "connected",
                "JavaNavi compatibility event bridge connected",
                Instant.now(),
                Map.of("subscriberCount", subscriberCount())
        );
    }
}
