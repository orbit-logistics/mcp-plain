import { z } from "zod";

// Impact level enum values
export const IMPACT_LEVELS = [
  "P0",
  "P1",
  "P2",
  "RBS",
  "RBP",
  "not-a-bug",
] as const;

export type ImpactLevel = (typeof IMPACT_LEVELS)[number];

// Custom thread fields from Plain
export interface ThreadCustomFields {
  impactLevel?: ImpactLevel;
  notionTicket?: string;
  posthogSession?: string;
  githubPr?: string;
  tenant?: string;
  affectedApp?: string;
  reportedFromUrl?: string;
  affectedStage?: string;
  requestFeature?: boolean;
  sentrySession?: string;
}

// Field key mapping from Plain's snake_case to camelCase
export const FIELD_KEY_MAP: Record<string, keyof ThreadCustomFields> = {
  impact_level: "impactLevel",
  notion_ticket: "notionTicket",
  posthog_session: "posthogSession",
  github_pr: "githubPr",
  tenant_id: "tenant",
  app: "affectedApp",
  reported_from: "reportedFromUrl",
  stage: "affectedStage",
  request_feature: "requestFeature",
  sentry_session: "sentrySession",
};

// Thread label info
export interface ThreadLabel {
  id: string;
  name: string;
}

// Customer info
export interface CustomerInfo {
  id: string;
  email?: string;
  fullName?: string;
  externalId?: string;
}

// Thread summary for list view
export interface ThreadSummary {
  id: string;
  title?: string;
  status: string;
  priority: number;
  customer?: CustomerInfo;
  labels: ThreadLabel[];
  createdAt: string;
  updatedAt: string;
}

// Timeline entry types
export interface TimelineEntryBase {
  id: string;
  timestamp: string;
  entryType: "NOTE" | "EMAIL" | "CHAT" | "CUSTOM" | "SLACK" | "DISCUSSION" | "DISCUSSION_MESSAGE" | "DISCUSSION_RESOLVED" | "UNKNOWN";
}

export interface NoteTimelineEntry extends TimelineEntryBase {
  entryType: "NOTE";
  text: string;
  markdown?: string;
  createdBy?: { name?: string; email?: string };
}

export interface Attachment {
  id: string;
  fileName: string;
  fileSizeKb?: number;
  mimeType?: string;
}

export interface EmailTimelineEntry extends TimelineEntryBase {
  entryType: "EMAIL";
  subject?: string;
  textContent?: string;
  from?: { email: string; name?: string };
  to?: { email: string; name?: string }[];
  attachments?: Attachment[];
}

export interface ChatTimelineEntry extends TimelineEntryBase {
  entryType: "CHAT";
  text: string;
  createdBy?: { name?: string; type: "customer" | "user" };
}

export interface CustomTimelineEntry extends TimelineEntryBase {
  entryType: "CUSTOM";
  title?: string;
  externalId?: string;
  content?: string;
}

export interface SlackTimelineEntry extends TimelineEntryBase {
  entryType: "SLACK";
  text: string;
  isReply?: boolean;
  slackMessageLink?: string;
  attachments?: Attachment[];
  createdBy?: { name?: string };
}

export interface DiscussionTimelineEntry extends TimelineEntryBase {
  entryType: "DISCUSSION";
  threadDiscussionId: string;
  discussionType: string;
  slackChannelName?: string;
  slackMessageLink?: string;
  emailRecipients?: string;
}

export interface DiscussionMessageTimelineEntry extends TimelineEntryBase {
  entryType: "DISCUSSION_MESSAGE";
  threadDiscussionId: string;
  threadDiscussionMessageId: string;
  discussionType: string;
  text: string;
  slackMessageLink?: string;
  attachments?: Attachment[];
  createdBy?: { name?: string };
}

export interface DiscussionResolvedTimelineEntry extends TimelineEntryBase {
  entryType: "DISCUSSION_RESOLVED";
  threadDiscussionId: string;
  discussionType: string;
  resolvedAt: string;
  slackChannelName?: string;
  slackMessageLink?: string;
}

export interface UnknownTimelineEntry extends TimelineEntryBase {
  entryType: "UNKNOWN";
}

export type TimelineEntry =
  | NoteTimelineEntry
  | EmailTimelineEntry
  | ChatTimelineEntry
  | CustomTimelineEntry
  | SlackTimelineEntry
  | DiscussionTimelineEntry
  | DiscussionMessageTimelineEntry
  | DiscussionResolvedTimelineEntry
  | UnknownTimelineEntry;

// Full thread details
export interface ThreadDetails extends ThreadSummary {
  description?: string;
  externalId?: string;
  customFields: ThreadCustomFields;
  timeline: TimelineEntry[];
}

// Pagination info
export interface PageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

// List threads response
export interface ListThreadsResponse {
  threads: ThreadSummary[];
  pageInfo: PageInfo;
}

