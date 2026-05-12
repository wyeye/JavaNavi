import { ensureLocalSession } from './localSession';

export interface Position { x: number; y: number; }
export interface Size { w: number; h: number; }
export interface EnvironmentInfo { buildType: string; platform: string; arch: string; }

type EventPayload = unknown;
type Handler = (...data: EventPayload[]) => void;
const listeners = new Map<string, Set<Handler>>();
const EVENT_STREAM_URL = '/api/v1/events/stream';

type EventBridgeState = 'idle' | 'connecting' | 'open' | 'error' | 'closed' | 'unavailable';
type EventPayloadRecord = Record<string, unknown>;
type CompatServerEvent = {
  id?: string;
  eventName?: string;
  event?: string;
  family?: string;
  source?: string;
  correlationId?: string;
  phase?: string;
  message?: string;
  timestamp?: string;
  payload?: EventPayload;
};

let eventBridgeSource: EventSource | null = null;
let eventBridgeState: EventBridgeState = 'idle';

const isEventPayloadRecord = (value: EventPayload): value is EventPayloadRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

function handleCompatServerEvent(rawData: string, lastEventId?: string): void {
  if (!rawData) return;
  let parsed: CompatServerEvent;
  try {
    parsed = JSON.parse(rawData) as CompatServerEvent;
  } catch (error) {
    console.warn('JavaNavi event bridge ignored malformed SSE payload.', error);
    return;
  }

  const eventName = typeof parsed.eventName === 'string' && parsed.eventName
    ? parsed.eventName
    : (typeof parsed.event === 'string' ? parsed.event : '');
  if (!eventName) return;

  const payload: EventPayload = isEventPayloadRecord(parsed.payload)
    ? { ...parsed.payload }
    : parsed.payload ?? {};
  if (isEventPayloadRecord(payload)) {
    if (parsed.id && payload.eventId === undefined) payload.eventId = parsed.id;
    if (lastEventId && payload.lastEventId === undefined) payload.lastEventId = lastEventId;
    if (parsed.family && payload.family === undefined) payload.family = parsed.family;
    if (parsed.correlationId && payload.correlationId === undefined) payload.correlationId = parsed.correlationId;
    if (parsed.phase && payload.phase === undefined) payload.phase = parsed.phase;
  }

  EventsEmit(eventName, payload);
}

export function StartEventBridge(): void {
  if (eventBridgeSource || eventBridgeState === 'connecting' || eventBridgeState === 'open') {
    return;
  }
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    eventBridgeState = 'unavailable';
    return;
  }

  eventBridgeState = 'connecting';
  void ensureLocalSession().then(() => {
    if (eventBridgeSource || eventBridgeState !== 'connecting') {
      return;
    }
    const source = new EventSource(EVENT_STREAM_URL, { withCredentials: true });
    eventBridgeSource = source;
    source.onopen = () => { eventBridgeState = 'open'; };
    source.onmessage = (event) => handleCompatServerEvent(event.data, event.lastEventId);
    source.addEventListener('compat-event', (event) => {
      handleCompatServerEvent((event as MessageEvent<string>).data, (event as MessageEvent<string>).lastEventId);
    });
    source.onerror = () => {
      eventBridgeState = source.readyState === EventSource.CLOSED ? 'closed' : 'error';
    };
  }).catch((error) => {
    eventBridgeSource = null;
    eventBridgeState = 'error';
    console.warn('JavaNavi event bridge failed to start.', error);
  });
}

export function StopEventBridge(): void {
  eventBridgeSource?.close();
  eventBridgeSource = null;
  eventBridgeState = 'closed';
}

export function EventBridgeState(): EventBridgeState {
  return eventBridgeState;
}

export function EventsEmit(eventName: string, ...data: EventPayload[]): void {
  listeners.get(eventName)?.forEach((handler) => handler(...data));
}

