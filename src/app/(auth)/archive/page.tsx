/**
 * 📦 Archive Page for IdeaBox
 *
 * Displays archived emails with filtering and bulk actions.
 *
 * @module app/(auth)/archive/page
 */

'use client';

import * as React from 'react';
import { PageHeader } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Input, Skeleton } from '@/components/ui';
import { useEmails, type Email, type EmailCategory } from '@/hooks';
import { Archive, ArchiveRestore, Trash2, Search, Mail, Calendar, Newspaper, Tag, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`;
  if (diffMonths < 12) return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

/**
 * Get badge display config for a category.
 *
 * REFACTORED (Jan 2026): Updated for life-bucket categories.
 * Categories now represent what part of life the email touches.
 */
function getCategoryBadge(category: EmailCategory | null) {
  const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string; icon: React.ReactNode }> = {
    // Work & Business
    client_pipeline: { variant: 'destructive', label: 'Client', icon: <AlertCircle className="h-3 w-3" /> },
    business_work_general: { variant: 'default', label: 'Work', icon: <Mail className="h-3 w-3" /> },
    // Family & Personal
    family_kids_school: { variant: 'default', label: 'School', icon: <Calendar className="h-3 w-3" /> },
    family_health_appointments: { variant: 'default', label: 'Health', icon: <Calendar className="h-3 w-3" /> },
    personal_friends_family: { variant: 'outline', label: 'Personal', icon: <Mail className="h-3 w-3" /> },
    // Life Admin
    finance: { variant: 'secondary', label: 'Finance', icon: <Mail className="h-3 w-3" /> },
    travel: { variant: 'default', label: 'Travel', icon: <Calendar className="h-3 w-3" /> },
    shopping: { variant: 'outline', label: 'Shopping', icon: <Tag className="h-3 w-3" /> },
    local: { variant: 'default', label: 'Local', icon: <Calendar className="h-3 w-3" /> },
    // Information
    newsletters_general: { variant: 'secondary', label: 'Newsletter', icon: <Newspaper className="h-3 w-3" /> },
    news_politics: { variant: 'secondary', label: 'News', icon: <Newspaper className="h-3 w-3" /> },
    product_updates: { variant: 'outline', label: 'Updates', icon: <Archive className="h-3 w-3" /> },
  };
  return map[category || ''] || { variant: 'outline' as const, label: 'Archived', icon: <Archive className="h-3 w-3" /> };
}

/**
 * Categories typically shown in archive view.
 * REFACTORED (Jan 2026): Updated for life-bucket categories.
 */
const ARCHIVE_CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'newsletters_general', label: 'Newsletters' },
  { value: 'news_politics', label: 'News' },
  { value: 'product_updates', label: 'Updates' },
  { value: 'shopping', label: 'Shopping' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function ArchivedEmailItem({ email, onUnarchive, onDelete, isSelected, onSelect }: {
  email: Email; onUnarchive: (id: string) => void; onDelete: (id: string) => void;
  isSelected: boolean; onSelect: (id: string) => void;
}) {
  const categoryBadge = getCategoryBadge(email.category);
  return (
    <div className={`flex items-start gap-4 p-4 border-b border-border/50 hover:bg-muted/30 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
      <input type="checkbox" checked={isSelected} onChange={() => onSelect(email.id)} className="mt-1.5 h-4 w-4 rounded border-gray-300" aria-label={`Select email from ${email.sender_email}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="font-medium truncate text-muted-foreground">{email.sender_name || email.sender_email}</span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{formatRelativeTime(email.date)}</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm truncate">{email.subject}</span>
          <Badge variant={categoryBadge.variant} className="gap-1 text-xs shrink-0">{categoryBadge.icon}{categoryBadge.label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground truncate">{email.snippet}</p>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => onUnarchive(email.id)} className="text-muted-foreground hover:text-foreground" aria-label="Restore to inbox"><ArchiveRestore className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => onDelete(email.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete permanently"><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function ArchiveListSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-start gap-4 p-4 border-b border-border/50">
          <Skeleton className="h-4 w-4 rounded" />
          <div className="flex-1 space-y-2"><div className="flex justify-between"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-16" /></div><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-full" /></div>
          <div className="flex gap-1"><Skeleton className="h-8 w-8 rounded" /><Skeleton className="h-8 w-8 rounded" /></div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4"><Archive className="h-8 w-8 text-muted-foreground" /></div>
      <h3 className="text-lg font-medium mb-2">{hasFilter ? 'No matching emails' : 'Archive is empty'}</h3>
      <p className="text-muted-foreground max-w-sm">{hasFilter ? 'Try adjusting your filters to see more emails.' : 'Emails you archive from your inbox will appear here for reference.'}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ArchivePage() {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all');
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const { emails, isLoading, error, refetch, updateEmail } = useEmails({
    limit: 100, category: categoryFilter !== 'all' ? (categoryFilter as EmailCategory) : undefined,
  });

  // Archive/delete an email by setting is_archived flag
  const archiveEmail = async (id: string) => {
    await updateEmail(id, { is_archived: true });
  };

  // Filter emails to show archiveable categories
  // REFACTORED (Jan 2026): Updated for life-bucket categories
  const archivedEmails = React.useMemo(() => {
    const archiveCategories = [
      'newsletters_general',
      'news_politics',
      'product_updates',
      'shopping',
    ];
    return emails.filter((email) => {
      if (categoryFilter !== 'all' && email.category !== categoryFilter) return false;
      if (categoryFilter === 'all' && !archiveCategories.includes(email.category || '')) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return email.subject?.toLowerCase().includes(query) || email.sender_email?.toLowerCase().includes(query) ||
          email.sender_name?.toLowerCase().includes(query) || email.snippet?.toLowerCase().includes(query);
      }
      return true;
    });
  }, [emails, categoryFilter, searchQuery]);

  const handleRefresh = async () => { setIsRefreshing(true); await refetch(); setIsRefreshing(false); };
  // REFACTORED (Jan 2026): 'personal' → 'personal_friends_family'
  const handleUnarchive = async (id: string) => { await updateEmail(id, { category: 'personal_friends_family' }); };
  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to archive this email?')) {
      await archiveEmail(id);
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };
  const handleSelect = (id: string) => { setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const handleSelectAll = () => { if (selectedIds.size === archivedEmails.length) setSelectedIds(new Set()); else setSelectedIds(new Set(archivedEmails.map((e) => e.id))); };
  const handleBulkUnarchive = async () => { for (const id of selectedIds) await handleUnarchive(id); setSelectedIds(new Set()); };
  const handleBulkDelete = async () => { if (confirm(`Archive ${selectedIds.size} emails?`)) { for (const id of selectedIds) await archiveEmail(id); setSelectedIds(new Set()); } };

  const hasFilter = searchQuery !== '' || categoryFilter !== 'all';

  return (
    <div>
      <PageHeader title="Archive" description="Archived emails stored for reference" breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Archive' }]}
        actions={<Button variant="outline" size="sm" className="gap-2" onClick={handleRefresh} disabled={isRefreshing}>{isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{isRefreshing ? 'Refreshing...' : 'Refresh'}</Button>} />

      {error && <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg"><p className="text-sm text-destructive"><strong>Error:</strong> {error.message}</p></div>}

      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search archived emails..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" /></div>
          <div className="flex gap-2">{ARCHIVE_CATEGORIES.map((cat) => (<Button key={cat.value} variant={categoryFilter === cat.value ? 'default' : 'outline'} size="sm" onClick={() => setCategoryFilter(cat.value)}>{cat.label}</Button>))}</div>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleBulkUnarchive}><ArchiveRestore className="h-4 w-4" />Restore</Button>
            <Button variant="destructive" size="sm" className="gap-2" onClick={handleBulkDelete}><Trash2 className="h-4 w-4" />Delete</Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2"><Archive className="h-5 w-5" />Archived ({archivedEmails.length})</CardTitle>
            {archivedEmails.length > 0 && <Button variant="ghost" size="sm" onClick={handleSelectAll}>{selectedIds.size === archivedEmails.length ? 'Deselect All' : 'Select All'}</Button>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <ArchiveListSkeleton /> : archivedEmails.length === 0 ? <EmptyState hasFilter={hasFilter} /> : (
            <div>{archivedEmails.map((email) => <ArchivedEmailItem key={email.id} email={email} onUnarchive={handleUnarchive} onDelete={handleDelete} isSelected={selectedIds.has(email.id)} onSelect={handleSelect} />)}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
