/**
 * @deprecated — Removed from the onboarding wizard in Phase 4 (February 2026).
 *
 * Clients are now auto-detected by the ClientTaggerAnalyzer from email patterns,
 * making manual client entry during onboarding redundant. The onboarding flow is:
 *   1. Welcome → 2. Accounts → 3. VIP Contacts → 4. About You → 5. Sync Config
 *
 * This component is kept for use in Settings or for rollback purposes.
 * It is no longer imported by OnboardingWizard.tsx.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Clients Step Component (DEPRECATED from onboarding)
 *
 * Allows users to manually add their main clients for better email
 * organization. This step was optional and could be skipped.
 *
 * @module app/onboarding/components/ClientsStep
 */

'use client';

import * as React from 'react';
import { Button, Input, Label, useToast } from '@/components/ui';
import { Plus, X, Users, Loader2, Building2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { createLogger } from '@/lib/utils/logger';
import type { AuthUser } from '@/lib/auth';
import type { TableInsert } from '@/types/database';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('ClientsStep');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Props for step components.
 */
export interface StepProps {
  user: AuthUser;
  onNext: () => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

/**
 * Client form data structure.
 */
interface ClientFormData {
  id: string;       // Temporary ID for list management
  name: string;
  company: string;
  email: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates an empty client form entry.
 */
function createEmptyClient(): ClientFormData {
  return {
    id: crypto.randomUUID(),
    name: '',
    company: '',
    email: '',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Clients step - optional client setup for better email organization.
 */
export function ClientsStep({ user, onNext, onBack }: StepProps) {
  const supabase = React.useMemo(() => createClient(), []);
  const { toast } = useToast();

  // Form state - start with one empty client
  const [clients, setClients] = React.useState<ClientFormData[]>([createEmptyClient()]);
  const [isSaving, setIsSaving] = React.useState(false);

  // ───────────────────────────────────────────────────────────────────────────
  // Form handlers
  // ───────────────────────────────────────────────────────────────────────────

  const updateClient = (id: string, field: keyof ClientFormData, value: string) => {
    setClients((prev) =>
      prev.map((client) =>
        client.id === id ? { ...client, [field]: value } : client
      )
    );
  };

  const addClient = () => {
    if (clients.length < 10) {
      setClients((prev) => [...prev, createEmptyClient()]);
    }
  };

  const removeClient = (id: string) => {
    if (clients.length > 1) {
      setClients((prev) => prev.filter((client) => client.id !== id));
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Save and continue
  // ───────────────────────────────────────────────────────────────────────────

  const handleSaveAndContinue = async () => {
    // Filter out empty clients (name is required)
    const validClients = clients.filter((client) => client.name.trim() !== '');

    if (validClients.length === 0) {
      // No clients to save, just continue
      logger.info('No clients added, skipping save');
      onNext();
      return;
    }

    setIsSaving(true);
    logger.start('Saving clients', { count: validClients.length });

    try {
      // Prepare client records for database with proper typing
      const clientRecords: TableInsert<'clients'>[] = validClients.map((client) => ({
        user_id: user.id,
        name: client.name.trim(),
        company: client.company.trim() || null,
        email: client.email.trim() || null,
        status: 'active' as const,
        priority: 'medium' as const,
      }));

      // Using explicit any cast due to Supabase type inference limitations
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('clients')
        .insert(clientRecords);

      if (error) {
        throw error;
      }

      logger.success('Clients saved', { count: clientRecords.length });

      toast({
        title: 'Clients added',
        description: `${clientRecords.length} client${clientRecords.length > 1 ? 's' : ''} added successfully.`,
      });

      onNext();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to save clients', { error: message });

      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save clients. You can add them later in settings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    logger.info('User skipped clients step');
    onNext();
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render client form
  // ───────────────────────────────────────────────────────────────────────────

  const renderClientForm = (client: ClientFormData, index: number) => (
    <div
      key={client.id}
      className="p-4 bg-muted/30 rounded-lg border border-border/50 space-y-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          Client {index + 1}
        </span>
        {clients.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeClient(client.id)}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Remove client</span>
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Name field */}
        <div className="space-y-2">
          <Label htmlFor={`name-${client.id}`}>
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`name-${client.id}`}
            placeholder="e.g., John Smith"
            value={client.name}
            onChange={(e) => updateClient(client.id, 'name', e.target.value)}
          />
        </div>

        {/* Company field */}
        <div className="space-y-2">
          <Label htmlFor={`company-${client.id}`}>Company</Label>
          <Input
            id={`company-${client.id}`}
            placeholder="e.g., Acme Corp"
            value={client.company}
            onChange={(e) => updateClient(client.id, 'company', e.target.value)}
          />
        </div>
      </div>

      {/* Email field */}
      <div className="space-y-2">
        <Label htmlFor={`email-${client.id}`}>Email</Label>
        <Input
          id={`email-${client.id}`}
          type="email"
          placeholder="e.g., john@acme.com"
          value={client.email}
          onChange={(e) => updateClient(client.id, 'email', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Used to automatically tag emails from this client
        </p>
      </div>
    </div>
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ─────────────────────────────────────────────────────────────────────
          Header
          ───────────────────────────────────────────────────────────────────── */}
      <div className="text-center mb-6">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Users className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">
          Who are your main clients?
        </h2>
        <p className="text-muted-foreground">
          Help IdeaBox recognize and organize your important client emails.
          You can always add more later.
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          Client Forms
          ───────────────────────────────────────────────────────────────────── */}
      <div className="space-y-4 mb-4">
        {clients.map((client, index) => renderClientForm(client, index))}
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          Add Client Button
          ───────────────────────────────────────────────────────────────────── */}
      {clients.length < 10 && (
        <Button
          variant="outline"
          onClick={addClient}
          className="w-full mb-6"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Another Client
        </Button>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          Tip
          ───────────────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg mb-6">
        <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-blue-700 dark:text-blue-300">
            Pro tip
          </p>
          <p className="text-blue-600/80 dark:text-blue-400/80">
            IdeaBox will also learn from your email patterns and suggest new
            clients automatically over time.
          </p>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          Navigation
          ───────────────────────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isSaving}
          className="flex-1"
        >
          Back
        </Button>
        <Button
          variant="ghost"
          onClick={handleSkip}
          disabled={isSaving}
        >
          Skip for now
        </Button>
        <Button
          onClick={handleSaveAndContinue}
          disabled={isSaving}
          className="flex-1"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Finish Setup'
          )}
        </Button>
      </div>
    </div>
  );
}
