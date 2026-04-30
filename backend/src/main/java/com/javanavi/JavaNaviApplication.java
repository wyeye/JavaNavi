package com.javanavi;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class JavaNaviApplication {
    public static void main(String[] args) {
        SpringApplication.run(JavaNaviApplication.class, args);
    }
}
