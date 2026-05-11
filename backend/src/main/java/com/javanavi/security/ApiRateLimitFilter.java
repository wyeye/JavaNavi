package com.javanavi.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public class ApiRateLimitFilter extends OncePerRequestFilter {
    private final ConcurrentMap<String, Deque<Long>> requests = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper;
    private final I18nMessages messages;

    public ApiRateLimitFilter(ObjectMapper objectMapper, I18nMessages messages) {
        this.objectMapper = objectMapper;
        this.messages = messages;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/v1/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        if (!path.startsWith("/api/v1/ai/")
                && !path.startsWith("/api/v1/query")
                && !path.startsWith("/api/v1/data-sync/")
                && !path.startsWith("/api/v1/schema-sync/")) {
            filterChain.doFilter(request, response);
            return;
        }
        if (!allowWindow(request, 30, 60_000L)) {
            writeRateLimitResponse(response);
            return;
        }
        filterChain.doFilter(request, response);
    }

    private boolean allowWindow(HttpServletRequest request, int maxRequests, long windowMs) {
        long now = System.currentTimeMillis();
        long threshold = now - windowMs;
        String key = rateLimitKey(request);
        Deque<Long> deque = requests.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        synchronized (deque) {
            while (!deque.isEmpty() && deque.peekFirst() < threshold) {
                deque.pollFirst();
            }
            if (deque.size() >= maxRequests) {
                return false;
            }
            deque.addLast(now);
            return true;
        }
    }

    private void writeRateLimitResponse(HttpServletResponse response) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getWriter(), ApiEnvelope.failKey(messages, "request.rateLimited"));
    }

    private String rateLimitKey(HttpServletRequest request) {
        String session = request.getHeader("X-JavaNavi-Session");
        if (session != null && !session.isBlank()) {
            return "session:" + session.trim();
        }
        String remote = request.getRemoteAddr();
        return "ip:" + (remote == null ? "unknown" : remote.trim());
    }
}
