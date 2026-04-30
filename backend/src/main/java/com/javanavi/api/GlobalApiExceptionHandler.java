package com.javanavi.api;

import com.javanavi.i18n.I18nMessages;
import com.javanavi.i18n.LocalizedException;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.security.SecretRedactor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalApiExceptionHandler {
    private final I18nMessages messages;

    public GlobalApiExceptionHandler(I18nMessages messages) {
        this.messages = messages;
    }

    @ExceptionHandler(LocalizedException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiEnvelope<Void> localized(LocalizedException error) {
        return ApiEnvelope.failKey(messages, error.code(), error.args());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiEnvelope<Void> validation(MethodArgumentNotValidException error) {
        return ApiEnvelope.failKey(messages, "request.validation");
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiEnvelope<Void> badRequest(IllegalArgumentException error) {
        return ApiEnvelope.failKey(messages, "request.invalid", "message", SecretRedactor.redact(messages.localizeFallback(error.getMessage())));
    }

    @ExceptionHandler(IllegalStateException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiEnvelope<Void> illegalState(IllegalStateException error) {
        return ApiEnvelope.failKey(messages, "app.state", "message", SecretRedactor.redact(messages.localizeFallback(error.getMessage())));
    }
}
