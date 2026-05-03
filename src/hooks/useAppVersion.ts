// ═══════════════════════════════════════════════════════════
// useAppVersion — Single source of truth for app version
//
// Reads from __APP_VERSION__ (injected by Vite from package.json)
// Falls back to 'dev' in non-Vite contexts (tests, storybook, etc.)
//
// Usage:
//   const version = useAppVersion();        // "0.1.0"
//   const display = useAppVersion('v');     // "v0.1.0"
// ═══════════════════════════════════════════════════════════

/** App version string — injected at build time by Vite (see vite.config.ts) */
export const APP_VERSION: string = __APP_VERSION__ ?? 'dev';

/**
 * React hook — returns the app version with optional prefix.
 * For non-React contexts, import APP_VERSION directly.
 */
export function useAppVersion(prefix = ''): string {
  return `${prefix}${APP_VERSION}`;
}
