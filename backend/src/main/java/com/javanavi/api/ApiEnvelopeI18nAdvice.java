package com.javanavi.api;

import com.fasterxml.jackson.annotation.JsonValue;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.javanavi.i18n.I18nMessages;
import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.ApiError;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;

import java.lang.reflect.Method;
import java.lang.reflect.RecordComponent;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@ControllerAdvice
public class ApiEnvelopeI18nAdvice implements ResponseBodyAdvice<Object> {
    private static final Set<String> LOCALIZED_VALUE_KEYS = Set.of(
            "message",
            "schemaSummary",
            "stage",
            "installSourceLabel",
            "installSourceDetail",
            "displayLabel",
            "packageSizeText"
    );

    private final I18nMessages messages;

    public ApiEnvelopeI18nAdvice(I18nMessages messages) {
        this.messages = messages;
    }

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return true;
    }

    @Override
    public Object beforeBodyWrite(
            Object body,
            MethodParameter returnType,
            MediaType selectedContentType,
            Class<? extends HttpMessageConverter<?>> selectedConverterType,
            ServerHttpRequest request,
            ServerHttpResponse response
    ) {
        if (!(body instanceof ApiEnvelope<?> envelope)) {
            return body;
        }
        ApiError error = envelope.error();
        ApiError localizedError = error == null ? null : new ApiError(error.code(), messages.localizeFallback(error.message()), error.errorId());
        return new ApiEnvelope<>(envelope.success(), localizeData(envelope.data()), localizedError);
    }

    @SuppressWarnings("unchecked")
    private Object localizeData(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> copy = new LinkedHashMap<>();
            map.forEach((rawKey, rawValue) -> {
                String key = String.valueOf(rawKey);
                if (rawValue instanceof String text && LOCALIZED_VALUE_KEYS.contains(key)) {
                    copy.put(key, messages.localizeFallback(text));
                } else {
                    copy.put(key, localizeData(rawValue));
                }
            });
            return copy;
        }
        if (value instanceof List<?> list) {
            return list.stream().map(this::localizeData).toList();
        }
        if (value != null && value.getClass().isRecord()) {
            Method jsonValue = jsonValueMethod(value.getClass());
            if (jsonValue != null) {
                return invokeJsonValue(value, jsonValue);
            }
            Map<String, Object> copy = new LinkedHashMap<>();
            for (RecordComponent component : value.getClass().getRecordComponents()) {
                String key = jsonPropertyName(component);
                Object rawValue = recordComponentValue(value, component);
                if (rawValue instanceof String text && LOCALIZED_VALUE_KEYS.contains(key)) {
                    copy.put(key, messages.localizeFallback(text));
                } else {
                    copy.put(key, localizeData(rawValue));
                }
            }
            return copy;
        }
        return value;
    }

    private static String jsonPropertyName(RecordComponent component) {
        JsonProperty property = component.getAnnotation(JsonProperty.class);
        if (property != null && !property.value().isBlank()) {
            return property.value();
        }
        JsonProperty accessorProperty = component.getAccessor().getAnnotation(JsonProperty.class);
        if (accessorProperty != null && !accessorProperty.value().isBlank()) {
            return accessorProperty.value();
        }
        return component.getName();
    }

    private static Method jsonValueMethod(Class<?> valueType) {
        for (Method method : valueType.getDeclaredMethods()) {
            if (method.getParameterCount() == 0 && method.getAnnotation(JsonValue.class) != null) {
                method.setAccessible(true);
                return method;
            }
        }
        return null;
    }

    private static Object invokeJsonValue(Object value, Method method) {
        try {
            return method.invoke(value);
        } catch (ReflectiveOperationException error) {
            throw new IllegalStateException("Unable to read API response JSON value.", error);
        }
    }

    private static Object recordComponentValue(Object value, RecordComponent component) {
        try {
            return component.getAccessor().invoke(value);
        } catch (ReflectiveOperationException error) {
            throw new IllegalStateException("Unable to read API response record component.", error);
        }
    }
}
