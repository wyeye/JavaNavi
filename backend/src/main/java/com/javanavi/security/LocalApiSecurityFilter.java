package com.javanavi.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.javanavi.config.SecurityProperties;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Component
public class LocalApiSecurityFilter extends OncePerRequestFilter {
    private static final List<String> BOOTSTRAP_GET_PATHS = List.of(
            "/api/v1/health",
            "/api/v1/session"
    );

    private final SecurityProperties properties;
    private final LocalSessionService localSessionService;
    private final ObjectMapper objectMapper;
    private final I18nMessages messages;

    public LocalApiSecurityFilter(
            SecurityProperties properties,
            LocalSessionService localSessionService,
            ObjectMapper objectMapper,
            I18nMessages messages
    ) {
        this.properties = properties;
        this.localSessionService = localSessionService;
        this.objectMapper = objectMapper;
        this.messages = messages;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        String origin = request.getHeader("Origin");
        if (origin != null && !isAllowedOrigin(origin, request)) {
            writeForbidden(response, "security.originRejected");
            return;
        }

        Optional<String> authenticatedSessionId = Optional.empty();
        if (!properties.isLocalSessionRequired()) {
            authenticatedSessionId = Optional.of(LocalSessionService.SECURITY_DISABLED_SESSION_ID);
        } else if (requiresLocalSession(request)) {
            authenticatedSessionId = localSessionId(request);
            if (authenticatedSessionId.isEmpty()) {
                writeForbidden(response, "security.localSessionRequired");
                return;
            }
        }

        authenticatedSessionId.ifPresent(localSessionService::bindCurrentSession);
        try {
            filterChain.doFilter(request, response);
        } finally {
            localSessionService.clearCurrentSession();
        }
    }

    private boolean isAllowedOrigin(String origin, HttpServletRequest request) {
        if (properties.getAllowedOrigins().contains(origin)) {
            return true;
        }
        String host = request.getHeader("Host");
        if (host == null || host.isBlank()) {
            return false;
        }
        String sameOrigin = request.getScheme() + "://" + host;
        return origin.equals(sameOrigin);
    }

    private boolean requiresLocalSession(HttpServletRequest request) {
        if (!properties.isLocalSessionRequired()) {
            return false;
        }
        String method = request.getMethod().toUpperCase(Locale.ROOT);
        if ("GET".equals(method) || "HEAD".equals(method)) {
            String path = request.getRequestURI();
            return !BOOTSTRAP_GET_PATHS.contains(path);
        }
        String path = request.getRequestURI();
        return !path.equals("/api/v1/session");
    }

    private Optional<String> localSessionId(HttpServletRequest request) {
        String headerToken = request.getHeader(properties.getSessionHeader());
        Optional<String> headerSessionId = localSessionService.authenticate(headerToken);
        if (headerSessionId.isPresent()) {
            return headerSessionId;
        }
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return Optional.empty();
        }
        for (Cookie cookie : cookies) {
            if (properties.getSessionCookie().equals(cookie.getName())) {
                Optional<String> cookieSessionId = localSessionService.authenticate(cookie.getValue());
                if (cookieSessionId.isPresent()) {
                    return cookieSessionId;
                }
            }
        }
        return Optional.empty();
    }

    private void writeForbidden(HttpServletResponse response, String code) throws IOException {
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        objectMapper.writeValue(response.getWriter(), ApiEnvelope.fail(code, SecretRedactor.redact(messages.message(code))));
    }
}