// Tool input schemas
export const listThreadsInputSchema = z.object({
  statuses: z
    .array(z.string())
    .optional()
    .describe("Filter by thread statuses (e.g., 'TODO', 'DONE', 'SNOOZED')"),
  priority: z
    .number()
    .min(0)
    .max(3)
    .optional()
    .describe("Filter by priority (0 = urgent, 3 = low)"),
  labelTypeIds: z
    .array(z.string())
    .optional()
    .describe("Filter by label type IDs"),
  customerId: z.string().optional().describe("Filter by customer ID"),
  tenantId: z.string().optional().describe("Filter by tenant ID (via thread field)"),
  first: z
    .number()
    .min(1)
    .max(100)
    .default(50)
    .optional()
    .describe("Number of threads to return (default 50, max 100)"),
  after: z.string().optional().describe("Cursor for pagination"),
});

export const getThreadInputSchema = z.object({
  threadId: z.string().describe("The ID of the thread to retrieve"),
});

export const getThreadFieldsInputSchema = z.object({
  threadId: z.string().describe("The ID of the thread to get fields for"),
});

export const getThreadByRefInputSchema = z.object({
  ref: z.string().describe("Thread reference number (e.g., 'T-510')"),
});

export const getAttachmentDownloadUrlInputSchema = z.object({
  attachmentId: z.string().describe("The ID of the attachment to get a download URL for"),
});

export const getAttachmentContentInputSchema = z.object({
  attachmentId: z.string().describe("The ID of the attachment to fetch content for"),
});

// Response type for attachment download URL
export interface AttachmentDownloadUrlResponse {
  downloadUrl: string;
  expiresAt: string;
}

// Response type for attachment content
export interface AttachmentContentResponse {
  content: string;
  mimeType?: string;
  encoding: "text" | "base64";
}

export const upsertThreadFieldInputSchema = z.object({
  threadId: z.string().describe("The ID of the thread to update"),
  key: z
    .string()
    .describe(
      "Custom field key in snake_case, e.g. impact_level, app, stage, tenant_id, notion_ticket, github_pr, posthog_session, sentry_session, reported_from, request_feature"
    ),
  value: z
    .string()
    .describe("Field value to set. For boolean fields like request_feature, use 'true' or 'false'"),
});

export const addInternalNoteInputSchema = z.object({
  threadId: z.string().describe("The ID of the thread to add a note to"),
  markdown: z.string().describe("Markdown content for the internal note"),
});

export const replyToThreadInputSchema = z.object({
  threadId: z.string().describe("The ID of the thread to reply to"),
  textContent: z.string().describe("Plain text content of the reply"),
  markdownContent: z.string().optional().describe("Optional markdown-formatted content of the reply"),
});

export const markThreadAsDoneInputSchema = z.object({
  threadId: z.string().describe("The ID of the thread to mark as done"),
});

export const addLabelsInputSchema = z.object({
  threadId: z.string().describe("The ID of the thread to add labels to"),
  labelTypeIds: z
    .array(z.string())
    .describe(
      "Array of label type IDs to add. Use get_label_types first to discover available label type IDs."
    ),
});

export const getLabelTypesInputSchema = z.object({
  first: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Number of label types to return (default 50)"),
});

export const createThreadInputSchema = z.object({
  customerEmail: z
    .string()
    .optional()
    .describe("Customer email address. Provide either customerEmail, customerId, or customerExternalId."),
  customerId: z
    .string()
    .optional()
    .describe("Existing Plain customer ID. Provide either customerEmail, customerId, or customerExternalId."),
  customerExternalId: z
    .string()
    .optional()
    .describe("Customer external ID. Provide either customerEmail, customerId, or customerExternalId."),
  customerFullName: z
    .string()
    .optional()
    .describe("Customer full name. Used when upserting a customer by email (ignored when customerId is provided)."),
  title: z.string().optional().describe("Thread title"),
  description: z.string().optional().describe("Thread description / preview text"),
  markdown: z
    .string()
    .describe("Markdown content for the first timeline entry in the thread"),
  priority: z
    .number()
    .min(0)
    .max(3)
    .optional()
    .describe("Priority: 0 = urgent, 1 = high, 2 = normal (default), 3 = low"),
  labelTypeIds: z
    .array(z.string())
    .optional()
    .describe("Label type IDs to attach. Use get_label_types to discover available IDs."),
  externalId: z
    .string()
    .optional()
    .describe("Your own unique identifier for this thread"),
  // Custom thread fields (Plain snake_case keys)
  impactLevel: z
    .enum(["P0", "P1", "P2", "RBS", "RBP", "not-a-bug"])
    .optional()
    .describe("Impact level: P0 (critical), P1, P2, RBS (release blocker staging), RBP (release blocker production), not-a-bug"),
  app: z
    .string()
    .optional()
    .describe("Affected app identifier (e.g. 'web', 'mobile', 'api')"),
  tenantId: z
    .string()
    .optional()
    .describe("Tenant ID to associate with the thread"),
  stage: z
    .string()
    .optional()
    .describe("Environment stage (e.g. 'production', 'staging', 'develop')"),
  reportedFrom: z
    .string()
    .optional()
    .describe("URL where the issue was reported from"),
  posthogSession: z
    .string()
    .optional()
    .describe("PostHog session replay URL or session recording ID"),
  sentrySession: z
    .string()
    .optional()
    .describe("Sentry replay URL or replay ID"),
  notionTicket: z
    .string()
    .optional()
    .describe("Notion ticket URL or ID"),
  githubPr: z
    .string()
    .optional()
    .describe("GitHub PR URL"),
  requestFeature: z
    .boolean()
    .optional()
    .describe("Whether this is a feature request"),
});

