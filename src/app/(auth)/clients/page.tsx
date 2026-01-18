/**
 * 🏢 Clients Page for IdeaBox
 *
 * Manages the user's client roster for email tagging and relationship tracking.
 *
 * @module app/(auth)/clients/page
 */

'use client';

import * as React from 'react';
import { PageHeader } from '@/components/layout';
import {
  Card, CardContent, CardHeader, CardTitle, Button, Badge, Input, Label,
  Skeleton, Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui';
import { useClients, type ClientWithStats, type ClientStatus, type ClientPriority } from '@/hooks';
import {
  Building2, Users, Star, Mail, Plus, MoreHorizontal, Loader2,
  Archive, CheckCircle, XCircle, Crown, Pencil, Trash2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function getStatusBadge(status: ClientStatus) {
  const map = {
    active: { variant: 'default' as const, label: 'Active', icon: <CheckCircle className="h-3 w-3" /> },
    inactive: { variant: 'secondary' as const, label: 'Inactive', icon: <XCircle className="h-3 w-3" /> },
    archived: { variant: 'outline' as const, label: 'Archived', icon: <Archive className="h-3 w-3" /> },
  };
  return map[status] || { variant: 'outline' as const, label: 'Unknown', icon: null };
}

function getPriorityBadge(priority: ClientPriority) {
  const map = {
    vip: { variant: 'destructive' as const, label: 'VIP' },
    high: { variant: 'destructive' as const, label: 'High' },
    medium: { variant: 'default' as const, label: 'Medium' },
    low: { variant: 'secondary' as const, label: 'Low' },
  };
  return map[priority] || { variant: 'outline' as const, label: 'Normal' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT LIST ITEM
// ═══════════════════════════════════════════════════════════════════════════════

function ClientListItem({ client, onEdit, onDelete }: {
  client: ClientWithStats;
  onEdit: (c: ClientWithStats) => void;
  onDelete: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = React.useState(false);
  const statusBadge = getStatusBadge(client.status);
  const priorityBadge = getPriorityBadge(client.priority);

  return (
    <div className={`flex items-start gap-4 p-4 border-b border-border/50 hover:bg-muted/30 transition-colors ${client.priority === 'vip' ? 'bg-yellow-50/30 dark:bg-yellow-950/10' : ''}`}>
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        {client.priority === 'vip' ? <Crown className="h-5 w-5 text-yellow-500" /> : <Building2 className="h-5 w-5 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium truncate">{client.name}</span>
          {client.company && client.company !== client.name && (
            <span className="text-sm text-muted-foreground truncate">({client.company})</span>
          )}
          <Badge variant={statusBadge.variant} className="gap-1 text-xs">{statusBadge.icon}{statusBadge.label}</Badge>
          {client.priority !== 'medium' && <Badge variant={priorityBadge.variant} className="text-xs">{priorityBadge.label}</Badge>}
        </div>
        {client.email_domains && client.email_domains.length > 0 && (
          <p className="text-sm text-muted-foreground mb-2">{client.email_domains.join(', ')}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{client.emailCount ?? 0} emails</span>
          {(client.pendingActions ?? 0) > 0 && <span className="flex items-center gap-1 text-destructive"><Star className="h-3 w-3" />{client.pendingActions} pending</span>}
        </div>
      </div>
      <div className="relative">
        <button onClick={() => setShowMenu(!showMenu)} className="p-2 rounded hover:bg-muted transition-colors text-muted-foreground" aria-label="More actions">
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border rounded-md shadow-md z-20">
              <button onClick={() => { setShowMenu(false); onEdit(client); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted"><Pencil className="h-4 w-4" />Edit</button>
              <button onClick={() => { setShowMenu(false); onDelete(client.id); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" />Delete</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ClientListSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-4 p-4 border-b border-border/50">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-1/4" /></div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAddClick }: { onAddClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4"><Building2 className="h-8 w-8 text-muted-foreground" /></div>
      <h3 className="text-lg font-medium mb-2">No clients yet</h3>
      <p className="text-muted-foreground max-w-sm mb-4">Add your clients to track email relationships and get better AI tagging.</p>
      <Button onClick={onAddClick} className="gap-2"><Plus className="h-4 w-4" />Add Client</Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT DIALOG
// ═══════════════════════════════════════════════════════════════════════════════

interface ClientFormData {
  name: string; company: string; email: string; status: ClientStatus;
  priority: ClientPriority; email_domains: string[]; keywords: string[]; notes: string;
}

function ClientDialog({ open, onOpenChange, onSubmit, initialData, isLoading }: {
  open: boolean; onOpenChange: (open: boolean) => void;
  onSubmit: (data: ClientFormData) => void; initialData?: ClientWithStats | null; isLoading?: boolean;
}) {
  const [formData, setFormData] = React.useState<ClientFormData>({
    name: '', company: '', email: '', status: 'active', priority: 'medium', email_domains: [], keywords: [], notes: '',
  });

  React.useEffect(() => {
    if (initialData) {
      setFormData({ name: initialData.name, company: initialData.company || '', email: initialData.email || '',
        status: initialData.status, priority: initialData.priority, email_domains: initialData.email_domains || [], keywords: initialData.keywords || [], notes: initialData.notes || '' });
    } else {
      setFormData({ name: '', company: '', email: '', status: 'active', priority: 'medium', email_domains: [], keywords: [], notes: '' });
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSubmit(formData); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Edit Client' : 'Add Client'}</DialogTitle>
          <DialogDescription>{initialData ? 'Update the client information below.' : 'Add a new client to track email relationships.'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="name">Name *</Label><Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Client name" required /></div>
          <div className="space-y-2"><Label htmlFor="company">Company</Label><Input id="company" value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} placeholder="Company name (optional)" /></div>
          <div className="space-y-2"><Label htmlFor="email">Primary Email</Label><Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="client@example.com" /></div>
          <div className="space-y-2">
            <Label htmlFor="domains">Email Domains</Label>
            <Input id="domains" value={formData.email_domains.join(', ')} onChange={(e) => setFormData({ ...formData, email_domains: e.target.value.split(',').map((d) => d.trim()).filter(Boolean) })} placeholder="example.com, example.org" />
            <p className="text-xs text-muted-foreground">Comma-separated list for auto-matching</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Status</Label><Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as ClientStatus })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Priority</Label><Select value={formData.priority} onValueChange={(v) => setFormData({ ...formData, priority: v as ClientPriority })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="vip">VIP</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem></SelectContent></Select></div>
          </div>
          <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Input id="notes" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional notes..." /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isLoading || !formData.name.trim()}>{isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{initialData ? 'Save Changes' : 'Add Client'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ClientsPage() {
  const [filter, setFilter] = React.useState<'all' | 'active' | 'inactive' | 'archived'>('all');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingClient, setEditingClient] = React.useState<ClientWithStats | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const { clients, isLoading, error, createClient, updateClient, deleteClient, stats } = useClients({
    status: filter === 'all' ? undefined : filter,
  });

  const handleSubmit = async (data: ClientFormData) => {
    setIsSubmitting(true);
    try {
      if (editingClient) { await updateClient(editingClient.id, data); }
      else { await createClient(data); }
      setDialogOpen(false); setEditingClient(null);
    } finally { setIsSubmitting(false); }
  };

  const handleEdit = (client: ClientWithStats) => { setEditingClient(client); setDialogOpen(true); };
  const handleDelete = async (clientId: string) => { if (confirm('Are you sure you want to delete this client?')) await deleteClient(clientId); };
  const handleAddNew = () => { setEditingClient(null); setDialogOpen(true); };

  return (
    <div>
      <PageHeader title="Clients" description="Manage your client roster for email tagging and relationship tracking"
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Clients' }]}
        actions={<Button size="sm" className="gap-2" onClick={handleAddNew}><Plus className="h-4 w-4" />Add Client</Button>} />

      {error && <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg"><p className="text-sm text-destructive"><strong>Error:</strong> {error.message}</p></div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className={`cursor-pointer transition-colors ${filter === 'all' ? 'ring-2 ring-primary' : ''}`} onClick={() => setFilter('all')}><CardContent className="pt-4"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><span className="text-2xl font-bold">{stats.total}</span></div><p className="text-xs text-muted-foreground mt-1">Total Clients</p></CardContent></Card>
        <Card className={`cursor-pointer transition-colors ${filter === 'active' ? 'ring-2 ring-primary' : ''}`} onClick={() => setFilter(filter === 'active' ? 'all' : 'active')}><CardContent className="pt-4"><div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-green-500" /><span className="text-2xl font-bold">{stats.active}</span></div><p className="text-xs text-muted-foreground mt-1">Active</p></CardContent></Card>
        <Card className={`cursor-pointer transition-colors ${filter === 'inactive' ? 'ring-2 ring-primary' : ''}`} onClick={() => setFilter(filter === 'inactive' ? 'all' : 'inactive')}><CardContent className="pt-4"><div className="flex items-center gap-2"><XCircle className="h-4 w-4 text-muted-foreground" /><span className="text-2xl font-bold">{stats.inactive}</span></div><p className="text-xs text-muted-foreground mt-1">Inactive</p></CardContent></Card>
        <Card><CardContent className="pt-4"><div className="flex items-center gap-2"><Crown className="h-4 w-4 text-yellow-500" /><span className="text-2xl font-bold">{stats.vip}</span></div><p className="text-xs text-muted-foreground mt-1">VIP</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg">{filter === 'all' ? 'All Clients' : `${filter.charAt(0).toUpperCase() + filter.slice(1)} Clients`}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? <ClientListSkeleton /> : clients.length === 0 ? <EmptyState onAddClick={handleAddNew} /> : (
            <div>{clients.map((client) => <ClientListItem key={client.id} client={client} onEdit={handleEdit} onDelete={handleDelete} />)}</div>
          )}
        </CardContent>
      </Card>

      <ClientDialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingClient(null); }} onSubmit={handleSubmit} initialData={editingClient} isLoading={isSubmitting} />
    </div>
  );
}
