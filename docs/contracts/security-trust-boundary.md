# JavaNavi Security and Trust Boundary Contract


[中文](zh/security-trust-boundary.md) | English
This contract protects JavaNavi's local Java/Web runtime while it implements database workflows referenced from [GoNavi](https://github.com/Syngnat/GoNavi).

## Why this gate exists

JavaNavi's current local web package exposes credential-bearing database, driver, AI, proxy, and file-workflow operations over a loopback HTTP boundary. Database passwords, SSH-related metadata, proxy credentials, API keys, and connection URIs must be protected before they cross that boundary or are written to logs/events.

## Required controls before real DB credentials

1. Bind to loopback by default.
2. Restrict CORS to configured local frontend origins.
3. Require a local-session token or equivalent CSRF protection for credential-bearing operations.
4. Reject cross-origin or missing-token credential requests.
5. Redact secrets in logs, exceptions, validation messages, event payloads, and browser-visible errors.
6. Store saved secrets through an encrypted or keyring-backed abstraction.
7. Document that exposing the local server outside a trusted local environment is unsupported unless a future auth model is added.

## Secret fields to redact

- `password`
- `apiKey`
- `secretRef`
- `ssh.password`
- `ssh.keyPath` when logged
- `proxy.password`
- `httpTunnel.password`
- `uri` and `dsn` if they include credentials
- `mysqlReplicaPassword`
- `mongoReplicaPassword`
- provider-specific headers and bearer tokens

## Acceptance checks

```text
SECURITY_LOOPBACK_BIND=passed
SECURITY_CORS_ORIGIN=passed
SECURITY_CSRF_LOCAL_SESSION=passed
SECURITY_CROSS_ORIGIN_REJECTED=passed
SECURITY_SECRET_REDACTION=passed
SECURITY_SECRET_STORAGE=passed
```

No external MySQL/PostgreSQL/Oracle/Redis/Mongo/optional driver credential path may be marked complete before these checks pass.

## Phase 2 implementation status

Implemented on 2026-04-28:

- `server.address` defaults to `127.0.0.1`.
- `WebConfig` restricts CORS to configured local dev origins.
- `LocalApiSecurityFilter` rejects disallowed `Origin` headers and requires a local-session token for unsafe methods plus sensitive GET/HEAD endpoints; only health/session bootstrap is public.
- `GET /api/v1/session` issues a per-client local-session token as an HttpOnly SameSite cookie and reports the configured header/cookie names, non-secret session id, and token fingerprint.
- `SecretRedactor` redacts common password/token/API-key and credential URI forms.
- `EncryptedFileSecretStore` provides an AES-GCM local-file encrypted secret-store abstraction.
- Browser adapter calls establish the local session through the JavaNavi compatibility adapter; modern flows rely on the HttpOnly SameSite cookie, while legacy header echo remains optional when explicitly returned by the backend.
- The SSE compatibility event bridge binds each subscriber to the authenticated local-session id that opened the stream. Published runtime/AI/job events are delivered only to subscribers from the same request-bound local session, not to every authenticated client in the process.
- Java-backed AI provider transport rejects localhost/private/link-local provider endpoints unless `JAVANAVI_ALLOW_PRIVATE_AI_ENDPOINTS=true` is set for trusted local testing.
- Secret redaction is implemented in backend runtime code and must be exercised through package/startup smoke or focused manual checks when credential paths change.

This gate allows later implementation of real credential flows, but it does not itself mark any external database driver as complete.
