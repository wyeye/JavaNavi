package com.javanavi.security;

import com.javanavi.api.ApiRateLimitExceededException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

@Component
public class ApiRateLimitFilter extends OncePerRequestFilter {
    private final ConcurrentMap<String, Deque<Long>> requests = new ConcurrentHashMap<>();

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
        enforceWindow(request, 30, 60_000L);
        filterChain.doFilter(request, response);
    }

    private void enforceWindow(HttpServletRequest request, int maxRequests, long windowMs) {
        long now = System.currentTimeMillis();
        long threshold = now - windowMs;
        String key = rateLimitKey(request);
        Deque<Long> deque = requests.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        synchronized (deque) {
            while (!deque.isEmpty() && deque.peekFirst() < threshold) {
                deque.pollFirst();
            }
            if (deque.size() >= maxRequests) {
                throw new ApiRateLimitExceededException("Too many requests for " + request.getRequestURI());
            }
            deque.addLast(now);
        }
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
