import type { ConnectionConfig } from '../types';
import { translate, type AppLanguage } from '../i18n';

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

export function sslModeRiskDescription(mode: unknown, language: AppLanguage = 'en'): string {
  const normalized = normalizeSSLMode(mode);
  if (normalized === 'preferred') {
    return translate(language, 'connectionModal.ssl.mode.preferred.description');
  }
  if (normalized === 'skip-verify') {
    return translate(language, 'connectionModal.ssl.mode.skipVerify.description');
  }
  if (normalized === 'required') {
    return translate(language, 'connectionModal.ssl.mode.required.description');
  }
  return translate(language, 'connectionModal.ssl.mode.disable.description');
}
