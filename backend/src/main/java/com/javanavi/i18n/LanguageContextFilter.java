package com.javanavi.i18n;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class LanguageContextFilter extends OncePerRequestFilter {
    public static final String LANGUAGE_HEADER = "X-JavaNavi-Language";

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        AppLanguage language = AppLanguage.from(firstNonBlank(
                request.getHeader(LANGUAGE_HEADER),
                request.getParameter("language"),
                request.getHeader("Accept-Language")
        ));
        I18nContext.set(language);
        response.setHeader("Content-Language", language.headerValue());
        try {
            filterChain.doFilter(request, response);
        } finally {
            I18nContext.clear();
        }
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "";
    }
}
