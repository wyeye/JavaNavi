package com.javanavi.i18n;

public class LocalizedException extends RuntimeException {
    private final String code;
    private final Object[] args;

    public LocalizedException(String code, Object... args) {
        super(code);
        this.code = code;
        this.args = args == null ? new Object[0] : args.clone();
    }

    public String code() {
        return code;
    }

    public Object[] args() {
        return args.clone();
    }
}
