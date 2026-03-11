/**
 * 📦 UI Components Barrel Export for IdeaBox
 *
 * Central export for all UI components.
 * Import components from this file for cleaner imports throughout the app.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Single import:
 * ```tsx
 * import { Button, Input, Card } from '@/components/ui';
 * ```
 *
 * Multiple imports:
 * ```tsx
 * import {
 *   Button,
 *   Card,
 *   CardHeader,
 *   CardContent,
 *   Input,
 *   Badge,
 *   Dialog,
 *   DialogContent,
 *   useToast,
 * } from '@/components/ui';
 * ```
 *
 * @module components/ui
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CORE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export { Button, buttonVariants, type ButtonProps } from './button';
export { Input, type InputProps } from './input';
export { Textarea, type TextareaProps } from './textarea';
export { Label, type LabelProps } from './label';
export { Checkbox, type CheckboxProps } from './checkbox';
export { Switch, type SwitchProps } from './switch';

// ═══════════════════════════════════════════════════════════════════════════════
// CARD COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from './card';

// ═══════════════════════════════════════════════════════════════════════════════
// BADGE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export { Badge, badgeVariants, type BadgeProps } from './badge';

// ═══════════════════════════════════════════════════════════════════════════════
// SELECT COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from './select';

// ═══════════════════════════════════════════════════════════════════════════════
// DIALOG COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './dialog';

// ═══════════════════════════════════════════════════════════════════════════════
// SHEET COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from './sheet';

// ═══════════════════════════════════════════════════════════════════════════════
// DROPDOWN MENU COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from './dropdown-menu';

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
} from './toast';

export { Toaster } from './toaster';
export { useToast, toast } from './use-toast';

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  Skeleton,
  EmailCardSkeleton,
  ActionItemSkeleton,
  ClientCardSkeleton,
  TableRowSkeleton,
  type SkeletonProps,
} from './skeleton';

export {
  Spinner,
  LoadingState,
  FullPageLoader,
  InlineLoader,
  type SpinnerProps,
  type LoadingStateProps,
  type FullPageLoaderProps,
  type InlineLoaderProps,
} from './spinner';

// ═══════════════════════════════════════════════════════════════════════════════
// TABS COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  type TabsListProps,
  type TabsTriggerProps,
  type TabsContentProps,
} from './tabs';

// ═══════════════════════════════════════════════════════════════════════════════
// HOVER CARD COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from './hover-card';

// ═══════════════════════════════════════════════════════════════════════════════
// POPOVER COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export { Popover, type PopoverProps } from './popover';

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export { Progress, type ProgressProps } from './progress';

// ═══════════════════════════════════════════════════════════════════════════════
// PAGINATION COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
  Pagination,
  usePaginationInfo,
  type PaginationProps,
  type PaginationInfo,
} from './pagination';
