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
    private static final String REQUEST_SOURCE_HEADER = "X-JavaNavi-Request-Source";

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
        RateLimitRule rule = rateLimitRule(request);
        if (rule == null) {
            filterChain.doFilter(request, response);
            return;
        }
        if (!allowWindow(request, rule)) {
            writeRateLimitResponse(response);
            return;
        }
        filterChain.doFilter(request, response);
    }

    private RateLimitRule rateLimitRule(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path.equals("/api/v1/query/cancel")) {
            return new RateLimitRule("query-cancel", 60, 60_000L);
        }
        if (path.equals("/api/v1/query") || path.equals("/api/v1/query/multi")) {
            return new RateLimitRule("query", 180, 60_000L).withRequestSource(request.getHeader(REQUEST_SOURCE_HEADER));
        }
        if (path.startsWith("/api/v1/ai/")) {
            return new RateLimitRule("ai", 30, 60_000L);
        }
        if (path.startsWith("/api/v1/data-sync/")) {
            return new RateLimitRule("data-sync", 30, 60_000L);
        }
        if (path.startsWith("/api/v1/schema-sync/")) {
            return new RateLimitRule("schema-sync", 30, 60_000L);
        }
        return null;
    }

    private boolean allowWindow(HttpServletRequest request, RateLimitRule rule) {
        long now = System.currentTimeMillis();
        long threshold = now - rule.windowMs();
        String key = rateLimitKey(request, rule.bucket());
        Deque<Long> deque = requests.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        synchronized (deque) {
            while (!deque.isEmpty() && deque.peekFirst() < threshold) {
                deque.pollFirst();
            }
            if (deque.size() >= rule.maxRequests()) {
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

    private String rateLimitKey(HttpServletRequest request, String bucket) {
        String session = request.getHeader("X-JavaNavi-Session");
        if (session != null && !session.isBlank()) {
            return bucket + ":session:" + session.trim();
        }
        String remote = request.getRemoteAddr();
        return bucket + ":ip:" + (remote == null ? "unknown" : remote.trim());
    }


    private record RateLimitRule(String bucket, int maxRequests, long windowMs) {
        private RateLimitRule withRequestSource(String requestSource) {
            return new RateLimitRule(bucket + ":" + requestSourceBucket(requestSource), maxRequests, windowMs);
        }
    }

    private static String requestSourceBucket(String value) {
        String normalized = sanitizeBucketSegment(value);
        if (normalized.equals("executionplan") || normalized.equals("execution-plan")) {
            return "execution-plan";
        }
        if (normalized.equals("reload") || normalized.equals("sql-file")) {
            return normalized;
        }
        return "query";
    }

    private static String sanitizeBucketSegment(String value) {
        if (value == null || value.isBlank()) {
            return "query";
        }
        String normalized = value.trim().toLowerCase().replaceAll("[^a-z0-9-]", "-");
        return normalized.isBlank() ? "query" : normalized;
    }
}
