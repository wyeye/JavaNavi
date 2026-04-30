declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: string): string;
}

declare module 'node:path' {
  interface PathModule {
    dirname(path: string): string;
    resolve(...paths: string[]): string;
  }

  const path: PathModule;
  export default path;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
