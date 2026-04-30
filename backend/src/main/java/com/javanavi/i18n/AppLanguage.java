package com.javanavi.i18n;

import java.util.Locale;

public enum AppLanguage {
    EN("en"),
    ZH("zh-CN");

    private final String headerValue;

    AppLanguage(String headerValue) {
        this.headerValue = headerValue;
    }

    public String headerValue() {
        return headerValue;
    }

    public static AppLanguage from(Object raw) {
        if (raw == null) {
            return EN;
        }
        String value = String.valueOf(raw).trim().toLowerCase(Locale.ROOT);
        if (value.isBlank()) {
            return EN;
        }
        if (value.equals("zh") || value.equals("zh-cn") || value.equals("zh_cn") || value.startsWith("zh-")) {
            return ZH;
        }
        return EN;
    }
}
