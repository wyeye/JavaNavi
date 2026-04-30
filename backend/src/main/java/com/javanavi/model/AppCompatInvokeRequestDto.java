package com.javanavi.model;

import java.util.List;

public record AppCompatInvokeRequestDto(
        String method,
        List<Object> args
) {
}
