/**
 * New Campaign Page (Campaign Builder)
 *
 * Multi-step wizard for creating email campaigns.
 * Steps: Info -> Recipients -> Content -> Settings -> Review
 *
 * @module app/(auth)/campaigns/new/page
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  Button,
  Input,
  Label,
  Textarea,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import {
  useCampaigns,
  useTemplates,
  useGmailAccounts,
  type CampaignRecipient,
  type FollowUpConfig,
  type Template,
} from '@/hooks';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Upload,
  Users,
  Mail,
  FileText,
  Settings,
  Eye,
  AlertCircle,
  Info,
  Plus,
  Trash2,
  Copy,
} from 'lucide-react';
import { createLogger } from '@/lib/utils/logger';

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGER
// ═══════════════════════════════════════════════════════════════════════════════

const logger = createLogger('CampaignBuilder');

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface CampaignFormData {
  name: string;
  description: string;
  accountId: string;
  templateId: string;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  recipients: CampaignRecipient[];
  throttleSeconds: number;
  scheduledAt: string;
  followUp: FollowUpConfig;
}

type Step = 'info' | 'recipients' | 'content' | 'settings' | 'review';

const STEPS: { id: Step; label: string; icon: React.ReactNode }[] = [
  { id: 'info', label: 'Campaign Info', icon: <FileText className="h-4 w-4" /> },
  { id: 'recipients', label: 'Recipients', icon: <Users className="h-4 w-4" /> },
  { id: 'content', label: 'Email Content', icon: <Mail className="h-4 w-4" /> },
  { id: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
  { id: 'review', label: 'Review', icon: <Eye className="h-4 w-4" /> },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

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

/**
 * Parses CSV text into recipient objects.
 * Expects first row to be headers.
 */
function parseCSV(csvText: string): { recipients: CampaignRecipient[]; errors: string[] } {
  const lines = csvText.trim().split('\n');
  const errors: string[] = [];
  const recipients: CampaignRecipient[] = [];

  if (lines.length < 2) {
    return { recipients: [], errors: ['CSV must have at least a header row and one data row'] };
  }

  // Parse header row
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
  const emailIndex = headers.findIndex((h) => h === 'email' || h === 'email address' || h === 'e-mail');

  if (emailIndex === -1) {
    return { recipients: [], errors: ['CSV must have an "email" column'] };
  }

  // Map common header variations to standard field names
  const fieldMap: Record<string, string> = {
    'first name': 'first_name',
    'firstname': 'first_name',
    'first': 'first_name',
    'last name': 'last_name',
    'lastname': 'last_name',
    'last': 'last_name',
    'company name': 'company',
    'organization': 'company',
    'email address': 'email',
    'e-mail': 'email',
  };

  const normalizedHeaders = headers.map((h) => fieldMap[h] || h.replace(/\s+/g, '_'));

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parsing (doesn't handle quoted commas)
    const values = line.split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));

    const recipient: CampaignRecipient = { email: '' };

    normalizedHeaders.forEach((header, idx) => {
      if (values[idx]) {
        recipient[header] = values[idx];
      }
    });

    // Validate email
    const email = recipient.email;
    if (!email || !email.includes('@')) {
      errors.push(`Row ${i + 1}: Invalid or missing email address`);
      continue;
    }

    recipients.push(recipient);
  }

  return { recipients, errors };
}

/**
 * Merges template with recipient data for preview.
 */