export interface CreateThreadResponse {
  threadId: string;
  title?: string;
  status: string;
  priority: number;
}

// Help Center input schemas
export const listHelpCentersInputSchema = z.object({});

export const getHelpCenterInputSchema = z.object({
  helpCenterId: z.string().describe("The ID of the help center to retrieve"),
});

export const listHelpCenterArticlesInputSchema = z.object({
  helpCenterId: z.string().describe("The ID of the help center to list articles from"),
  first: z
    .number()
    .min(1)
    .max(100)
    .optional()
    .describe("Number of articles to return (default 20, max 100)"),
});

export const getHelpCenterArticleInputSchema = z.object({
  helpCenterArticleId: z.string().describe("The ID of the help center article to retrieve"),
});

export const getHelpCenterArticleBySlugInputSchema = z.object({
  helpCenterId: z.string().describe("The ID of the help center the article belongs to"),
  slug: z.string().describe("The URL slug of the article"),
});

export const upsertHelpCenterArticleInputSchema = z.object({
  helpCenterId: z.string().describe("The ID of the help center to create/update the article in"),
  title: z.string().describe("Article title"),
  contentHtml: z.string().describe("Article content as HTML (not markdown)"),
  helpCenterArticleId: z
    .string()
    .optional()
    .describe("Existing article ID for updates. Omit to create a new article."),
  description: z.string().describe("Short description / summary of the article"),
  slug: z.string().optional().describe("URL slug for the article"),
  helpCenterArticleGroupId: z
    .string()
    .optional()
    .describe("Article group ID to place the article in"),
});

export const createHelpCenterArticleGroupInputSchema = z.object({
  helpCenterId: z.string().describe("The ID of the help center to create the group in"),
  name: z.string().describe("Name of the article group"),
  parentHelpCenterArticleGroupId: z
    .string()
    .optional()
    .describe("Parent group ID for nested groups"),
});

export const deleteHelpCenterArticleGroupInputSchema = z.object({
  helpCenterArticleGroupId: z.string().describe("The ID of the article group to delete"),
});

export type ListHelpCentersInput = z.infer<typeof listHelpCentersInputSchema>;
export type GetHelpCenterInput = z.infer<typeof getHelpCenterInputSchema>;
export type ListHelpCenterArticlesInput = z.infer<typeof listHelpCenterArticlesInputSchema>;
export type GetHelpCenterArticleInput = z.infer<typeof getHelpCenterArticleInputSchema>;
export type GetHelpCenterArticleBySlugInput = z.infer<typeof getHelpCenterArticleBySlugInputSchema>;
export type UpsertHelpCenterArticleInput = z.infer<typeof upsertHelpCenterArticleInputSchema>;
export type CreateHelpCenterArticleGroupInput = z.infer<typeof createHelpCenterArticleGroupInputSchema>;
export type DeleteHelpCenterArticleGroupInput = z.infer<typeof deleteHelpCenterArticleGroupInputSchema>;

export type ListThreadsInput = z.infer<typeof listThreadsInputSchema>;
export type GetThreadInput = z.infer<typeof getThreadInputSchema>;
export type GetThreadFieldsInput = z.infer<typeof getThreadFieldsInputSchema>;
export type GetThreadByRefInput = z.infer<typeof getThreadByRefInputSchema>;
export type GetAttachmentDownloadUrlInput = z.infer<typeof getAttachmentDownloadUrlInputSchema>;
export type GetAttachmentContentInput = z.infer<typeof getAttachmentContentInputSchema>;
export type UpsertThreadFieldInput = z.infer<typeof upsertThreadFieldInputSchema>;
export type AddInternalNoteInput = z.infer<typeof addInternalNoteInputSchema>;
export type ReplyToThreadInput = z.infer<typeof replyToThreadInputSchema>;
export type MarkThreadAsDoneInput = z.infer<typeof markThreadAsDoneInputSchema>;
export type AddLabelsInput = z.infer<typeof addLabelsInputSchema>;
export type GetLabelTypesInput = z.infer<typeof getLabelTypesInputSchema>;
export type CreateThreadInput = z.infer<typeof createThreadInputSchema>;
