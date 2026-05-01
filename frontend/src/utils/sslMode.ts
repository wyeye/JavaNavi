import type { ConnectionConfig } from '../types';

export type SSLMode = NonNullable<ConnectionConfig['sslMode']>;

export const DEFAULT_SSL_MODE: SSLMode = 'required';
export const LEGACY_COMPAT_SSL_MODE: SSLMode = 'preferred';

export function normalizeSSLMode(value: unknown, fallback: SSLMode = DEFAULT_SSL_MODE): SSLMode {
  const mode = String(value ?? '').trim().toLowerCase();
  if (mode === 'required' || mode === 'require' || mode === 'true' || mode === '1' || mode === 'yes' || mode === 'on') {
    return 'required';
  }
  if (mode === 'skip-verify' || mode === 'skipverify' || mode === 'skip_verify' || mode === 'insecure' || mode === 'insecure-skip-verify') {
    return 'skip-verify';
  }
  if (mode === 'preferred' || mode === 'prefer' || mode === 'compat' || mode === 'compatibility') {
    return 'preferred';
  }
  if (mode === 'disable' || mode === 'disabled' || mode === 'false' || mode === '0' || mode === 'no' || mode === 'off' || mode === 'none') {
    return 'disable';
  }
  return fallback;
}

export function resolveEffectiveSSLMode(value: unknown, useSSL: boolean): SSLMode {
  if (!useSSL) {
    return 'disable';
  }
  const normalized = normalizeSSLMode(value, DEFAULT_SSL_MODE);
  return normalized === 'disable' ? DEFAULT_SSL_MODE : normalized;
}

export function isInsecureSSLMode(mode: unknown): boolean {
  const normalized = normalizeSSLMode(mode);
  return normalized === 'preferred' || normalized === 'skip-verify';
}

export function sslModeRiskDescription(mode: unknown): string {
  const normalized = normalizeSSLMode(mode);
  if (normalized === 'preferred') {
    return '兼容模式：优先 TLS，但允许跳过证书校验，部分驱动可能回退明文。';
  }
  if (normalized === 'skip-verify') {
    return '跳过校验：使用 TLS 但不校验证书，仅适合本地自签或临时排障。';
  }
  if (normalized === 'required') {
    return '严格模式：必须使用 TLS，并进行证书校验。';
  }
  return '禁用 TLS：连接将不使用加密传输。';
}
