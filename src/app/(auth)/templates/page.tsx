/**
 * Email Templates Page
 *
 * Lists all email templates with CRUD operations.
 * Templates can be used when creating email campaigns.
 *
 * @module app/(auth)/templates/page
 */

'use client';

import * as React from 'react';
import { PageHeader } from '@/components/layout';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Input,
  Label,
  Textarea,
  Skeleton,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { useTemplates, type Template, type CreateTemplateData } from '@/hooks';
import {
  FileText,
  Plus,
  MoreHorizontal,
  Loader2,
  Pencil,
  Trash2,
  Copy,
  Clock,
  Hash,
  AlertCircle,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('TemplatesPage');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Formats a date string for display.
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Extracts merge fields from template text.
 */
function extractMergeFields(text: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const fields = new Set<string>();
  let match;
  while ((match = regex.exec(text)) !== null) {
    fields.add(match[1].trim());
  }
  return Array.from(fields);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface TemplateCardProps {
  template: Template;
  onEdit: (template: Template) => void;
  onDuplicate: (template: Template) => void;
  onDelete: (template: Template) => void;
}

function TemplateCard({ template, onEdit, onDuplicate, onDelete }: TemplateCardProps) {
  const [showMenu, setShowMenu] = React.useState(false);

  // Get preview text (strip HTML and truncate)
  const previewText = template.body_html_template
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{template.name}</CardTitle>
            {template.category && (
              <Badge variant="secondary" className="mt-1 text-xs">
                {template.category}
              </Badge>
            )}
          </div>
          <div className="relative ml-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setShowMenu(!showMenu)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border rounded-md shadow-md z-20">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onEdit(template);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDuplicate(template);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted"
                  >
                    <Copy className="h-4 w-4" />
                    Duplicate
                  </button>
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDelete(template);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Subject preview */}
        <p className="text-sm font-medium text-muted-foreground mb-1">
          Subject: {template.subject_template}
        </p>

        {/* Body preview */}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {previewText}...
        </p>

        {/* Merge fields */}
        {template.merge_fields && template.merge_fields.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {template.merge_fields.slice(0, 4).map((field) => (
              <Badge key={field} variant="outline" className="text-xs">
                {`{{${field}}}`}
              </Badge>
            ))}
            {template.merge_fields.length > 4 && (
              <Badge variant="outline" className="text-xs">
                +{template.merge_fields.length - 4} more
              </Badge>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Hash className="h-3 w-3" />
            Used {template.times_used} times
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(template.last_used_at)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPLATE EDITOR DIALOG
// ═══════════════════════════════════════════════════════════════════════════════

interface TemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: Template | null;
  onSave: (data: CreateTemplateData) => Promise<void>;
  isLoading?: boolean;
}

function TemplateEditor({
  open,
  onOpenChange,
  template,
  onSave,
  isLoading,
}: TemplateEditorProps) {
  const [formData, setFormData] = React.useState<CreateTemplateData>({
    name: '',
    description: '',
    category: '',
    subjectTemplate: '',
    bodyHtmlTemplate: '',
  });
  const [activeTab, setActiveTab] = React.useState<'edit' | 'preview'>('edit');

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      if (template) {
        setFormData({
          name: template.name,
          description: template.description || '',
          category: template.category || '',
          subjectTemplate: template.subject_template,
          bodyHtmlTemplate: template.body_html_template,
        });
      } else {
        setFormData({
          name: '',
          description: '',
          category: '',
          subjectTemplate: '',
          bodyHtmlTemplate: '',
        });
      }
      setActiveTab('edit');
    }
  }, [open, template]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(formData);
  };

  const insertMergeField = (field: string, target: 'subject' | 'body') => {
    const tag = `{{${field}}}`;
    if (target === 'subject') {
      setFormData((prev) => ({ ...prev, subjectTemplate: prev.subjectTemplate + tag }));
    } else {
      setFormData((prev) => ({ ...prev, bodyHtmlTemplate: prev.bodyHtmlTemplate + tag }));
    }
  };

  const mergeFieldButtons = ['first_name', 'last_name', 'email', 'company'];

  // Preview data
  const previewData = {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    company: 'Acme Corp',
  };

  const previewSubject = formData.subjectTemplate.replace(
    /\{\{([^}]+)\}\}/g,
    (match, field) => previewData[field as keyof typeof previewData] || match
  );

  const previewBody = formData.bodyHtmlTemplate.replace(
    /\{\{([^}]+)\}\}/g,
    (match, field) => previewData[field as keyof typeof previewData] || match
  );

  const detectedMergeFields = [
    ...extractMergeFields(formData.subjectTemplate),
    ...extractMergeFields(formData.bodyHtmlTemplate),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit Template' : 'Create Template'}</DialogTitle>
          <DialogDescription>
            {template
              ? 'Update your email template.'
              : 'Create a reusable email template with merge fields.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'preview')}>
            <TabsList className="mb-4">
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Follow-up Reminder"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category || 'none'}
                    onValueChange={(v) =>
                      setFormData((prev) => ({ ...prev, category: v === 'none' ? '' : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      <SelectItem value="follow_up">Follow-up</SelectItem>
                      <SelectItem value="introduction">Introduction</SelectItem>
                      <SelectItem value="outreach">Outreach</SelectItem>
                      <SelectItem value="newsletter">Newsletter</SelectItem>
                      <SelectItem value="thank_you">Thank You</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Brief description of when to use this template"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="subject">Subject Line *</Label>
                  <div className="flex gap-1">
                    {mergeFieldButtons.map((field) => (
                      <Button
                        key={field}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-6 px-2"
                        onClick={() => insertMergeField(field, 'subject')}
                      >
                        {`{{${field}}}`}
                      </Button>
                    ))}
                  </div>
                </div>
                <Input
                  id="subject"
                  value={formData.subjectTemplate}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, subjectTemplate: e.target.value }))
                  }
                  placeholder="e.g., {{first_name}}, quick follow-up"
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="body">Email Body *</Label>
                  <div className="flex gap-1">
                    {mergeFieldButtons.map((field) => (
                      <Button
                        key={field}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs h-6 px-2"
                        onClick={() => insertMergeField(field, 'body')}
                      >
                        {`{{${field}}}`}
                      </Button>
                    ))}
                  </div>
                </div>
                <Textarea
                  id="body"
                  value={formData.bodyHtmlTemplate}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, bodyHtmlTemplate: e.target.value }))
                  }
                  placeholder={`<p>Hi {{first_name}},</p>\n\n<p>Your content here...</p>\n\n<p>Best regards</p>`}
                  rows={10}
                  className="font-mono text-sm"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  HTML supported. Use {`{{field_name}}`} for merge fields.
                </p>
              </div>

              {detectedMergeFields.length > 0 && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2">Detected merge fields:</p>
                  <div className="flex flex-wrap gap-1">
                    {[...new Set(detectedMergeFields)].map((field) => (
                      <Badge key={field} variant="secondary" className="text-xs">
                        {`{{${field}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="preview" className="space-y-4">
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Subject:</p>
                <p className="font-medium mb-4">{previewSubject || '(empty)'}</p>
                <p className="text-sm text-muted-foreground mb-1">Body:</p>
                <div
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: previewBody || '<p class="text-muted-foreground">(empty)</p>',
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Preview shown with sample data: {previewData.first_name} {previewData.last_name}{' '}
                ({previewData.email})
              </p>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !formData.name || !formData.subjectTemplate || !formData.bodyHtmlTemplate}
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {template ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON & EMPTY STATE
// ═══════════════════════════════════════════════════════════════════════════════

function TemplateGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-16 mt-1" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4 mb-3" />
            <div className="flex gap-1 mb-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-3 w-1/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ onAddClick }: { onAddClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <FileText className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-2">No templates yet</h3>
      <p className="text-muted-foreground max-w-sm mb-4">
        Create reusable email templates with merge fields for your campaigns.
      </p>
      <Button onClick={onAddClick} className="gap-2">
        <Plus className="h-4 w-4" />
        Create Template
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function TemplatesPage() {
  // State
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all');
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingTemplate, setEditingTemplate] = React.useState<Template | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState<Template | null>(null);

  // Hooks
  const {
    templates,
    isLoading,
    error,
    stats,
    categories,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
  } = useTemplates({
    category: categoryFilter === 'all' ? undefined : categoryFilter,
  });

  // Handlers
  const handleEdit = (template: Template) => {
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleDuplicate = async (template: Template) => {
    logger.info('Duplicating template', { id: template.id.substring(0, 8) });
    await duplicateTemplate(template.id);
  };

  const handleDeleteClick = (template: Template) => {
    setDeleteConfirm(template);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    logger.info('Deleting template', { id: deleteConfirm.id.substring(0, 8) });
    await deleteTemplate(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  const handleSave = async (data: CreateTemplateData) => {
    setIsSubmitting(true);
    try {
      if (editingTemplate) {
        logger.info('Updating template', { id: editingTemplate.id.substring(0, 8) });
        await updateTemplate(editingTemplate.id, data);
      } else {
        logger.info('Creating template', { name: data.name });
        await createTemplate(data);
      }
      setEditorOpen(false);
      setEditingTemplate(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNew = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Email Templates"
        description="Create and manage reusable email templates with merge fields"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Templates' }]}
        actions={
          <Button size="sm" className="gap-2" onClick={handleAddNew}>
            <Plus className="h-4 w-4" />
            New Template
          </Button>
        }
      />

      {/* Error display */}
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">
            <AlertCircle className="h-4 w-4 inline mr-2" />
            <strong>Error:</strong> {error.message}
          </p>
        </div>
      )}

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          <Button
            variant={categoryFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setCategoryFilter('all')}
          >
            All ({stats.total})
          </Button>
          {categories.map((category) => (
            <Button
              key={category}
              variant={categoryFilter === category ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategoryFilter(category)}
            >
              {category} ({stats.byCategory[category] || 0})
            </Button>
          ))}
        </div>
      )}

      {/* Template grid */}
      {isLoading ? (
        <TemplateGridSkeleton />
      ) : templates.length === 0 ? (
        <EmptyState onAddClick={handleAddNew} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onEdit={handleEdit}
              onDuplicate={handleDuplicate}
              onDelete={handleDeleteClick}
            />
          ))}
        </div>
      )}

      {/* Template editor dialog */}
      <TemplateEditor
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingTemplate(null);
        }}
        template={editingTemplate}
        onSave={handleSave}
        isLoading={isSubmitting}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete Template?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteConfirm?.name}&rdquo;? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
