package com.javanavi.api;

public class ApiRateLimitExceededException extends RuntimeException {
    public ApiRateLimitExceededException(String message) {
        super(message);
    }
}
