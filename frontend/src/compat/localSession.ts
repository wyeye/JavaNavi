const API_BASE = '/api/v1';

export type LocalSession = {
  token?: string;
  headerName: string;
  sessionId?: string;
  expiresAt?: string;
};

let localSessionPromise: Promise<LocalSession> | null = null;
let localSession: LocalSession | null = null;

const LOCAL_SESSION_REFRESH_SKEW_MS = 60_000;

function isLocalSessionUsable(session: LocalSession | null): session is LocalSession {
  if (!session?.token) return false;
  if (!session.expiresAt) return true;
  const expiresAt = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt - Date.now() > LOCAL_SESSION_REFRESH_SKEW_MS;
}

export function clearLocalSession(): void {
  localSession = null;
  localSessionPromise = null;
}

export function ensureLocalSession(forceRefresh = false): Promise<LocalSession> {
  if (forceRefresh) {
    clearLocalSession();
  } else if (isLocalSessionUsable(localSession)) {
    return Promise.resolve(localSession);
  } else if (localSession) {
    clearLocalSession();
  }
  if (!localSessionPromise) {
    localSessionPromise = fetch(`${API_BASE}/session`, { credentials: 'same-origin' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.data) {
          throw new Error(payload?.error?.message || 'Unable to establish JavaNavi local session.');
        }
        localSession = {
          token: typeof payload.data.token === 'string' ? payload.data.token : undefined,
          headerName: payload.data.headerName || 'X-JavaNavi-Session',
          sessionId: typeof payload.data.sessionId === 'string' ? payload.data.sessionId : undefined,
          expiresAt: typeof payload.data.expiresAt === 'string' ? payload.data.expiresAt : undefined,
        };
        return localSession;
      })
      .catch((error) => {
        clearLocalSession();
        throw error;
      });
  }
  return localSessionPromise;
}

export async function localSessionHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const session = await ensureLocalSession(forceRefresh);
  return session.token ? { [session.headerName]: session.token } : {};
}

export function isLocalSessionAuthFailure(status: number, payload: unknown): boolean {
  if (status !== 403) return false;
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const error = record.error && typeof record.error === 'object' && !Array.isArray(record.error)
    ? record.error as Record<string, unknown>
    : {};
  return error.code === 'security.localSessionRequired';
}
