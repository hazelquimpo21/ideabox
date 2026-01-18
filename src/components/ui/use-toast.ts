/**
 * 🪝 useToast Hook for IdeaBox
 *
 * React hook for showing toast notifications.
 * Provides a simple API for triggering toasts from anywhere in the app.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Setup (in layout):
 * ```tsx
 * import { Toaster } from '@/components/ui/toaster';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         <Toaster />
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 *
 * Usage in components:
 * ```tsx
 * import { useToast } from '@/components/ui/use-toast';
 *
 * function MyComponent() {
 *   const { toast } = useToast();
 *
 *   const handleClick = () => {
 *     toast({
 *       title: "Success!",
 *       description: "Your changes have been saved.",
 *     });
 *   };
 *
 *   return <Button onClick={handleClick}>Save</Button>;
 * }
 * ```
 *
 * Variants:
 * ```tsx
 * // Success
 * toast({ variant: "success", title: "Saved!" });
 *
 * // Error
 * toast({ variant: "destructive", title: "Error", description: "Something went wrong." });
 *
 * // With action
 * toast({
 *   title: "Email archived",
 *   description: "The email has been moved to archive.",
 *   action: <ToastAction altText="Undo">Undo</ToastAction>,
 * });
 * ```
 *
 * @module components/ui/use-toast
 */

'use client';

import * as React from 'react';
import type { ToastActionElement, ToastProps } from './toast';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum number of toasts to show at once.
 */
const TOAST_LIMIT = 3;

/**
 * Duration before auto-dismissing (in ms).
 * Set to a sensible default that gives users time to read.
 */
const TOAST_REMOVE_DELAY = 5000;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Toast data structure.
 */
type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

/**
 * Actions that can be dispatched to modify toast state.
 */
type Action =
  | { type: 'ADD_TOAST'; toast: ToasterToast }
  | { type: 'UPDATE_TOAST'; toast: Partial<ToasterToast> }
  | { type: 'DISMISS_TOAST'; toastId?: string }
  | { type: 'REMOVE_TOAST'; toastId?: string };

/**
 * State shape for toast management.
 */
interface State {
  toasts: ToasterToast[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map of toast IDs to their removal timeouts.
 * Used to manage auto-dismissal.
 */
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Schedules removal of a toast after the delay.
 */
const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: 'REMOVE_TOAST',
      toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

/**
 * Reducer for toast state management.
 */
export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case 'DISMISS_TOAST': {
      const { toastId } = action;

      // Schedule removal
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((t) => {
          addToRemoveQueue(t.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? { ...t, open: false }
            : t
        ),
      };
    }

    case 'REMOVE_TOAST':
      if (action.toastId === undefined) {
        return { ...state, toasts: [] };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL STATE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Listeners for state changes.
 * Used to trigger re-renders in consuming components.
 */
const listeners: Array<(state: State) => void> = [];

/**
 * Current state.
 */
let memoryState: State = { toasts: [] };

/**
 * Dispatch an action to update state.
 */
function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Counter for generating unique toast IDs.
 */
let count = 0;

/**
 * Generates a unique toast ID.
 */
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

/**
 * Toast options.
 */
type Toast = Omit<ToasterToast, 'id'>;

/**
 * Creates and shows a toast notification.
 *
 * @param props - Toast configuration
 * @returns Object with id and methods to update/dismiss the toast
 *
 * @example
 * ```tsx
 * // Basic toast
 * toast({ title: "Hello!" });
 *
 * // With description
 * toast({
 *   title: "Saved",
 *   description: "Your changes have been saved."
 * });
 *
 * // Error toast
 * toast({
 *   variant: "destructive",
 *   title: "Error",
 *   description: "Something went wrong."
 * });
 *
 * // Update existing toast
 * const { id, update, dismiss } = toast({ title: "Loading..." });
 * update({ id, title: "Done!" });
 * ```
 */
function toast({ ...props }: Toast) {
  const id = genId();

  const update = (props: ToasterToast) =>
    dispatch({
      type: 'UPDATE_TOAST',
      toast: { ...props, id },
    });

  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', toastId: id });

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return {
    id,
    dismiss,
    update,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hook for managing toast notifications.
 *
 * @returns Object containing toasts array, toast function, and dismiss function
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { toast, dismiss } = useToast();
 *
 *   const handleSave = async () => {
 *     const { id } = toast({ title: "Saving..." });
 *
 *     try {
 *       await saveData();
 *       toast({ title: "Saved!" });
 *     } catch (error) {
 *       toast({
 *         variant: "destructive",
 *         title: "Error",
 *         description: error.message,
 *       });
 *     }
 *   };
 *
 *   return <Button onClick={handleSave}>Save</Button>;
 * }
 * ```
 */
function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export { useToast, toast };
