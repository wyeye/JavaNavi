package com.javanavi.app;

import com.javanavi.model.ErrorLogDto;
import com.javanavi.security.SecretRedactor;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Service
public class ErrorLogService {
    private static final DateTimeFormatter ID_TIME = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss", Locale.ROOT).withZone(ZoneId.systemDefault());
    private static final int MAX_MESSAGE_LENGTH = 4_000;
    private static final int MAX_STACK_LENGTH = 80_000;

    private final AppPersistenceService persistence;

    public ErrorLogService(AppPersistenceService persistence) {
        this.persistence = persistence;
    }

    public String record(Throwable error, String code, String message) {
        String id = nextId();
        RequestSnapshot request = requestSnapshot();
        ErrorLogDto log = new ErrorLogDto(
                id,
                Instant.now().toString(),
                "ERROR",
                request.method(),
                request.path(),
                error == null ? code : error.getClass().getName(),
                truncate(SecretRedactor.redact(firstText(message, error == null ? "" : error.getMessage(), code)), MAX_MESSAGE_LENGTH),
                truncate(SecretRedactor.redact(stackTrace(error)), MAX_STACK_LENGTH),
                false
        );
        persistence.insertErrorLog(log);
        return id;
    }

    public List<ErrorLogDto> list(String query, int limit) {
        return persistence.listErrorLogs(query, limit);
    }

    public Optional<ErrorLogDto> find(String id) {
        return persistence.findErrorLog(id);
    }

    public boolean setResolved(String id, boolean resolved) {
        return persistence.setErrorLogResolved(id, resolved);
    }

    private static String nextId() {
        return "ERR-" + ID_TIME.format(Instant.now()) + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);
    }

    private static RequestSnapshot requestSnapshot() {
        if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes)) {
            return new RequestSnapshot("", "");
        }
        HttpServletRequest request = attributes.getRequest();
        String path = firstText(request.getRequestURI(), "");
        String query = firstText(request.getQueryString(), "");
        if (!query.isBlank()) {
            path = path + "?" + query;
        }
        return new RequestSnapshot(firstText(request.getMethod(), ""), path);
    }

    private static String stackTrace(Throwable error) {
        if (error == null) {
            return "";
        }
        StringWriter writer = new StringWriter();
        error.printStackTrace(new PrintWriter(writer));
        return writer.toString();
    }

    private static String firstText(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private static String truncate(String value, int maxLength) {
        String text = value == null ? "" : value;
        if (text.length() <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength) + "\n... truncated ...";
    }

    private record RequestSnapshot(String method, String path) {
    }
}
