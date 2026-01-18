/**
 * Auth Components Barrel Export
 *
 * Provides clean imports for authentication-related components.
 *
 * @example
 * ```tsx
 * import { ProtectedRoute, withProtectedRoute } from '@/components/auth';
 * ```
 *
 * @module components/auth
 */

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export { ProtectedRoute, withProtectedRoute } from './ProtectedRoute';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type { ProtectedRouteProps } from './ProtectedRoute';
