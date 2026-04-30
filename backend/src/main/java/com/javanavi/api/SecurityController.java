package com.javanavi.api;

import com.javanavi.config.SecurityProperties;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.security.LocalSessionService;
import com.javanavi.security.SecretStore;
import com.javanavi.security.SecretStoreStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.Map;

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
    public ResponseEntity<ApiEnvelope<Map<String, Object>>> session() {
        String token = localSessionService.issueToken();
        ResponseCookie cookie = ResponseCookie.from(properties.getSessionCookie(), token)
                .httpOnly(false)
                .sameSite("Strict")
                .path("/")
                .maxAge(Duration.ofHours(12))
                .build();
        SecretStoreStatus secretStoreStatus = secretStore.status();
        Map<String, Object> body = Map.of(
                "token", token,
                "tokenFingerprint", localSessionService.tokenFingerprint(),
                "headerName", properties.getSessionHeader(),
                "cookieName", properties.getSessionCookie(),
                "localSessionRequired", properties.isLocalSessionRequired(),
                "secretStore", secretStoreStatus
        );
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(ApiEnvelope.ok(body));
    }
}
