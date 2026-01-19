/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Supabase type generation issue with new tables
/**
 * Contact Detail Page
 *
 * Displays comprehensive information about a single contact including:
 * - Profile information (name, email, company, job title)
 * - VIP and muted status with toggle controls
 * - Relationship type selector
 * - Email history with this contact
 * - Extracted dates related to this contact
 * - Notes field for personal annotations
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Real-time VIP/muted toggles with optimistic updates
 * - Inline relationship type editing
 * - Email history timeline (most recent 20 emails)
 * - Related extracted dates (birthdays, deadlines, etc.)
 * - Editable notes with auto-save
 * - Contact statistics (total emails, recent activity)
 * - Navigation back to contacts list
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════════
 * Route: /contacts/[id]
 * Protected: Yes (requires authentication)
 *
 * @module app/(auth)/contacts/[id]/page
 * @version 1.0.0
 * @since January 2026 (P6 Enhancement)
 */

'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Star,
  VolumeX,
  Volume2,
  Mail,
  Building2,
  Briefcase,
  Calendar,
  Clock,
  ChevronRight,
  AlertCircle,
  ExternalLink,
  Save,
  Loader2,
  RefreshCw,
  User,
} from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { createLogger } from '@/lib/utils/logger';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Logger instance for this page.
 * Provides structured logging with consistent prefixes for debugging.
 */
const logger = createLogger('ContactDetailPage');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Contact relationship types.
 * Must match the database enum and hook types.
 */
type ContactRelationshipType =
  | 'client'
  | 'colleague'
  | 'vendor'
  | 'friend'
  | 'family'
  | 'recruiter'
  | 'service'
  | 'unknown';

/**
 * Full contact data from the API.
 * Includes base fields plus enriched data.
 */
interface ContactDetail {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  job_title: string | null;
  relationship_type: ContactRelationshipType;
  is_vip: boolean;
  is_muted: boolean;
  email_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  notes: string | null;
  birthday: string | null;
  work_anniversary: string | null;
  /** Enriched field from API - emails in last 30 days */
  recent_email_count: number;
}

/**
 * Email item from the contact's history.
 */
interface ContactEmail {
  id: string;
  subject: string;
  date: string;
  snippet: string;
  category: string;
  is_read: boolean;
}

/**
 * Extracted date related to this contact.
 */
