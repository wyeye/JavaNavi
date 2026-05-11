package com.javanavi.api;

import com.javanavi.i18n.LocalizedException;

public class ApiRateLimitExceededException extends LocalizedException {
    public ApiRateLimitExceededException() {
        super("request.rateLimited");
    }
}
