// ═══════════════════════════════════════════════════════════
// Gateway — re-export from modular gateway/
// Backward compatible: import { gateway } from '@/services/gateway'
// ═══════════════════════════════════════════════════════════
export { gateway } from './gateway/index';
export type { ChatMessage, MediaInfo, GatewayCallbacks } from './gateway/index';
