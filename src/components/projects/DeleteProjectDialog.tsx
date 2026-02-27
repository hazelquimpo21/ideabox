/**
 * Delete Project Dialog
 *
 * Confirmation dialog for permanently deleting a project.
 * Shows the project name and warns about cascading item deletion.
 *
 * @module components/projects/DeleteProjectDialog
 * @since February 2026
 */

'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
} from '@/components/ui';
import { AlertTriangle } from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('DeleteProjectDialog');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  projectId: string;
  onDelete: (id: string) => Promise<void>;
  onDeleted?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function DeleteProjectDialog({
  open,
  onOpenChange,
  projectName,
  projectId,
  onDelete,
  onDeleted,
}: DeleteProjectDialogProps) {
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    logger.start('Deleting project', { id: projectId });

    await onDelete(projectId);

    logger.success('Project deleted via dialog', { id: projectId });
    setIsDeleting(false);
    onOpenChange(false);
    onDeleted?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Project
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-3">
          <p className="text-sm">
            Are you sure you want to delete{' '}
            <span className="font-semibold">{projectName}</span>?
          </p>
          <p className="text-sm text-muted-foreground">
            All items inside this project will also be permanently deleted. This cannot be undone.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