interface RelatedDate {
  id: string;
  date_type: string;
  date: string;
  title: string;
  description: string | null;
  is_acknowledged: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Relationship type configuration for display.
 * Maps types to human-readable labels and color classes.
 */
const RELATIONSHIP_CONFIG: Record<
  ContactRelationshipType,
  { label: string; color: string }
> = {
  client: {
    label: 'Client',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  },
  colleague: {
    label: 'Colleague',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  },
  vendor: {
    label: 'Vendor',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  },
  friend: {
    label: 'Friend',
    color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  },
  family: {
    label: 'Family',
    color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  },
  recruiter: {
    label: 'Recruiter',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  },
  service: {
    label: 'Service',
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300',
  },
  unknown: {
    label: 'Unknown',
    color: 'bg-gray-100 text-gray-500 dark:bg-gray-900/30 dark:text-gray-400',
  },
};

/**
 * Date type icons and colors for the related dates section.
 */
const DATE_TYPE_CONFIG: Record<string, { color: string }> = {
  deadline: { color: 'text-red-500' },
  payment_due: { color: 'text-orange-500' },
  birthday: { color: 'text-pink-500' },
  anniversary: { color: 'text-rose-500' },
  event: { color: 'text-purple-500' },
  appointment: { color: 'text-blue-500' },
  follow_up: { color: 'text-green-500' },
  expiration: { color: 'text-yellow-500' },
  reminder: { color: 'text-teal-500' },
  recurring: { color: 'text-gray-500' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Contact Detail Page Component
 *
 * Fetches and displays comprehensive information about a single contact.
 * Provides controls for managing VIP status, muting, and adding notes.
 *
 * @returns React component
 */
export default function ContactDetailPage() {
  // ─────────────────────────────────────────────────────────────────────────────
  // Routing and Navigation
  // ─────────────────────────────────────────────────────────────────────────────

  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;

  // ─────────────────────────────────────────────────────────────────────────────
  // State Management
  // ─────────────────────────────────────────────────────────────────────────────

  /** Main contact data */
  const [contact, setContact] = React.useState<ContactDetail | null>(null);

  /** Email history from this contact */
  const [emails, setEmails] = React.useState<ContactEmail[]>([]);

  /** Extracted dates related to this contact */
  const [relatedDates, setRelatedDates] = React.useState<RelatedDate[]>([]);

  /** Loading state for initial data fetch */
  const [isLoading, setIsLoading] = React.useState(true);

  /** Error message if fetch fails */
  const [error, setError] = React.useState<string | null>(null);

  /** Notes field value (controlled) */
  const [notes, setNotes] = React.useState('');

  /** Whether notes have been modified since last save */
  const [notesModified, setNotesModified] = React.useState(false);

  /** Loading state for notes save operation */
  const [isSavingNotes, setIsSavingNotes] = React.useState(false);

  /** Loading state for VIP/muted toggles */
  const [isTogglingVip, setIsTogglingVip] = React.useState(false);
  const [isTogglingMuted, setIsTogglingMuted] = React.useState(false);

  // ─────────────────────────────────────────────────────────────────────────────
  // Data Fetching
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Fetches all contact-related data from the API.
   * Runs on mount and when contactId changes.
   */
  const fetchContactData = React.useCallback(async () => {
    logger.start('Fetching contact data', { contactId: contactId.substring(0, 8) });
    setIsLoading(true);
    setError(null);

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // Step 1: Fetch contact details
      // ─────────────────────────────────────────────────────────────────────────
      const contactRes = await fetch(`/api/contacts/${contactId}`);

      if (!contactRes.ok) {
        if (contactRes.status === 404) {
          logger.warn('Contact not found', { contactId: contactId.substring(0, 8) });
          throw new Error('Contact not found');
        }
        logger.error('Failed to fetch contact', {
          status: contactRes.status,
          contactId: contactId.substring(0, 8),
        });
        throw new Error('Failed to fetch contact details');
      }

      const contactData = await contactRes.json();
      setContact(contactData);
      setNotes(contactData.notes || '');

      logger.debug('Contact data loaded', {
        contactId: contactId.substring(0, 8),
        hasNotes: !!contactData.notes,
      });

      // ─────────────────────────────────────────────────────────────────────────
      // Step 2: Fetch email history from this contact (in parallel)
      // ─────────────────────────────────────────────────────────────────────────
      const emailsPromise = fetch(
        `/api/emails?sender=${encodeURIComponent(contactData.email)}&limit=20`
      )
        .then((res) => {
          if (!res.ok) {
            logger.warn('Failed to fetch emails', { status: res.status });
            return { emails: [] };
          }
          return res.json();
        })
        .catch((err) => {
          logger.error('Email fetch error', { error: err.message });
          return { emails: [] };
        });

      // ─────────────────────────────────────────────────────────────────────────
      // Step 3: Fetch related extracted dates (in parallel)
      // ─────────────────────────────────────────────────────────────────────────
      const datesPromise = fetch(`/api/dates?contactId=${contactId}&limit=10`)
        .then((res) => {
          if (!res.ok) {
            logger.warn('Failed to fetch dates', { status: res.status });
            return { dates: [] };
          }
          return res.json();
        })
        .catch((err) => {
          logger.error('Dates fetch error', { error: err.message });
          return { dates: [] };
        });

      // Wait for parallel fetches
      const [emailsData, datesData] = await Promise.all([emailsPromise, datesPromise]);

      setEmails(emailsData.emails || []);
      setRelatedDates(datesData.dates || []);

      logger.success('Contact data loaded', {
        contactId: contactId.substring(0, 8),
        emailCount: emailsData.emails?.length || 0,
        dateCount: datesData.dates?.length || 0,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      logger.error('Failed to load contact data', { error: message });
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [contactId]);

  // Fetch data on mount
  React.useEffect(() => {
    if (contactId) {
      fetchContactData();
    }
  }, [contactId, fetchContactData]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Action Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Toggles the VIP status for this contact.
   * Uses optimistic update - updates UI immediately, then syncs with server.
   */
  const handleToggleVip = async () => {
    if (!contact || isTogglingVip) return;

    const newVipStatus = !contact.is_vip;
    logger.start('Toggling VIP status', {
      contactId: contactId.substring(0, 8),
      from: contact.is_vip,
      to: newVipStatus,
    });

    // Optimistic update
    setContact({ ...contact, is_vip: newVipStatus });
    setIsTogglingVip(true);

    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_vip: newVipStatus }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        logger.error('VIP toggle API error', {
          status: res.status,
          error: errorData.error,
        });
        throw new Error(errorData.error || 'Failed to update VIP status');
      }

      logger.success('VIP status updated', {
        contactId: contactId.substring(0, 8),
        newStatus: newVipStatus,
      });
      toast.success(newVipStatus ? 'Marked as VIP' : 'Removed VIP status');
    } catch (err) {
      // Rollback optimistic update
      setContact({ ...contact, is_vip: contact.is_vip });
      const message = err instanceof Error ? err.message : 'Failed to update VIP status';
      logger.error('VIP toggle failed, rolling back', { error: message });
      toast.error(message);
    } finally {
      setIsTogglingVip(false);
    }
  };

  /**
   * Toggles the muted status for this contact.
   * Uses optimistic update - updates UI immediately, then syncs with server.
   */
  const handleToggleMuted = async () => {
    if (!contact || isTogglingMuted) return;

    const newMutedStatus = !contact.is_muted;
    logger.start('Toggling muted status', {
      contactId: contactId.substring(0, 8),
      from: contact.is_muted,
      to: newMutedStatus,
    });

    // Optimistic update
    setContact({ ...contact, is_muted: newMutedStatus });
    setIsTogglingMuted(true);

    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_muted: newMutedStatus }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        logger.error('Muted toggle API error', {
          status: res.status,
          error: errorData.error,
        });
        throw new Error(errorData.error || 'Failed to update muted status');
      }

      logger.success('Muted status updated', {
        contactId: contactId.substring(0, 8),
        newStatus: newMutedStatus,
      });
      toast.success(newMutedStatus ? 'Contact muted' : 'Contact unmuted');
    } catch (err) {
      // Rollback optimistic update
      setContact({ ...contact, is_muted: contact.is_muted });
      const message = err instanceof Error ? err.message : 'Failed to update muted status';
      logger.error('Muted toggle failed, rolling back', { error: message });
      toast.error(message);
    } finally {
      setIsTogglingMuted(false);
    }
  };

  /**
   * Updates the relationship type for this contact.
   */
  const handleRelationshipChange = async (newType: ContactRelationshipType) => {
    if (!contact || contact.relationship_type === newType) return;

    const previousType = contact.relationship_type;
    logger.start('Updating relationship type', {
      contactId: contactId.substring(0, 8),
      from: previousType,
      to: newType,
    });

    // Optimistic update
    setContact({ ...contact, relationship_type: newType });

    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationship_type: newType }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        logger.error('Relationship update API error', {
          status: res.status,
          error: errorData.error,
        });
        throw new Error(errorData.error || 'Failed to update relationship type');
      }

