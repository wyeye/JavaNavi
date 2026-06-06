package com.javanavi.model;

public record ApiError(String code, String message, String errorId) {
    public ApiError(String code, String message) {
        this(code, message, null);
    }
}