export function EventsOnMultiple<TPayload extends EventPayload[]>(eventName: string, callback: (...data: TPayload) => void, maxCallbacks: number): () => void {
  StartEventBridge();
  let calls = 0;
  const wrapped: Handler = (...data) => {
    calls += 1;
    callback(...(data as TPayload));
    if (maxCallbacks > -1 && calls >= maxCallbacks) EventsOff(eventName);
  };
  const set = listeners.get(eventName) ?? new Set<Handler>();
  set.add(wrapped);
  listeners.set(eventName, set);
  return () => set.delete(wrapped);
}

export function EventsOn<TPayload extends EventPayload[]>(eventName: string, callback: (...data: TPayload) => void): () => void { return EventsOnMultiple(eventName, callback, -1); }
export function EventsOnce<TPayload extends EventPayload[]>(eventName: string, callback: (...data: TPayload) => void): () => void { return EventsOnMultiple(eventName, callback, 1); }
export function EventsOff(eventName: string, ...additionalEventNames: string[]): void {
  [eventName, ...additionalEventNames].forEach((name) => listeners.delete(name));
}
export function EventsOffAll(): void { listeners.clear(); }

export function BrowserOpenURL(url: string): void { window.open(url, '_blank', 'noopener,noreferrer'); }
export async function Environment(): Promise<EnvironmentInfo> { return { buildType: import.meta.env.DEV ? 'dev' : 'production', platform: navigator.platform || 'web', arch: 'web' }; }
export function Quit(): void { console.info('Quit is not available in JavaNavi Web.'); }

export function WindowFullscreen(): void { void document.documentElement.requestFullscreen?.(); }
export function WindowUnfullscreen(): void { if (document.fullscreenElement) void document.exitFullscreen?.(); }
export async function WindowIsFullscreen(): Promise<boolean> { return Boolean(document.fullscreenElement); }
export function WindowMaximise(): void { /* no-op in browser */ }
export function WindowToggleMaximise(): void { /* no-op in browser */ }
export async function WindowIsMaximised(): Promise<boolean> { return false; }
export function WindowMinimise(): void { /* no-op in browser */ }
export async function WindowIsMinimised(): Promise<boolean> { return false; }
export async function WindowIsNormal(): Promise<boolean> { return true; }
export function WindowSetSize(width: number, height: number): void { void width; void height; }
export async function WindowGetSize(): Promise<Size> { return { w: window.innerWidth, h: window.innerHeight }; }
export function WindowSetPosition(x: number, y: number): void { void x; void y; }
export async function WindowGetPosition(): Promise<Position> { return { x: window.screenX || 0, y: window.screenY || 0 }; }

export function LogPrint(message: string): void { console.log(message); }
export function LogTrace(message: string): void { console.debug(message); }
export function LogDebug(message: string): void { console.debug(message); }
export function LogInfo(message: string): void { console.info(message); }
export function LogWarning(message: string): void { console.warn(message); }
export function LogError(message: string): void { console.error(message); }
export function LogFatal(message: string): void { console.error(message); }
export function WindowReload(): void { window.location.reload(); }
export function WindowReloadApp(): void { window.location.reload(); }
export function WindowSetAlwaysOnTop(b: boolean): void { void b; }
export function WindowSetSystemDefaultTheme(): void {}
export function WindowSetLightTheme(): void {}
export function WindowSetDarkTheme(): void {}
export function WindowCenter(): void {}
export function WindowSetTitle(title: string): void { document.title = title; }
export function WindowSetMaxSize(width: number, height: number): void { void width; void height; }
export function WindowSetMinSize(width: number, height: number): void { void width; void height; }
export function WindowHide(): void {}
export function WindowShow(): void {}
export function WindowUnmaximise(): void {}
export function WindowUnminimise(): void {}
export function WindowSetBackgroundColour(R: number, G: number, B: number, A: number): void { void R; void G; void B; void A; }
export interface ScreenInfo { isCurrent: boolean; isPrimary: boolean; width: number; height: number; }
export async function ScreenGetAll(): Promise<ScreenInfo[]> { return [{ isCurrent: true, isPrimary: true, width: window.screen.width, height: window.screen.height }]; }
