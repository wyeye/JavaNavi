package com.javanavi.api;

import com.javanavi.config.SecurityProperties;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.LocalSessionDto;
import com.javanavi.security.LocalSessionService;
import com.javanavi.security.SecretStore;
import com.javanavi.security.SecretStoreStatus;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

@RestController
@RequestMapping("/api/v1")
public class SecurityController {
    private final SecurityProperties properties;
    private final LocalSessionService localSessionService;
    private final SecretStore secretStore;

    public SecurityController(
            SecurityProperties properties,
            LocalSessionService localSessionService,
            SecretStore secretStore
    ) {
        this.properties = properties;
        this.localSessionService = localSessionService;
        this.secretStore = secretStore;
    }

    @GetMapping("/session")
    public ResponseEntity<ApiEnvelope<LocalSessionDto>> session(HttpServletRequest request) {
        LocalSessionService.IssuedSession issuedSession = localSessionService.sessionForToken(sessionCookieValue(request))
                .orElseGet(localSessionService::issueSession);
        ResponseCookie cookie = ResponseCookie.from(properties.getSessionCookie(), issuedSession.token())
                .httpOnly(true)
                .sameSite("Strict")
                .path("/")
                .maxAge(Duration.ofHours(12))
                .build();
        SecretStoreStatus secretStoreStatus = secretStore.status();
        LocalSessionDto body = new LocalSessionDto(
                issuedSession.token(),
                issuedSession.tokenFingerprint(),
                issuedSession.sessionId(),
                properties.getSessionHeader(),
                properties.getSessionCookie(),
                properties.isLocalSessionRequired(),
                secretStoreStatus
        );
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(ApiEnvelope.ok(body));
    }

    private String sessionCookieValue(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (properties.getSessionCookie().equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }
}
