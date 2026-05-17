// JavaNavi AI service compatibility adapter.
// Provider/session/settings state is stored by the Java backend; stream failures surface as real errors.

import { isLocalSessionAuthFailure, localSessionHeaders } from './localSession';
import { currentLanguageHeaderValue, getRuntimeLanguage, translateBackendFallback } from '../i18n';
import type { AiChatSendResult, AiContextLevelValue, AiMessage, AiModelListResult, AiProviderConfig, AiProviderTestResult, AiSafetyLevelValue, AiSafetyResult, AiSessionPayload, AiSessionSummary, AiTool, ApiPayload } from './contracts';

const API_BASE = '/api/v1';

function localizeAIBackendMessage(message: unknown, fallbackMessage = 'JavaNavi AI request failed.'): string {
  const raw = String(message || fallbackMessage || 'JavaNavi AI request failed.');
  return translateBackendFallback(getRuntimeLanguage(), raw);
}

async function getJson<T = unknown>(path: string): Promise<ApiPayload<T>> {
  const { response, payload } = await fetchWithLocalSessionRetry(path, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { ...(await aiServiceHeaders()) },
  }, async () => ({ ...(await aiServiceHeaders(true)) }));
  if (!response.ok) {
    throw new Error(localizeAIBackendMessage(payload?.error?.message || response.statusText, 'JavaNavi AI request failed.'));
  }
  return payload;
}

async function postJson<T = unknown>(path: string, body: unknown): Promise<ApiPayload<T>> {
  const { response, payload } = await fetchWithLocalSessionRetry(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(await aiServiceHeaders()) },
    body: JSON.stringify(body || {}),
  }, async () => ({ ...(await aiServiceHeaders(true)) }));
  if (!response.ok) {
    throw new Error(localizeAIBackendMessage(payload?.error?.message || response.statusText, 'JavaNavi AI request failed.'));
  }
  return payload;
}

async function aiServiceHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const language = currentLanguageHeaderValue(getRuntimeLanguage());
  return {
    ...(await localSessionHeaders(forceRefresh)),
    'X-JavaNavi-Language': language,
    'Accept-Language': language,
  };
}

async function fetchWithLocalSessionRetry(path: string, init: RequestInit, refreshHeaders: () => Promise<Record<string, string>>): Promise<{ response: Response; payload: any }> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const payload = await response.json().catch(() => null);
  if (!isLocalSessionAuthFailure(response.status, payload)) {
    return { response, payload };
  }
  const retryResponse = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(await refreshHeaders()),
    },
  });
  return { response: retryResponse, payload: await retryResponse.json().catch(() => null) };
}

function dataOrThrow<T = unknown>(payload: ApiPayload<T | null> | null, fallbackMessage: string): T {
  const envelope = payload as { success?: boolean; error?: { message?: string }; message?: string; data?: T } | null;
  if (!envelope || envelope.success === false) {
    throw new Error(localizeAIBackendMessage(envelope?.error?.message || envelope?.message, fallbackMessage));
  }
  return (envelope.data ?? payload) as T;
}

function envelopeResult<T extends object>(payload: ApiPayload<T | null>, fallbackMessage: string): T & { success: boolean; error?: string } {
  const envelope = payload as { success?: boolean; error?: { message?: string } | string; message?: string; data?: T | null };
  const data = (envelope?.data && typeof envelope.data === 'object' ? envelope.data : {}) as T;
  const rawError = envelope?.error;
  const error = typeof rawError === 'string' ? rawError : rawError?.message || envelope?.message;
  return {
    ...data,
    success: envelope?.success !== false,
    ...(error ? { error: localizeAIBackendMessage(error, fallbackMessage) } : {}),
  };
}

export async function AIChatCancel(arg1: string): Promise<void> {
  await postJson('/ai/chat/cancel', { sessionId: arg1 });
}

