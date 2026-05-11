// JavaNavi AI service compatibility adapter.
// Provider/session/settings state is stored by the Java backend; stream failures surface as real errors.

import { localSessionHeaders } from './localSession';
import { currentLanguageHeaderValue, getRuntimeLanguage, translateBackendFallback } from '../i18n';

const API_BASE = '/api/v1';

function localizeAIBackendMessage(message: unknown, fallbackMessage = 'JavaNavi AI request failed.'): string {
  const raw = String(message || fallbackMessage || 'JavaNavi AI request failed.');
  return translateBackendFallback(getRuntimeLanguage(), raw);
}

async function getJson(path: string): Promise<any> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { ...(await aiServiceHeaders()) },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(localizeAIBackendMessage(payload?.error?.message || response.statusText, 'JavaNavi AI request failed.'));
  }
  return payload;
}

async function postJson(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(await aiServiceHeaders()) },
    body: JSON.stringify(body || {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(localizeAIBackendMessage(payload?.error?.message || response.statusText, 'JavaNavi AI request failed.'));
  }
  return payload;
}

async function aiServiceHeaders(): Promise<Record<string, string>> {
  const language = currentLanguageHeaderValue(getRuntimeLanguage());
  return {
    ...(await localSessionHeaders()),
    'X-JavaNavi-Language': language,
    'Accept-Language': language,
  };
}

function dataOrThrow<T = any>(payload: any, fallbackMessage: string): T {
  if (!payload || payload.success === false) {
    throw new Error(localizeAIBackendMessage(payload?.error?.message || payload?.message, fallbackMessage));
  }
  return (payload.data ?? payload) as T;
}

export async function AIChatCancel(arg1: string): Promise<void> {
  await postJson('/ai/chat/cancel', { sessionId: arg1 });
}

export async function AIChatSend(arg1: any[] = [], arg2: any[] = []): Promise<Record<string, any>> {
  return dataOrThrow<Record<string, any>>(
    await postJson('/ai/chat/send', { messages: Array.isArray(arg1) ? arg1 : [], tools: Array.isArray(arg2) ? arg2 : [] }),
    'Failed to send JavaNavi AI chat request.',
  );
}

export async function AIChatStream(arg1: string, arg2: any[] = [], arg3: any[] = []): Promise<void> {
  await postJson('/ai/chat/stream', {
    sessionId: arg1,
    messages: Array.isArray(arg2) ? arg2 : [],
    tools: Array.isArray(arg3) ? arg3 : [],
  });
}

export async function AICheckSQL(arg1: string): Promise<any> {
  return dataOrThrow<any>(await postJson('/ai/safety/check-sql', { sql: arg1 }), 'Failed to check SQL safety.');
}

export async function AIDeleteProvider(arg1: string): Promise<void> {
  await postJson('/ai/providers/delete', { id: arg1 });
}

export async function AIDeleteSession(arg1: string): Promise<void> {
  await postJson('/ai/sessions/delete', { sessionId: arg1 });
}

export async function AIGetActiveProvider(): Promise<any> {
  return dataOrThrow<string>(await getJson('/ai/providers/active'), 'Failed to load active AI provider.');
}

export async function AIGetBuiltinPrompts(): Promise<Record<string, string>> {
  return dataOrThrow<Record<string, string>>(await getJson('/ai/prompts/builtin'), 'Failed to load built-in AI prompts.');
}

export async function AIGetContextLevel(): Promise<any> {
  return dataOrThrow<string>(await getJson('/ai/settings/context'), 'Failed to load AI context level.');
}

export async function AIGetProviders(): Promise<any[]> {
  return dataOrThrow<any[]>(await getJson('/ai/providers'), 'Failed to load AI providers.');
}

export async function AIGetSafetyLevel(): Promise<any> {
  return dataOrThrow<string>(await getJson('/ai/settings/safety'), 'Failed to load AI safety level.');
}

export async function AIGetSessions(): Promise<Array<{ id: string; title: string; updatedAt: number }>> {
  return dataOrThrow<Array<{ id: string; title: string; updatedAt: number }>>(await getJson('/ai/sessions'), 'Failed to load AI sessions.');
}

export async function AIListModels(): Promise<Record<string, any>> {
  return dataOrThrow<Record<string, any>>(await getJson('/ai/models'), 'Failed to load AI models.');
}

export async function AILoadSession(arg1: string): Promise<Record<string, any>> {
  return dataOrThrow<Record<string, any>>(await postJson('/ai/sessions/load', { sessionId: arg1 }), 'Failed to load AI session.');
}

export async function AISaveProvider(arg1: any): Promise<void> {
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

export async function AITestProvider(arg1: any): Promise<Record<string, any>> {
  return dataOrThrow<Record<string, any>>(await postJson('/ai/providers/test', arg1 || {}), 'Failed to validate AI provider.');
}
