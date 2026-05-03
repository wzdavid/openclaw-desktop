/**
 * Theme-aware color utilities
 * Instead of hardcoded colors, these functions read from CSS variables
 * so they automatically adapt to dark/light mode.
 *
 * Usage:
 *   themeHex('primary')           → '#4EC9B0' (dark) / '#14A087' (light)
 *   themeAlpha('primary', 0.1)    → 'rgba(78,201,176,0.1)' / 'rgba(20,160,135,0.1)'
 *   overlay(0.05)                 → 'rgba(255,255,255,0.05)' / 'rgba(0,0,0,0.05)'
 *   dataColor(0)                  → '#4EC9B0' (dark) / '#0D9B7A' (light)
 *
 * ⚠️ These read getComputedStyle at call time — always call inside
 *    render functions, useMemo, or event handlers. Never at module scope.
 */

function getVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name).trim();
}

/** Returns HEX color — for Charts, SVG fill/stroke, style={{}} */
export function themeHex(name: 'primary' | 'accent' | 'danger' | 'warning' | 'success'): string {
  const rgb = getVar(`--aegis-${name}`);
  const [r, g, b] = rgb.split(' ').map(Number);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return '#888888';
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Returns rgba() with alpha — replaces `#4EC9B015` hex-alpha patterns */
export function themeAlpha(name: string, alpha: number): string {
  const rgb = getVar(`--aegis-${name}`);
  return `rgba(${rgb.replace(/ /g, ',')},${alpha})`;
}

/** Overlay color — white in dark, black in light — replaces rgba(255,255,255,X) */
export function overlay(alpha: number): string {
  const rgb = getVar('--aegis-overlay');
  return `rgba(${rgb.replace(/ /g, ',')},${alpha})`;
}

/** Data visualization palette — for charts, agent/model colors */
export function dataColor(index: number): string {
  return getVar(`--aegis-data-${(index % 10) + 1}`);
}
