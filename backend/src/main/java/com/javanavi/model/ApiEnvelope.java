package com.javanavi.model;

import com.javanavi.i18n.I18nMessages;

public record ApiEnvelope<T>(boolean success, T data, ApiError error) {
    public static <T> ApiEnvelope<T> ok(T data) {
        return new ApiEnvelope<>(true, data, null);
    }

    public static <T> ApiEnvelope<T> fail(String code, String message) {
        return new ApiEnvelope<>(false, null, new ApiError(code, message));
    }

    public static <T> ApiEnvelope<T> failKey(I18nMessages messages, String code, Object... args) {
        return new ApiEnvelope<>(false, null, new ApiError(code, messages.message(code, args)));
    }
}
