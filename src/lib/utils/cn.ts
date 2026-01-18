/**
 * 🎨 Class Name Utility for IdeaBox
 *
 * Combines clsx and tailwind-merge for optimal Tailwind CSS class handling.
 * This is the standard pattern used by shadcn/ui and modern React projects.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY THIS UTILITY?
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Problem: When merging Tailwind classes, conflicts can occur:
 * - `cn('p-4', 'p-2')` should result in 'p-2' (not 'p-4 p-2')
 * - `cn('text-red-500', 'text-blue-500')` should result in 'text-blue-500'
 *
 * Solution: tailwind-merge intelligently merges classes, removing conflicts.
 * clsx provides conditional class application.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE EXAMPLES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Basic usage:
 * ```tsx
 * import { cn } from '@/lib/utils/cn';
 *
 * <div className={cn('p-4 bg-white', className)} />
 * ```
 *
 * Conditional classes:
 * ```tsx
 * <button className={cn(
 *   'px-4 py-2 rounded',
 *   isActive && 'bg-blue-500 text-white',
 *   isDisabled && 'opacity-50 cursor-not-allowed'
 * )} />
 * ```
 *
 * Variant-based styling:
 * ```tsx
 * <div className={cn(
 *   'base-styles',
 *   {
 *     'variant-primary': variant === 'primary',
 *     'variant-secondary': variant === 'secondary',
 *   }
 * )} />
 * ```
 *
 * @module lib/utils/cn
 */

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines class names using clsx and merges Tailwind classes intelligently.
 *
 * @param inputs - Any number of class values (strings, objects, arrays)
 * @returns Merged and deduplicated class string
 *
 * @example
 * ```tsx
 * // Basic usage
 * cn('p-4', 'mt-2')
 * // => 'p-4 mt-2'
 *
 * // Conflict resolution (tailwind-merge handles this)
 * cn('p-4', 'p-2')
 * // => 'p-2' (not 'p-4 p-2')
 *
 * // Conditional classes
 * cn('base', isActive && 'active', isFocused && 'focused')
 * // => 'base active' (if isActive is true, isFocused is false)
 *
 * // Object syntax
 * cn('base', { 'text-red-500': hasError, 'text-green-500': isSuccess })
 * // => 'base text-red-500' (if hasError is true)
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
