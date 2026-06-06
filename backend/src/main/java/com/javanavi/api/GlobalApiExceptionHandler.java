package com.javanavi.api;

import com.javanavi.app.ErrorLogService;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.i18n.LocalizedException;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.security.SecretRedactor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalApiExceptionHandler {
    private final I18nMessages messages;
    private final ErrorLogService errorLogService;

    public GlobalApiExceptionHandler(I18nMessages messages, ErrorLogService errorLogService) {
        this.messages = messages;
        this.errorLogService = errorLogService;
    }

    @ExceptionHandler(LocalizedException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiEnvelope<Void> localized(LocalizedException error) {
        return fail(error, error.code(), error.args());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiEnvelope<Void> validation(MethodArgumentNotValidException error) {
        return fail(error, "request.validation");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiEnvelope<Void> badRequest(IllegalArgumentException error) {
        return fail(error, "request.invalid", "message", redacted(error));
    }

    @ExceptionHandler(IllegalStateException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiEnvelope<Void> illegalState(IllegalStateException error) {
        return fail(error, "app.state", "message", redacted(error));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ApiEnvelope<Void> notFound(NoResourceFoundException error) {
        return fail(error, "request.notFound");
    }

    @ExceptionHandler(NullPointerException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiEnvelope<Void> nullPointer(NullPointerException error) {
        return fail(error, "request.nullPointer");
    }

    @ExceptionHandler(ApiRateLimitExceededException.class)
    @ResponseStatus(HttpStatus.TOO_MANY_REQUESTS)
    public ApiEnvelope<Void> rateLimited(ApiRateLimitExceededException error) {
        return fail(error, error.code(), error.args());
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiEnvelope<Void> unexpected(Exception error) {
        return fail(error, "request.unexpected", "message", redacted(error));
    }

    private ApiEnvelope<Void> fail(Throwable error, String code, Object... args) {
        String message = messages.message(code, args);
        String errorId = errorLogService.record(error, code, message);
        return ApiEnvelope.fail(code, message, errorId);
    }

    private String redacted(Throwable error) {
        return SecretRedactor.redact(error == null ? "" : String.valueOf(error.getMessage()));
    }
}