export async function AIChatSend(arg1: AiMessage[] = [], arg2: AiTool[] = []): Promise<AiChatSendResult> {
  return envelopeResult<AiChatSendResult>(
    await postJson('/ai/chat/send', { messages: Array.isArray(arg1) ? arg1 : [], tools: Array.isArray(arg2) ? arg2 : [] }),
    'Failed to send JavaNavi AI chat request.',
  );
}

export async function AIChatStream(arg1: string, arg2: AiMessage[] = [], arg3: AiTool[] = []): Promise<void> {
  await postJson('/ai/chat/stream', {
    sessionId: arg1,
    messages: Array.isArray(arg2) ? arg2 : [],
    tools: Array.isArray(arg3) ? arg3 : [],
  });
}

export async function AICheckSQL(arg1: string): Promise<AiSafetyResult> {
  return dataOrThrow<AiSafetyResult>(await postJson('/ai/safety/check-sql', { sql: arg1 }), 'Failed to check SQL safety.');
}

export async function AIDeleteProvider(arg1: string): Promise<void> {
  await postJson('/ai/providers/delete', { id: arg1 });
}

export async function AIDeleteSession(arg1: string): Promise<void> {
  await postJson('/ai/sessions/delete', { sessionId: arg1 });
}

export async function AIGetActiveProvider(): Promise<string> {
  return dataOrThrow<string>(await getJson('/ai/providers/active'), 'Failed to load active AI provider.');
}

export async function AIGetBuiltinPrompts(): Promise<Record<string, string>> {
  return dataOrThrow<Record<string, string>>(await getJson('/ai/prompts/builtin'), 'Failed to load built-in AI prompts.');
}

export async function AIGetContextLevel(): Promise<AiContextLevelValue> {
  return dataOrThrow<AiContextLevelValue>(await getJson('/ai/settings/context'), 'Failed to load AI context level.');
}

export async function AIGetProviders(): Promise<AiProviderConfig[]> {
  return dataOrThrow<AiProviderConfig[]>(await getJson('/ai/providers'), 'Failed to load AI providers.');
}

export async function AIGetSafetyLevel(): Promise<AiSafetyLevelValue> {
  return dataOrThrow<AiSafetyLevelValue>(await getJson('/ai/settings/safety'), 'Failed to load AI safety level.');
}

export async function AIGetSessions(): Promise<AiSessionSummary[]> {
  return dataOrThrow<AiSessionSummary[]>(await getJson('/ai/sessions'), 'Failed to load AI sessions.');
}

export async function AIListModels(): Promise<AiModelListResult> {
  return envelopeResult<AiModelListResult>(await getJson('/ai/models'), 'Failed to load AI models.');
}

export async function AILoadSession(arg1: string): Promise<AiSessionPayload> {
  return envelopeResult<AiSessionPayload>(await postJson('/ai/sessions/load', { sessionId: arg1 }), 'Failed to load AI session.');
}

export async function AISaveProvider(arg1: AiProviderConfig): Promise<void> {
  await postJson('/ai/providers/save', arg1 || {});
}

export async function AISaveSession(arg1: string, arg2: string, arg3: number, arg4: string): Promise<void> {
  await postJson('/ai/sessions/save', { sessionId: arg1, title: arg2, updatedAt: arg3, messagesJSON: arg4 });
}

export async function AISetActiveProvider(arg1: string): Promise<void> {
  await postJson('/ai/providers/active', { id: arg1 });
}

export async function AISetContextLevel(arg1: string): Promise<void> {
  await postJson('/ai/settings/context', { level: arg1 });
}

export async function AISetSafetyLevel(arg1: string): Promise<void> {
  await postJson('/ai/settings/safety', { level: arg1 });
}

export async function AITestProvider(arg1: AiProviderConfig): Promise<AiProviderTestResult> {
  return envelopeResult<AiProviderTestResult>(await postJson('/ai/providers/test', arg1 || {}), 'Failed to validate AI provider.');
}