function mergeTemplate(template: string, data: Record<string, string | undefined>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match, field) => {
    const key = field.trim();
    return data[key] || match;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Step 1: Campaign Info
 */
function StepInfo({
  data,
  onChange,
  accounts,
  templates,
}: {
  data: CampaignFormData;
  onChange: (updates: Partial<CampaignFormData>) => void;
  accounts: Array<{ id: string; email: string; has_send_scope: boolean }>;
  templates: Template[];
}) {
  const handleTemplateSelect = (templateId: string) => {
    if (templateId === 'none') {
      onChange({ templateId: '' });
      return;
    }

    const template = templates.find((t) => t.id === templateId);
    if (template) {
      onChange({
        templateId,
        subjectTemplate: template.subject_template,
        bodyHtmlTemplate: template.body_html_template,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Campaign Name *</Label>
        <Input
          id="name"
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g., January Newsletter"
        />
        <p className="text-xs text-muted-foreground">
          A descriptive name to identify this campaign
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Optional description..."
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="account">Send From *</Label>
        <Select value={data.accountId} onValueChange={(v) => onChange({ accountId: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Select Gmail account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account) => (
              <SelectItem
                key={account.id}
                value={account.id}
                disabled={!account.has_send_scope}
              >
                {account.email}
                {!account.has_send_scope && ' (needs authorization)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {accounts.length === 0 && (
          <p className="text-xs text-destructive">
            No Gmail accounts connected. Please connect an account first.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="template">Use Template (Optional)</Label>
        <Select value={data.templateId || 'none'} onValueChange={handleTemplateSelect}>
          <SelectTrigger>
            <SelectValue placeholder="Start from scratch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Start from scratch</SelectItem>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                {template.name}
                {template.category && ` (${template.category})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Select a template to pre-fill the email content
        </p>
      </div>
    </div>
  );
}

/**
 * Step 2: Recipients
 */
function StepRecipients({
  data,
  onChange,
}: {
  data: CampaignFormData;
  onChange: (updates: Partial<CampaignFormData>) => void;
}) {
  const [csvText, setCsvText] = React.useState('');
  const [parseErrors, setParseErrors] = React.useState<string[]>([]);
  const [inputMode, setInputMode] = React.useState<'csv' | 'manual'>('csv');

  const handleParseCsv = () => {
    const { recipients, errors } = parseCSV(csvText);
    setParseErrors(errors);
    if (recipients.length > 0) {
      onChange({ recipients });
      logger.info('Parsed CSV recipients', { count: recipients.length, errorCount: errors.length });
    }
  };

  const handleAddManualRecipient = () => {
    onChange({
      recipients: [...data.recipients, { email: '', first_name: '', company: '' }],
    });
  };

  const handleUpdateRecipient = (index: number, updates: Partial<CampaignRecipient>) => {
    const newRecipients = [...data.recipients];
    newRecipients[index] = { ...newRecipients[index], ...updates };
    onChange({ recipients: newRecipients });
  };

  const handleRemoveRecipient = (index: number) => {
    onChange({ recipients: data.recipients.filter((_, i) => i !== index) });
  };

  // Get merge fields from templates
  const mergeFields = React.useMemo(() => {
    const subjectFields = extractMergeFields(data.subjectTemplate);
    const bodyFields = extractMergeFields(data.bodyHtmlTemplate);
    return [...new Set([...subjectFields, ...bodyFields])];
  }, [data.subjectTemplate, data.bodyHtmlTemplate]);

  return (
    <div className="space-y-6">
      <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'csv' | 'manual')}>
        <TabsList>
          <TabsTrigger value="csv">Paste CSV</TabsTrigger>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
        </TabsList>

        <TabsContent value="csv" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv">Paste CSV Data</Label>
            <Textarea
              id="csv"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`email,first_name,last_name,company\njohn@example.com,John,Doe,Acme Corp\njane@example.com,Jane,Smith,TechCo`}
              rows={8}
              className="font-mono text-sm"
            />
            <div className="flex items-center gap-2">
              <Button type="button" onClick={handleParseCsv} disabled={!csvText.trim()}>
                <Upload className="h-4 w-4 mr-2" />
                Parse CSV
              </Button>
              <p className="text-xs text-muted-foreground">
                First row must be headers. Email column is required.
              </p>
            </div>
          </div>

          {parseErrors.length > 0 && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm font-medium text-destructive mb-1">
                {parseErrors.length} error(s):
              </p>
              <ul className="text-xs text-destructive space-y-1">
                {parseErrors.slice(0, 5).map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
                {parseErrors.length > 5 && (
                  <li>...and {parseErrors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </TabsContent>

        <TabsContent value="manual" className="space-y-4">
          <div className="space-y-2">
            {data.recipients.map((recipient, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                <Input
                  placeholder="email@example.com"
                  value={recipient.email}
                  onChange={(e) => handleUpdateRecipient(index, { email: e.target.value })}
                  className="flex-1"
                />
                <Input
                  placeholder="First name"
                  value={recipient.first_name || ''}
                  onChange={(e) => handleUpdateRecipient(index, { first_name: e.target.value })}
                  className="w-32"
                />
                <Input
                  placeholder="Company"
                  value={recipient.company || ''}
                  onChange={(e) => handleUpdateRecipient(index, { company: e.target.value })}
                  className="w-32"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveRecipient(index)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={handleAddManualRecipient}>
              <Plus className="h-4 w-4 mr-2" />
              Add Recipient
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Summary */}
      {data.recipients.length > 0 && (
        <div className="p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="font-medium">{data.recipients.length} recipients loaded</span>
          </div>
          {mergeFields.length > 0 && (
            <div className="text-sm text-muted-foreground">
              <p className="mb-1">Required merge fields:</p>
              <div className="flex flex-wrap gap-1">
                {mergeFields.map((field) => (
                  <Badge key={field} variant="secondary" className="text-xs">
                    {`{{${field}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Step 3: Email Content
 */
function StepContent({
  data,
  onChange,
}: {
  data: CampaignFormData;
  onChange: (updates: Partial<CampaignFormData>) => void;
}) {
  const mergeFields = ['first_name', 'last_name', 'email', 'company'];

  const insertMergeField = (field: string, target: 'subject' | 'body') => {
    const tag = `{{${field}}}`;
    if (target === 'subject') {
      onChange({ subjectTemplate: data.subjectTemplate + tag });
    } else {
      onChange({ bodyHtmlTemplate: data.bodyHtmlTemplate + tag });
    }
  };

  // Preview with first recipient or sample data
  const previewData = data.recipients[0] || {
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    company: 'Acme Corp',
  };
  const previewSubject = mergeTemplate(data.subjectTemplate, previewData);
  const previewBody = mergeTemplate(data.bodyHtmlTemplate, previewData);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Editor */}
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="subject">Subject Line *</Label>
            <div className="flex gap-1">
              {mergeFields.map((field) => (
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
            value={data.subjectTemplate}
            onChange={(e) => onChange({ subjectTemplate: e.target.value })}
            placeholder="e.g., {{first_name}}, check out our latest update"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="body">Email Body *</Label>
            <div className="flex gap-1">
              {mergeFields.map((field) => (
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
            value={data.bodyHtmlTemplate}
            onChange={(e) => onChange({ bodyHtmlTemplate: e.target.value })}
            placeholder={`<p>Hi {{first_name}},</p>\n\n<p>Your content here...</p>\n\n<p>Best regards</p>`}
            rows={12}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            HTML supported. Use {`{{field_name}}`} for merge fields.
          </p>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <Label>Preview</Label>
        <Card>
          <CardHeader className="pb-2">
            <p className="text-sm text-muted-foreground">Subject:</p>
            <p className="font-medium">{previewSubject || '(empty subject)'}</p>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: previewBody || '<p class="text-muted-foreground">(empty body)</p>' }}
            />
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Previewing with: {previewData.email}
        </p>
      </div>
    </div>
  );
}

/**
 * Step 4: Settings
 */
function StepSettings({
  data,
  onChange,
}: {
  data: CampaignFormData;
  onChange: (updates: Partial<CampaignFormData>) => void;
}) {
  return (
    <div className="space-y-6 max-w-xl">
      <div className="space-y-2">
        <Label htmlFor="throttle">Send Speed</Label>
        <Select
          value={data.throttleSeconds.toString()}
          onValueChange={(v) => onChange({ throttleSeconds: parseInt(v) })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15">Fast (15 sec between emails, ~240/hour)</SelectItem>
            <SelectItem value="25">Normal (25 sec between emails, ~140/hour)</SelectItem>
            <SelectItem value="45">Slow (45 sec between emails, ~80/hour)</SelectItem>
            <SelectItem value="60">Very Slow (60 sec between emails, ~60/hour)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Slower speeds reduce the risk of spam filters. Daily limit: 400 emails.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="schedule">Schedule (Optional)</Label>
        <Input
          id="schedule"
          type="datetime-local"
          value={data.scheduledAt}
          onChange={(e) => onChange({ scheduledAt: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Leave empty to start manually or save as draft.
        </p>
      </div>

      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Follow-up Automation</Label>
            <p className="text-xs text-muted-foreground">
              Automatically send a follow-up if no response
            </p>
          </div>
          <Switch
            checked={data.followUp.enabled}
            onCheckedChange={(checked) =>
              onChange({ followUp: { ...data.followUp, enabled: checked } })
            }
          />
        </div>

        {data.followUp.enabled && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Follow up if</Label>
              <Select
                value={data.followUp.condition || 'no_reply'}
                onValueChange={(v) =>
                  onChange({
                    followUp: { ...data.followUp, condition: v as 'no_open' | 'no_reply' | 'both' },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no_reply">No reply received</SelectItem>
                  <SelectItem value="no_open">Email not opened</SelectItem>
                  <SelectItem value="both">No open or reply</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Wait time before follow-up</Label>
              <Select
                value={(data.followUp.delayHours || 48).toString()}
                onValueChange={(v) =>
                  onChange({ followUp: { ...data.followUp, delayHours: parseInt(v) } })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">1 day</SelectItem>
                  <SelectItem value="48">2 days</SelectItem>
                  <SelectItem value="72">3 days</SelectItem>
                  <SelectItem value="96">4 days</SelectItem>
                  <SelectItem value="168">1 week</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Step 5: Review
 */
function StepReview({ data }: { data: CampaignFormData }) {
  const mergeFields = React.useMemo(() => {
    const subjectFields = extractMergeFields(data.subjectTemplate);
    const bodyFields = extractMergeFields(data.bodyHtmlTemplate);
    return [...new Set([...subjectFields, ...bodyFields])];
  }, [data.subjectTemplate, data.bodyHtmlTemplate]);

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Campaign Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Name</p>
              <p className="font-medium">{data.name || '-'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Recipients</p>
              <p className="font-medium">{data.recipients.length}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Send Speed</p>
              <p className="font-medium">{data.throttleSeconds}s between emails</p>
            </div>
            <div>
              <p className="text-muted-foreground">Scheduled</p>
              <p className="font-medium">{data.scheduledAt || 'Manual start'}</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-muted-foreground text-sm mb-2">Subject</p>
            <p className="font-medium">{data.subjectTemplate || '-'}</p>
          </div>

          {mergeFields.length > 0 && (
            <div className="border-t pt-4">
              <p className="text-muted-foreground text-sm mb-2">Merge Fields Used</p>
              <div className="flex flex-wrap gap-1">
                {mergeFields.map((field) => (
                  <Badge key={field} variant="secondary">
                    {`{{${field}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {data.followUp.enabled && (
            <div className="border-t pt-4">
              <p className="text-muted-foreground text-sm mb-2">Follow-up</p>
              <p className="font-medium">
                Enabled: Send after {data.followUp.delayHours || 48} hours if{' '}
                {data.followUp.condition === 'no_open'
                  ? 'not opened'
                  : data.followUp.condition === 'no_reply'
                  ? 'no reply'
                  : 'no open or reply'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
        <div className="flex gap-2">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-300">
            <p className="font-medium">Ready to create campaign</p>
            <p className="text-blue-600 dark:text-blue-400">
              The campaign will be saved as a draft. You can start it manually or it will start at the scheduled time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function NewCampaignPage() {
  const router = useRouter();

  // State
  const [currentStep, setCurrentStep] = React.useState<Step>('info');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<CampaignFormData>({
    name: '',
    description: '',
    accountId: '',
    templateId: '',
    subjectTemplate: '',
    bodyHtmlTemplate: '',
    recipients: [],
    throttleSeconds: 25,
    scheduledAt: '',
    followUp: {
      enabled: false,
      condition: 'no_reply',
      delayHours: 48,
    },
  });

  // Hooks
  const { createCampaign } = useCampaigns();
  const { templates, isLoading: templatesLoading } = useTemplates();
  const { accounts, isLoading: accountsLoading } = useGmailAccounts();

  // Step navigation
  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const goToNextStep = () => {
    if (!isLastStep) {
      setCurrentStep(STEPS[currentStepIndex + 1].id);
    }
  };

  const goToPrevStep = () => {
    if (!isFirstStep) {
      setCurrentStep(STEPS[currentStepIndex - 1].id);
    }
  };

  // Validation
  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'info':
        return !!formData.name && !!formData.accountId;
      case 'recipients':
        return formData.recipients.length > 0;
      case 'content':
        return !!formData.subjectTemplate && !!formData.bodyHtmlTemplate;
      case 'settings':
        return true;
      case 'review':
        return true;
      default:
        return false;
    }
  };

  // Form update handler
  const handleFormChange = (updates: Partial<CampaignFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  // Submit handler
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    logger.info('Creating campaign', { name: formData.name, recipientCount: formData.recipients.length });

    try {
      const result = await createCampaign({
        name: formData.name,
        description: formData.description || undefined,
        accountId: formData.accountId,
        templateId: formData.templateId || undefined,
        subjectTemplate: formData.subjectTemplate,
        bodyHtmlTemplate: formData.bodyHtmlTemplate,
        recipients: formData.recipients,
        throttleSeconds: formData.throttleSeconds,
        scheduledAt: formData.scheduledAt || undefined,
        followUp: formData.followUp.enabled ? formData.followUp : undefined,
      });

      if (result) {
        logger.success('Campaign created', { id: result.id });
        router.push(`/campaigns/${result.id}`);
      } else {
        throw new Error('Failed to create campaign');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Failed to create campaign', { error: errorMessage });
      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (accountsLoading || templatesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Create Campaign"
        description="Set up a new email campaign with merge fields"
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Campaigns', href: '/campaigns' },
          { label: 'New' },
        ]}
      />

      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between max-w-3xl">
          {STEPS.map((step, index) => (
            <React.Fragment key={step.id}>
              <button
                onClick={() => setCurrentStep(step.id)}
                disabled={index > currentStepIndex + 1}
                className={`flex items-center gap-2 ${
                  index <= currentStepIndex
                    ? 'text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    index < currentStepIndex
                      ? 'bg-primary text-primary-foreground'
                      : index === currentStepIndex
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {index < currentStepIndex ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span className="hidden sm:block text-sm">{step.label}</span>
              </button>
              {index < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    index < currentStepIndex ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[currentStepIndex].label}</CardTitle>
          <CardDescription>
            {currentStep === 'info' && 'Enter basic campaign information'}
            {currentStep === 'recipients' && 'Add recipients for your campaign'}
            {currentStep === 'content' && 'Create your email content with merge fields'}
            {currentStep === 'settings' && 'Configure sending options'}
            {currentStep === 'review' && 'Review your campaign before creating'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 'info' && (
            <StepInfo
              data={formData}
              onChange={handleFormChange}
              accounts={accounts}
              templates={templates}
            />
          )}
          {currentStep === 'recipients' && (
            <StepRecipients data={formData} onChange={handleFormChange} />
          )}
          {currentStep === 'content' && (
            <StepContent data={formData} onChange={handleFormChange} />
          )}
          {currentStep === 'settings' && (
            <StepSettings data={formData} onChange={handleFormChange} />
          )}
          {currentStep === 'review' && <StepReview data={formData} />}
        </CardContent>
      </Card>

      {/* Error display */}
      {submitError && (
        <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <div className="flex gap-2">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
            <p className="text-sm text-destructive">{submitError}</p>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="outline"
          onClick={goToPrevStep}
          disabled={isFirstStep || isSubmitting}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex gap-2">
          {isLastStep ? (
            <Button onClick={handleSubmit} disabled={!canProceed() || isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Campaign
            </Button>
          ) : (
            <Button onClick={goToNextStep} disabled={!canProceed()}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
