package com.javanavi.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties(prefix = "javanavi.security")
public class SecurityProperties {
    private boolean localSessionRequired = true;
    private String sessionHeader = "X-JavaNavi-Session";
    private String sessionCookie = "JAVANAVI_SESSION";
    private List<String> allowedOrigins = new ArrayList<>(List.of(
            "http://localhost:5173",
            "http://127.0.0.1:5173"
    ));
    private String dataDirectory = Path.of(System.getProperty("user.home"), ".javanavi").toString();

    public boolean isLocalSessionRequired() {
        return localSessionRequired;
    }

    public void setLocalSessionRequired(boolean localSessionRequired) {
        this.localSessionRequired = localSessionRequired;
    }

    public String getSessionHeader() {
        return sessionHeader;
    }

    public void setSessionHeader(String sessionHeader) {
        this.sessionHeader = sessionHeader;
    }

    public String getSessionCookie() {
        return sessionCookie;
    }

    public void setSessionCookie(String sessionCookie) {
        this.sessionCookie = sessionCookie;
    }

    public List<String> getAllowedOrigins() {
        return allowedOrigins;
    }

    public void setAllowedOrigins(List<String> allowedOrigins) {
        this.allowedOrigins = allowedOrigins == null ? new ArrayList<>() : new ArrayList<>(allowedOrigins);
    }

    public String getDataDirectory() {
        return dataDirectory;
    }

    public void setDataDirectory(String dataDirectory) {
        this.dataDirectory = dataDirectory;
    }
}
