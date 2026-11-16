// Where the API lives. Web (PWA) uses same-origin /api. The native iOS/Android shell loads files
// locally, so it needs the deployed URL: set REMOTE_API_BASE after deploying (deploy.ps1 does this).
export const REMOTE_API_BASE = '';

export function apiBase() {
  const native = !!window.Capacitor?.isNativePlatform?.();
  return native ? REMOTE_API_BASE : '';
}
