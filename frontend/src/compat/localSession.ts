const API_BASE = '/api/v1';

export type LocalSession = {
  token?: string;
  headerName: string;
  sessionId?: string;
};

let localSessionPromise: Promise<LocalSession> | null = null;

export function ensureLocalSession(): Promise<LocalSession> {
  if (!localSessionPromise) {
    localSessionPromise = fetch(`${API_BASE}/session`, { credentials: 'same-origin' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.data) {
          throw new Error(payload?.error?.message || 'Unable to establish JavaNavi local session.');
        }
        return {
          token: typeof payload.data.token === 'string' ? payload.data.token : undefined,
          headerName: payload.data.headerName || 'X-JavaNavi-Session',
          sessionId: typeof payload.data.sessionId === 'string' ? payload.data.sessionId : undefined,
        };
      })
      .catch((error) => {
        localSessionPromise = null;
        throw error;
      });
  }
  return localSessionPromise;
}

export async function localSessionHeaders(): Promise<Record<string, string>> {
  const session = await ensureLocalSession();
  return session.token ? { [session.headerName]: session.token } : {};
}
