export {};

declare global {
  type JavaNaviRuntimeBridge = typeof import('./compat/runtime');
  type JavaNaviAiBridge = typeof import('./compat/aiService');
  type JavaNaviAppCompat = typeof import('./compat/javanaviApp');

  type JavaNaviAppBridge = Omit<JavaNaviAppCompat, 'DeleteConnection'> & {
    OpenConnection: JavaNaviAppCompat['DBConnect'];
    CloseConnection: JavaNaviAppCompat['CloseConnection'];
    DeleteConnection: (id: string) => Promise<null>;
    GetDatabases: JavaNaviAppCompat['DBGetDatabases'];
    GetTables: JavaNaviAppCompat['DBGetTables'];
    GetTableColumns: JavaNaviAppCompat['DBGetColumns'];
    ExecuteQuery: JavaNaviAppCompat['DBQuery'];
  };

  type JavaNaviGoBridge = {
    app: {
      App: JavaNaviAppBridge;
    };
    aiservice: {
      Service: JavaNaviAiBridge;
    };
  };

  type JavaNaviIpcRendererEvent = {
    sender?: unknown;
    senderId?: number;
    ports?: readonly MessagePort[];
  };

  type JavaNaviIpcRenderer = {
    send: (channel: string, ...args: unknown[]) => void;
    on: (channel: string, listener: (event: JavaNaviIpcRendererEvent, ...args: unknown[]) => void) => void;
    off: (channel: string, listener: (event: JavaNaviIpcRendererEvent, ...args: unknown[]) => void) => void;
    invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
  };

  type JavaNaviBrowserSecrets = {
    getConnectionPassword?: (connectionId: string) => string | undefined;
  };

  interface Window {
    go?: JavaNaviGoBridge;
    runtime?: JavaNaviRuntimeBridge;
    ipcRenderer?: JavaNaviIpcRenderer;
    __javanaviBrowserSecrets?: JavaNaviBrowserSecrets;
  }
}
