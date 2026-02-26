/**
 * Summary Generator — AI Prompt & Function Schema
 *
 * System prompt and function-calling schema for synthesizing
 * email summaries from clustered ai_briefs.
 *
 * @module services/summary/summary-prompt
 * @since February 2026
 */

import type { FunctionSchema } from '@/lib/ai/openai-client';
import type { SummaryInputData } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds the system prompt for summary generation.
 * Optionally injects user context for personalization.
 */
export function buildSummarySystemPrompt(context?: {
  userName?: string;
  role?: string;
  company?: string;
}): string {
  const nameClause = context?.userName
    ? ` for ${context.userName}`
    : '';
  const roleClause = context?.role
    ? ` They work as a ${context.role}${context?.company ? ` at ${context.company}` : ''}.`
    : '';

  return `You are composing a brief, conversational email digest${nameClause}.${roleClause}

Your task: Given a structured list of email briefs, pending actions, and upcoming deadlines, produce a narrative summary that helps the user understand what happened and what needs attention — without reading every email.

RULES:
1. HEADLINE: Write 1-2 conversational sentences summarizing the big picture. Be specific, not vague.
   GOOD: "Busy morning — 3 client threads need responses, your AWS bill arrived, and Sarah shared the Q1 deck."
   BAD: "You have new emails to review."

2. SECTIONS: Group items into 2-5 themed sections based on what's actually in the data. Common themes:
   - "Needs Your Response" (must_reply / should_reply items)
   - "Client Updates" (client-category emails)
   - "Upcoming Deadlines" (dates within 48h)
   - "FYI / Background" (informational, no action)
   - "News & Insights" (news items, newsletter highlights)
   But create ad-hoc themes if the data clusters naturally (e.g., "Travel Planning", "Hiring").

3. ITEMS: Each bullet should be 1 sentence, referencing specific people/subjects. Include the thread reference IDs (T1, T2, etc.) that sourced each item in the email_ids array.
   Mark action_needed=true only for items that genuinely need the user to do something.

4. STATS: Report accurate counts from the data provided.

5. ICONS: Use lucide icon names: "users" for clients, "clock" for deadlines, "mail" for responses, "newspaper" for news, "info" for FYI, "plane" for travel, "dollar-sign" for finance, "briefcase" for work.

6. If there are no emails, return a headline saying so and empty sections.`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER CONTENT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Result of building user content — includes the prompt text and a mapping
 * from short thread reference keys (T1, T2, ...) back to real email IDs.
 * This lets us use short refs in the AI prompt instead of raw UUIDs,
 * which the AI can faithfully return without truncation/hallucination.
 */
export interface UserContentResult {
  content: string;
  /** Map from short ref (e.g. "T1") to real email IDs from that thread */
  refToEmailIds: Record<string, string[]>;
}

/**
 * Builds the user content string from gathered summary input data.
 * Uses short thread reference keys (T1, T2, ...) instead of raw UUIDs
 * so the AI can reliably echo them back in its response.
 */
export function buildSummaryUserContent(data: SummaryInputData): UserContentResult {
  const parts: string[] = [];
  const refToEmailIds: Record<string, string[]> = {};

  // Threads (the main input) — assign short refs T1, T2, ...
  if (data.threads.length > 0) {
    parts.push('=== EMAIL THREADS ===');
    for (let i = 0; i < data.threads.length; i++) {
      const thread = data.threads[i]!;
      const ref = `T${i + 1}`;
      refToEmailIds[ref] = thread.email_ids;
      const msgs = thread.email_count > 1 ? ` (${thread.email_count} messages)` : '';
      const brief = thread.ai_brief || `Subject: ${thread.subject || '(no subject)'}`;
      parts.push(`[${ref}] ${brief}${msgs}`);
    }
  } else {
    parts.push('=== NO NEW EMAILS ===');
  }

  // Pending actions
  if (data.actions.length > 0) {
    parts.push('');
    parts.push('=== PENDING ACTIONS ===');
    for (const action of data.actions) {
      const deadline = action.deadline ? ` (due: ${action.deadline})` : '';
      parts.push(`- ${action.title}${deadline} [${action.priority}]`);
    }
  }

  // Upcoming dates
  if (data.upcoming_dates.length > 0) {
    parts.push('');
    parts.push('=== UPCOMING DATES (next 7 days) ===');
    for (const date of data.upcoming_dates) {
      parts.push(`- ${date.title} on ${date.date} (${date.date_type})`);
    }
  }

  // New ideas
  if (data.new_ideas.length > 0) {
    parts.push('');
    parts.push(`=== NEW IDEAS (${data.new_ideas.length}) ===`);
    for (const idea of data.new_ideas.slice(0, 5)) {
      parts.push(`- ${idea}`);
    }
  }

  // New news
  if (data.new_news.length > 0) {
    parts.push('');
    parts.push(`=== NEWS ITEMS (${data.new_news.length}) ===`);
    for (const news of data.new_news.slice(0, 5)) {
      parts.push(`- ${news}`);
    }
  }

  return { content: parts.join('\n'), refToEmailIds };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OpenAI function-calling schema for the create_summary function.
 */
export const SUMMARY_FUNCTION_SCHEMA: FunctionSchema = {
  name: 'create_summary',
  description: 'Create a narrative email summary with themed sections and stats.',
  parameters: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        description: 'Conversational 1-2 sentence overview of what happened.',
      },
      sections: {
        type: 'array',
        description: 'Themed sections grouping related items. 2-5 sections.',
        items: {
          type: 'object',
          properties: {
            theme: {
              type: 'string',
              description: 'Section theme name, e.g. "Needs Your Response", "Client Updates".',
            },
            icon: {
              type: 'string',
              description: 'Lucide icon name for the section.',
            },
            items: {
              type: 'array',
              description: '2-5 bullet point items in this section.',
              items: {
                type: 'object',
                properties: {
                  text: {
                    type: 'string',
                    description: 'One-sentence narrative bullet point.',
                  },
                  email_ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Thread reference IDs (e.g. "T1", "T2") from the input that sourced this item. IMPORTANT: use the exact reference keys from the input.',
                  },
                  action_needed: {
                    type: 'boolean',
                    description: 'Whether this item needs user action.',
                  },
                  urgency: {
                    type: 'string',
                    enum: ['high', 'medium', 'low'],
                    description: 'Urgency level of this item.',
                  },
                },
                required: ['text', 'email_ids', 'action_needed', 'urgency'],
              },
            },
          },
          required: ['theme', 'icon', 'items'],
        },
      },
      stats: {
        type: 'object',
        description: 'Quick numerical stats from the input data.',
        properties: {
          new_emails: { type: 'number', description: 'Total new emails included.' },
          threads_active: { type: 'number', description: 'Number of active threads.' },
          actions_pending: { type: 'number', description: 'Number of pending actions.' },
          deadlines_upcoming: { type: 'number', description: 'Deadlines in next 7 days.' },
        },
        required: ['new_emails', 'threads_active', 'actions_pending', 'deadlines_upcoming'],
      },
    },
    required: ['headline', 'sections', 'stats'],
  },
};