      logger.success('Relationship type updated', {
        contactId: contactId.substring(0, 8),
        newType,
      });
      toast.success('Relationship type updated');
    } catch (err) {
      // Rollback optimistic update
      setContact({ ...contact, relationship_type: previousType });
      const message = err instanceof Error ? err.message : 'Failed to update relationship';
      logger.error('Relationship update failed, rolling back', { error: message });
      toast.error(message);
    }
  };

  /**
   * Saves the notes field to the server.
   */
  const handleSaveNotes = async () => {
    if (!contact || !notesModified) return;

    logger.start('Saving notes', {
      contactId: contactId.substring(0, 8),
      notesLength: notes.length,
    });

    setIsSavingNotes(true);

    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes || null }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        logger.error('Notes save API error', {
          status: res.status,
          error: errorData.error,
        });
        throw new Error(errorData.error || 'Failed to save notes');
      }

      setNotesModified(false);
      logger.success('Notes saved', { contactId: contactId.substring(0, 8) });
      toast.success('Notes saved');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save notes';
      logger.error('Notes save failed', { error: message });
      toast.error(message);
    } finally {
      setIsSavingNotes(false);
    }
  };

  /**
   * Handle notes text change.
   */
  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setNotes(newValue);
    setNotesModified(newValue !== (contact?.notes || ''));
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Loading State
  // ─────────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return <ContactDetailSkeleton />;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Error State
  // ─────────────────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="container max-w-4xl py-6">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-lg font-medium">{error}</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            {error === 'Contact not found'
              ? 'This contact may have been deleted or you may not have permission to view it.'
              : 'An error occurred while loading the contact. Please try again.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/contacts')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Contacts
            </Button>
            <Button onClick={fetchContactData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: No Contact (shouldn't happen after loading, but safety check)
  // ─────────────────────────────────────────────────────────────────────────────

  if (!contact) {
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render: Main Content
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Header with Back Button and Actions */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/contacts')}
          className="mt-1"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Back to contacts</span>
        </Button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold truncate">
              {contact.name || contact.email}
            </h1>
            {contact.is_vip && (
              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500 flex-shrink-0" />
            )}
            {contact.is_muted && (
              <VolumeX className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            )}
          </div>
          {contact.name && (
            <p className="text-muted-foreground truncate">{contact.email}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant={contact.is_vip ? 'default' : 'outline'}
            size="sm"
            onClick={handleToggleVip}
            disabled={isTogglingVip}
          >
            {isTogglingVip ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Star
                className={cn('h-4 w-4 mr-1', contact.is_vip && 'fill-current')}
              />
            )}
            {contact.is_vip ? 'VIP' : 'Mark VIP'}
          </Button>
          <Button
            variant={contact.is_muted ? 'secondary' : 'outline'}
            size="sm"
            onClick={handleToggleMuted}
            disabled={isTogglingMuted}
          >
            {isTogglingMuted ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : contact.is_muted ? (
              <VolumeX className="h-4 w-4 mr-1" />
            ) : (
              <Volume2 className="h-4 w-4 mr-1" />
            )}
            {contact.is_muted ? 'Muted' : 'Mute'}
          </Button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Profile Card */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Company */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Company
            </label>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{contact.company || 'Unknown'}</span>
            </div>
          </div>

          {/* Job Title */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Job Title
            </label>
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{contact.job_title || 'Unknown'}</span>
            </div>
          </div>

          {/* Relationship Type */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Relationship
            </label>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <select
                value={contact.relationship_type}
                onChange={(e) =>
                  handleRelationshipChange(e.target.value as ContactRelationshipType)
                }
                className={cn(
                  'px-2 py-1 rounded-md text-sm font-medium border-0 cursor-pointer',
                  RELATIONSHIP_CONFIG[contact.relationship_type].color
                )}
              >
                {Object.entries(RELATIONSHIP_CONFIG).map(([value, config]) => (
                  <option key={value} value={value}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* First Seen */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              First Contact
            </label>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span>
                {contact.first_seen_at
                  ? format(new Date(contact.first_seen_at), 'MMM d, yyyy')
                  : 'Unknown'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Stats Cards */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{contact.email_count || 0}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total Emails</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {contact.recent_email_count || 0}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Last 30 Days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-lg font-bold truncate">
                {contact.last_seen_at
                  ? formatDistanceToNow(new Date(contact.last_seen_at), {
                      addSuffix: true,
                    })
                  : 'Never'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Last Contact</p>
          </CardContent>
        </Card>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Notes Section */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Add personal notes about this contact..."
            value={notes}
            onChange={handleNotesChange}
            rows={3}
            className="resize-none"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {notes.length}/5000 characters
            </p>
            <Button
              size="sm"
              onClick={handleSaveNotes}
              disabled={isSavingNotes || !notesModified}
            >
              {isSavingNotes ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              {isSavingNotes ? 'Saving...' : 'Save Notes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Email History */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">Email History</CardTitle>
          <Link href={`/inbox?sender=${encodeURIComponent(contact.email)}`}>
            <Button variant="ghost" size="sm">
              View All
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {emails.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No emails found from this contact
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {emails.map((email) => (
                <Link
                  key={email.id}
                  href={`/inbox/${email.id}`}
                  className="block p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'font-medium truncate flex-1',
                        !email.is_read && 'font-semibold'
                      )}
                    >
                      {email.subject || '(No subject)'}
                    </span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {format(new Date(email.date), 'MMM d, yyyy')}
                    </span>
                  </div>
                  {email.snippet && (
                    <p className="text-sm text-muted-foreground truncate mt-1">
                      {email.snippet}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────────────── */}
      {/* Related Dates */}
      {/* ─────────────────────────────────────────────────────────────────────── */}
      {relatedDates.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-base">Related Dates</CardTitle>
            <Link href={`/timeline?contactId=${contactId}`}>
              <Button variant="ghost" size="sm">
                View All
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {relatedDates.map((dateItem) => {
                const typeConfig = DATE_TYPE_CONFIG[dateItem.date_type] || {
                  color: 'text-gray-500',
                };
                return (
                  <div
                    key={dateItem.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border',
                      dateItem.is_acknowledged && 'opacity-50'
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Calendar
                        className={cn('h-4 w-4 flex-shrink-0', typeConfig.color)}
                      />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{dateItem.title}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="capitalize">
                            {dateItem.date_type.replace('_', ' ')}
                          </span>
                          {' - '}
                          {format(new Date(dateItem.date), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    {dateItem.is_acknowledged && (
                      <Badge variant="secondary" className="flex-shrink-0">
                        Done
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING SKELETON COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Loading skeleton displayed while contact data is being fetched.
 * Matches the layout of the main content for a smooth transition.
 */
function ContactDetailSkeleton() {
  return (
    <div className="container max-w-4xl py-6 space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-start gap-4">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="flex-1">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48 mt-2" />
        </div>
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-20" />
      </div>

      {/* Profile Card Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-16" />
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-32" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Stats Skeleton */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-4">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-20 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Notes Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-12" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>

      {/* Email History Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
