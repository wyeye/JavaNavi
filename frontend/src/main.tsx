import * as compatibilityApp from './compat/javanaviApp'
import * as compatibilityAI from './compat/aiService'
import * as compatibilityRuntime from './compat/runtime'

if (typeof window !== 'undefined' && !window.runtime) {
    window.runtime = compatibilityRuntime;
}

if (typeof window !== 'undefined' && !window.go) {
    const appBridge = {
        ...compatibilityApp,
        CheckUpdate: compatibilityApp.CheckForUpdates,
        OpenConnection: compatibilityApp.DBConnect,
        CloseConnection: compatibilityApp.CloseConnection,
        DeleteConnection: async (id: string) => {
            await compatibilityApp.DeleteConnection(id);
            return null;
        },
        GetDatabases: compatibilityApp.DBGetDatabases,
        GetTables: compatibilityApp.DBGetTables,
        GetTableColumns: compatibilityApp.DBGetColumns,
        ExecuteQuery: compatibilityApp.DBQuery,
    } satisfies JavaNaviAppBridge;

    window.go = {
        app: {
            App: appBridge,
        },
        aiservice: {
            Service: compatibilityAI,
        },
    };
}

void import('./bootstrap').catch((error) => {
    console.error('JavaNavi UI bootstrap failed', error);
    const root = document.getElementById('root');
    if (root) {
        const fallback = document.createElement('div');
        fallback.style.fontFamily = 'sans-serif';
        fallback.style.padding = '24px';
        fallback.style.color = '#b00020';
        fallback.textContent = 'JavaNavi UI 启动失败，请查看控制台日志。';
        root.replaceChildren(fallback);
    }
});
