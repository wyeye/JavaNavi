package com.javanavi.i18n;

public final class I18nContext {
    private static final ThreadLocal<AppLanguage> CURRENT = ThreadLocal.withInitial(() -> AppLanguage.EN);

    private I18nContext() {
    }

    public static AppLanguage language() {
        return CURRENT.get();
    }

    public static void set(AppLanguage language) {
        CURRENT.set(language == null ? AppLanguage.EN : language);
    }

    public static void clear() {
        CURRENT.remove();
    }
}
