import { ThreadStatus, ThreadFieldSchemaType } from "@team-plain/typescript-sdk";
import { getPlainClient } from "../client.js";
import {
  FIELD_KEY_MAP,
  type Attachment,
  type CustomerInfo,
  type ListThreadsInput,
  type ListThreadsResponse,
  type GetThreadInput,
  type GetThreadFieldsInput,
  type GetThreadByRefInput,
  type GetAttachmentDownloadUrlInput,
  type GetAttachmentContentInput,
  type UpsertThreadFieldInput,
  type AddInternalNoteInput,
  type AddLabelsInput,
  type GetLabelTypesInput,
  type ReplyToThreadInput,
  type MarkThreadAsDoneInput,
  type CreateThreadInput,
  type CreateThreadResponse,
  type AttachmentDownloadUrlResponse,
  type AttachmentContentResponse,
  type ThreadCustomFields,
  type ThreadDetails,
  type ThreadLabel,
  type ThreadSummary,
  type TimelineEntry,
  type NoteTimelineEntry,
  type EmailTimelineEntry,
  type ChatTimelineEntry,
  type CustomTimelineEntry,
  type SlackTimelineEntry,
  type DiscussionTimelineEntry,
  type DiscussionMessageTimelineEntry,
  type DiscussionResolvedTimelineEntry,
  type ImpactLevel,
  IMPACT_LEVELS,
} from "../types.js";

/**
 * GraphQL query for fetching a thread by ID with timeline entries
 */
const THREAD_QUERY = `
  query GetThread($threadId: ID!) {
    thread(threadId: $threadId) {
      id
      externalId
      title
      previewText
      status
      priority
      customer {
        id
        fullName
        email { email }
        externalId
      }
      labels {
        labelType {
          id
          name
        }
      }
      threadFields {
        key
        stringValue
        booleanValue
      }
      createdAt { iso8601 }
      updatedAt { iso8601 }
      timelineEntries(first: 50) {
        edges {
          node {
            id
            timestamp { iso8601 }
            actor {
              __typename
              ... on UserActor { user { fullName } }
              ... on CustomerActor { customer { fullName } }
              ... on MachineUserActor { machineUser { fullName } }
            }
            entry {
              __typename
              ... on NoteEntry {
                markdown
              }
              ... on EmailEntry {
                subject
                markdownContent
                from { email name }
                attachments {
                  id
                  fileName
                  fileSize { kiloBytes }
                  fileMimeType
                }
              }
              ... on CustomEntry {
                title
                externalId
                components {
                  __typename
                  ... on ComponentText {
                    text
                  }
                  ... on ComponentPlainText {
                    plainText
                  }
                }
              }
              ... on SlackMessageEntry {
                text
                slackMessageLink
                attachments {
                  id
                  fileName
                  fileSize { kiloBytes }
                  fileMimeType
                }
              }
              ... on SlackReplyEntry {
                text
                slackMessageLink
                attachments {
                  id
                  fileName
                  fileSize { kiloBytes }
                  fileMimeType
                }
              }
              ... on ThreadDiscussionEntry {
                threadDiscussionId
                discussionType
                slackChannelName
                slackMessageLink
                emailRecipients
              }
              ... on ThreadDiscussionMessageEntry {
                threadDiscussionId
                threadDiscussionMessageId
                discussionType
                text
                resolvedText
                slackMessageLink
                attachments {
                  id
                  fileName
                  fileSize { kiloBytes }
                  fileMimeType
                }
              }
              ... on ThreadDiscussionResolvedEntry {
                threadDiscussionId
                discussionType
                resolvedAt { iso8601 }
                slackChannelName
                slackMessageLink
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * GraphQL query for fetching a thread by reference with timeline entries
 */
const THREAD_BY_REF_QUERY = `
  query GetThreadByRef($ref: String!) {
    threadByRef(ref: $ref) {
      id
      externalId
      title
      previewText
      status
      priority
      customer {
        id
        fullName
        email { email }
        externalId
      }
      labels {
        labelType {
          id
          name
        }
      }
      threadFields {
        key
        stringValue
        booleanValue
      }
      createdAt { iso8601 }
      updatedAt { iso8601 }
      timelineEntries(first: 50) {
        edges {
          node {
            id
            timestamp { iso8601 }
            actor {
              __typename
              ... on UserActor { user { fullName } }
              ... on CustomerActor { customer { fullName } }
              ... on MachineUserActor { machineUser { fullName } }
            }
            entry {
              __typename
              ... on NoteEntry {
                markdown
              }
              ... on EmailEntry {
                subject
                markdownContent
                from { email name }
                attachments {
                  id
                  fileName
                  fileSize { kiloBytes }
                  fileMimeType
                }
              }
              ... on CustomEntry {
                title
                externalId
                components {
                  __typename
                  ... on ComponentText {
                    text
                  }
                  ... on ComponentPlainText {
                    plainText
                  }
                }
              }
              ... on SlackMessageEntry {
                text
                slackMessageLink
                attachments {
                  id
                  fileName
                  fileSize { kiloBytes }
                  fileMimeType
                }
              }
              ... on SlackReplyEntry {
                text
                slackMessageLink
                attachments {
                  id
                  fileName
                  fileSize { kiloBytes }
                  fileMimeType
                }
              }
              ... on ThreadDiscussionEntry {
                threadDiscussionId
                discussionType
                slackChannelName
                slackMessageLink
                emailRecipients
              }
              ... on ThreadDiscussionMessageEntry {
                threadDiscussionId
                threadDiscussionMessageId
                discussionType
                text
                resolvedText
                slackMessageLink
                attachments {
                  id
                  fileName
                  fileSize { kiloBytes }
                  fileMimeType
                }
              }
              ... on ThreadDiscussionResolvedEntry {
                threadDiscussionId
                discussionType
                resolvedAt { iso8601 }
                slackChannelName
                slackMessageLink
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Map Plain's thread status string to ThreadStatus enum
 */
const mapStatus = (status: string): ThreadStatus | undefined => {
  const statusMap: Record<string, ThreadStatus> = {
    TODO: ThreadStatus.Todo,
    DONE: ThreadStatus.Done,
    SNOOZED: ThreadStatus.Snoozed,
  };
  return statusMap[status];
};

/**
 * Parse thread fields from Plain's format to our ThreadCustomFields interface
 */
const parseThreadFields = (
  fields: Array<{ key: string; stringValue?: string | null; booleanValue?: boolean | null }>
): ThreadCustomFields => {
  const result: ThreadCustomFields = {};

  for (const field of fields) {
    const mappedKey = FIELD_KEY_MAP[field.key];
    if (!mappedKey) continue;

    if (mappedKey === "requestFeature") {
      result[mappedKey] = field.booleanValue ?? undefined;
    } else if (mappedKey === "impactLevel") {
      const value = field.stringValue;
      if (value && IMPACT_LEVELS.includes(value as ImpactLevel)) {
        result[mappedKey] = value as ImpactLevel;
      }
    } else {
      result[mappedKey] = field.stringValue ?? undefined;
    }
  }

  return result;
};

/**
 * Extract customer info from Plain's customer object
 */
const extractCustomerInfo = (customer: {
  id: string;
  email?: { email: string } | null;
  fullName?: string | null;
  externalId?: string | null;
}): CustomerInfo => ({
  id: customer.id,
  email: customer.email?.email,
  fullName: customer.fullName ?? undefined,
  externalId: customer.externalId ?? undefined,
});

/**
 * Extract labels from Plain's label array
 */
const extractLabels = (
  labels: Array<{ labelType: { id: string; name: string } }>
): ThreadLabel[] =>
  labels.map((l) => ({
    id: l.labelType.id,
    name: l.labelType.name,
  }));

/**
 * Raw timeline entry from GraphQL response
 */
interface RawTimelineEntry {
  id: string;
  timestamp?: { iso8601: string };
  actor?: {
    __typename: string;
    user?: { fullName: string | null };
    customer?: { fullName: string | null };
    machineUser?: { fullName: string | null };
  };
  entry: {
    __typename: string;
    text?: string | null;
    markdown?: string | null;
    subject?: string | null;
    textContent?: string | null;
    markdownContent?: string | null;
    title?: string | null;
    externalId?: string | null;
    from?: { email: string; name?: string | null } | null;
    slackMessageLink?: string | null;
    components?: Array<{
      __typename: string;
      text?: string | null;
      plainText?: string | null;
    }> | null;
    attachments?: Array<{
      id: string;
      fileName: string;
      fileSize?: { kiloBytes?: number | null } | null;
      fileMimeType?: string | null;
    }> | null;
    threadDiscussionId?: string | null;
    threadDiscussionMessageId?: string | null;
    discussionType?: string | null;
    resolvedText?: string | null;
    resolvedAt?: { iso8601: string } | null;
    slackChannelName?: string | null;
    emailRecipients?: string | null;
  };
}

/**
 * Extract actor name from raw actor data
 */
const extractActorName = (actor?: RawTimelineEntry["actor"]): string | undefined => {
  if (!actor) return undefined;
  switch (actor.__typename) {
    case "UserActor":
      return actor.user?.fullName ?? undefined;
    case "CustomerActor":
      return actor.customer?.fullName ?? undefined;
    case "MachineUserActor":
      return actor.machineUser?.fullName ?? undefined;
    default:
      return undefined;
  }
};

/**
 * Parse attachments from raw entry data
 */
const parseAttachments = (
  attachments?: RawTimelineEntry["entry"]["attachments"]
): Attachment[] | undefined => {
  if (!attachments || attachments.length === 0) return undefined;
  return attachments.map((att) => ({
    id: att.id,
    fileName: att.fileName,
    fileSizeKb: att.fileSize?.kiloBytes ?? undefined,
    mimeType: att.fileMimeType ?? undefined,
  }));
};

/**
 * Parse a single timeline entry from GraphQL response
 */
const parseTimelineEntry = (node: RawTimelineEntry): TimelineEntry => {
  const { id, timestamp, actor, entry } = node;
  const baseEntry = {
    id,
    timestamp: timestamp?.iso8601 ?? "",
  };

  switch (entry.__typename) {
    case "NoteEntry":
      return {
        ...baseEntry,
        entryType: "NOTE" as const,
        text: entry.text || entry.markdown || "",  // fallback to markdown if text is empty
        markdown: entry.markdown ?? undefined,
        createdBy: actor ? { name: extractActorName(actor) } : undefined,
      };
    case "EmailEntry":
      return {
        ...baseEntry,
        entryType: "EMAIL" as const,
        subject: entry.subject ?? undefined,
        textContent: entry.markdownContent || entry.textContent || undefined,
        from: entry.from ? { email: entry.from.email, name: entry.from.name ?? undefined } : undefined,
        attachments: parseAttachments(entry.attachments),
      };
    case "ChatEntry":
      return {
        ...baseEntry,
        entryType: "CHAT" as const,
        text: entry.text ?? "",
        createdBy: actor
          ? {
              name: extractActorName(actor),
              type: actor.__typename === "CustomerActor" ? "customer" : "user",
            }
          : undefined,
      };
    case "CustomEntry": {
      // Extract text content from components
      const componentTexts = entry.components
        ?.map((c) => c.text || c.plainText)
        .filter((t): t is string => !!t) ?? [];
      const content = componentTexts.length > 0 ? componentTexts.join("\n") : undefined;

      return {
        ...baseEntry,
        entryType: "CUSTOM" as const,
        title: entry.title ?? undefined,
        externalId: entry.externalId ?? undefined,
        content,
      };
    }
    case "SlackMessageEntry":
      return {
        ...baseEntry,
        entryType: "SLACK" as const,
        text: entry.text ?? "",
        isReply: false,
        slackMessageLink: entry.slackMessageLink ?? undefined,
        attachments: parseAttachments(entry.attachments),
        createdBy: actor ? { name: extractActorName(actor) } : undefined,
      };
    case "SlackReplyEntry":
      return {
        ...baseEntry,
        entryType: "SLACK" as const,
        text: entry.text ?? "",
        isReply: true,
        slackMessageLink: entry.slackMessageLink ?? undefined,
        attachments: parseAttachments(entry.attachments),
        createdBy: actor ? { name: extractActorName(actor) } : undefined,
      };
    case "ThreadDiscussionEntry":
      return {
        ...baseEntry,
        entryType: "DISCUSSION" as const,
        threadDiscussionId: entry.threadDiscussionId ?? "",
        discussionType: entry.discussionType ?? "",
        slackChannelName: entry.slackChannelName ?? undefined,
        slackMessageLink: entry.slackMessageLink ?? undefined,
        emailRecipients: entry.emailRecipients ?? undefined,
      };
    case "ThreadDiscussionMessageEntry":
      return {
        ...baseEntry,
        entryType: "DISCUSSION_MESSAGE" as const,
        threadDiscussionId: entry.threadDiscussionId ?? "",
        threadDiscussionMessageId: entry.threadDiscussionMessageId ?? "",
        discussionType: entry.discussionType ?? "",
        text: entry.resolvedText || entry.text || "",
        slackMessageLink: entry.slackMessageLink ?? undefined,
        attachments: parseAttachments(entry.attachments),
        createdBy: actor ? { name: extractActorName(actor) } : undefined,
      };
    case "ThreadDiscussionResolvedEntry":
      return {
        ...baseEntry,
        entryType: "DISCUSSION_RESOLVED" as const,
        threadDiscussionId: entry.threadDiscussionId ?? "",
        discussionType: entry.discussionType ?? "",
        resolvedAt: entry.resolvedAt?.iso8601 ?? "",
        slackChannelName: entry.slackChannelName ?? undefined,
        slackMessageLink: entry.slackMessageLink ?? undefined,
      };
    default:
      return {
        ...baseEntry,
        entryType: "UNKNOWN" as const,
      };
  }
};

/**
 * List threads with optional filters and pagination
 */
export const listThreads = async (
  input: ListThreadsInput
): Promise<ListThreadsResponse> => {
  const client = getPlainClient();

  // Build status filter
  const statuses = input.statuses
    ?.map(mapStatus)
    .filter((s): s is ThreadStatus => s !== undefined);

  const result = await client.getThreads({
    filters: {
      ...(statuses && statuses.length > 0 ? { statuses } : {}),
      ...(input.customerId ? { customerIds: [input.customerId] } : {}),
      ...(input.labelTypeIds ? { labelTypeIds: input.labelTypeIds } : {}),
    },
    first: input.first ?? 50,
    ...(input.after ? { after: input.after } : {}),
  });

  if (result.error) {
    throw new Error(`Failed to list threads: ${result.error.message}`);
  }

  const threads: ThreadSummary[] = result.data.threads.map((thread) => ({
    id: thread.id,
    title: thread.title ?? undefined,
    status: thread.status,
    priority: thread.priority,
    customer: thread.customer ? extractCustomerInfo(thread.customer) : undefined,
    labels: extractLabels(thread.labels),
    createdAt: thread.createdAt.iso8601,
    updatedAt: thread.updatedAt.iso8601,
  }));

  // Filter by priority if specified (client-side since Plain SDK doesn't support it directly)
  const filteredThreads =
    input.priority !== undefined
      ? threads.filter((t) => t.priority === input.priority)
      : threads;

  // Filter by tenantId if specified (via custom field)
  // Note: This requires fetching thread fields, so we do it client-side
  // For large datasets, consider server-side filtering if Plain adds support
  let finalThreads = filteredThreads;
  if (input.tenantId) {
    const threadsWithTenant = await Promise.all(
      filteredThreads.map(async (thread) => {
        const fields = await getThreadFields({ threadId: thread.id });
        return { thread, tenant: fields.tenant };
      })
    );
    finalThreads = threadsWithTenant
      .filter((t) => t.tenant === input.tenantId)
      .map((t) => t.thread);
  }

  return {
    threads: finalThreads,
    pageInfo: {
      hasNextPage: result.data.pageInfo.hasNextPage,
      hasPreviousPage: result.data.pageInfo.hasPreviousPage,
      startCursor: result.data.pageInfo.startCursor ?? undefined,
      endCursor: result.data.pageInfo.endCursor ?? undefined,
    },
  };
};

/**
 * Raw thread response from GraphQL
 */
interface RawThreadResponse {
  thread: RawThread | null;
}

interface RawThreadByRefResponse {
  threadByRef: RawThread | null;
}

interface RawThread {
  id: string;
  externalId: string | null;
  title: string | null;
  previewText: string | null;
  status: string;
  priority: number;
  customer: {
    id: string;
    fullName: string | null;
    email: { email: string } | null;
    externalId: string | null;
  } | null;
  labels: Array<{ labelType: { id: string; name: string } }>;
  threadFields: Array<{ key: string; stringValue?: string | null; booleanValue?: boolean | null }>;
  createdAt: { iso8601: string };
  updatedAt: { iso8601: string };
  timelineEntries?: {
    edges: Array<{ node: RawTimelineEntry }>;
  };
}

/**
 * Get full thread details by ID
 */
export const getThread = async (
  input: GetThreadInput
): Promise<ThreadDetails> => {
  const client = getPlainClient();

  const result = await client.rawRequest({
    query: THREAD_QUERY,
    variables: { threadId: input.threadId },
  });

  if (result.error) {
    throw new Error(`Failed to get thread: ${result.error.message}`);
  }

  const data = result.data as RawThreadResponse;
  const thread = data.thread;
  if (!thread) {
    throw new Error(`Thread not found: ${input.threadId}`);
  }

  // Parse custom fields
  const customFields = parseThreadFields(thread.threadFields ?? []);

  // Parse timeline entries from the thread response, filtering out autoresponses
  const timeline = thread.timelineEntries?.edges
    .map((edge) => parseTimelineEntry(edge.node))
    .filter((entry) => {
      // Filter out autoresponse entries (CustomEntry with "Autoresponse" in title)
      if (entry.entryType === "CUSTOM" && entry.title?.toLowerCase().includes("autoresponse")) {
        return false;
      }
      return true;
    }) ?? [];

  return {
    id: thread.id,
    title: thread.title ?? undefined,
    description: thread.previewText ?? undefined,
    status: thread.status,
    priority: thread.priority,
    externalId: thread.externalId ?? undefined,
    customer: thread.customer ? extractCustomerInfo(thread.customer) : undefined,
    labels: extractLabels(thread.labels),
    createdAt: thread.createdAt.iso8601,
    updatedAt: thread.updatedAt.iso8601,
    customFields,
    timeline,
  };
};

/**
 * Get full thread details by reference number (e.g., T-510)
 */
export const getThreadByRef = async (
  input: GetThreadByRefInput
): Promise<ThreadDetails> => {
  const client = getPlainClient();

  const result = await client.rawRequest({
    query: THREAD_BY_REF_QUERY,
    variables: { ref: input.ref },
  });

  if (result.error) {
    throw new Error(`Failed to get thread: ${result.error.message}`);
  }

  const data = result.data as RawThreadByRefResponse;
  const thread = data.threadByRef;
  if (!thread) {
    throw new Error(`Thread not found: ${input.ref}`);
  }

  // Parse custom fields
  const customFields = parseThreadFields(thread.threadFields ?? []);

  // Parse timeline entries from the thread response, filtering out autoresponses
  const timeline = thread.timelineEntries?.edges
    .map((edge) => parseTimelineEntry(edge.node))
    .filter((entry) => {
      // Filter out autoresponse entries (CustomEntry with "Autoresponse" in title)
      if (entry.entryType === "CUSTOM" && entry.title?.toLowerCase().includes("autoresponse")) {
        return false;
      }
      return true;
    }) ?? [];

  return {
    id: thread.id,
    title: thread.title ?? undefined,
    description: thread.previewText ?? undefined,
    status: thread.status,
    priority: thread.priority,
    externalId: thread.externalId ?? undefined,
    customer: thread.customer ? extractCustomerInfo(thread.customer) : undefined,
    labels: extractLabels(thread.labels),
    createdAt: thread.createdAt.iso8601,
    updatedAt: thread.updatedAt.iso8601,
    customFields,
    timeline,
  };
};

/**
 * Get just the custom fields for a thread
 */
export const getThreadFields = async (
  input: GetThreadFieldsInput
): Promise<ThreadCustomFields> => {
  const client = getPlainClient();

  const result = await client.getThread({ threadId: input.threadId });

  if (result.error) {
    throw new Error(`Failed to get thread fields: ${result.error.message}`);
  }

  const thread = result.data;
  if (!thread) {
    throw new Error(`Thread not found: ${input.threadId}`);
  }

  return parseThreadFields(thread.threadFields ?? []);
};

/**
 * GraphQL mutation for creating an attachment download URL
 */
const CREATE_ATTACHMENT_DOWNLOAD_URL_MUTATION = `
  mutation CreateAttachmentDownloadUrl($input: CreateAttachmentDownloadUrlInput!) {
    createAttachmentDownloadUrl(input: $input) {
      attachmentDownloadUrl {
        downloadUrl
        expiresAt { iso8601 }
      }
      error {
        message
        type
        code
      }
    }
  }
`;

/**
 * Raw response from attachment download URL mutation
 */
interface RawAttachmentDownloadUrlResponse {
  createAttachmentDownloadUrl: {
    attachmentDownloadUrl?: {
      downloadUrl: string;
      expiresAt: { iso8601: string };
    } | null;
    error?: {
      message: string;
      type: string;
      code: string;
    } | null;
  };
}

/**
 * Get a temporary download URL for an attachment
 */
export const getAttachmentDownloadUrl = async (
  input: GetAttachmentDownloadUrlInput
): Promise<AttachmentDownloadUrlResponse> => {
  const client = getPlainClient();

  const result = await client.rawRequest({
    query: CREATE_ATTACHMENT_DOWNLOAD_URL_MUTATION,
    variables: { input: { attachmentId: input.attachmentId } },
  });

  if (result.error) {
    throw new Error(`Failed to get attachment download URL: ${result.error.message}`);
  }

  const data = result.data as RawAttachmentDownloadUrlResponse;
  const response = data.createAttachmentDownloadUrl;

  if (response.error) {
    throw new Error(`Failed to get attachment download URL: ${response.error.message}`);
  }

  if (!response.attachmentDownloadUrl) {
    throw new Error("No download URL returned");
  }

  return {
    downloadUrl: response.attachmentDownloadUrl.downloadUrl,
    expiresAt: response.attachmentDownloadUrl.expiresAt.iso8601,
  };
};

/**
 * Check if a MIME type represents text content
 */
const isTextMimeType = (mimeType?: string): boolean => {
  if (!mimeType) return false;

  // Text types
  if (mimeType.startsWith("text/")) return true;

  // Common text-based application types
  const textApplicationTypes = [
    "application/json",
    "application/xml",
    "application/javascript",
    "application/typescript",
    "application/x-yaml",
    "application/yaml",
    "application/x-sh",
    "application/x-python",
    "application/sql",
    "application/graphql",
    "application/ld+json",
    "application/manifest+json",
  ];

  return textApplicationTypes.includes(mimeType);
};

/**
 * Get attachment content by fetching the download URL and returning the content
 */
export const getAttachmentContent = async (
  input: GetAttachmentContentInput
): Promise<AttachmentContentResponse> => {
  // First get the download URL
  const { downloadUrl } = await getAttachmentDownloadUrl({ attachmentId: input.attachmentId });

  // Fetch the content
  const response = await fetch(downloadUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch attachment content: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || undefined;
  const isText = isTextMimeType(contentType);

  if (isText) {
    const text = await response.text();
    return {
      content: text,
      mimeType: contentType,
      encoding: "text",
    };
  } else {
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return {
      content: base64,
      mimeType: contentType,
      encoding: "base64",
    };
  }
};

/**
 * Reply to a thread. The reply is sent through the original channel (email, Slack, chat).
 */
export const replyToThread = async (
  input: ReplyToThreadInput
): Promise<{ success: true }> => {
  const client = getPlainClient();

  const result = await client.replyToThread({
    threadId: input.threadId,
    textContent: input.textContent,
    ...(input.markdownContent ? { markdownContent: input.markdownContent } : {}),
  });

  if (result.error) {
    throw new Error(`Failed to reply to thread: ${result.error.message}`);
  }

  return { success: true };
};

/**
 * Mark a thread as done/resolved.
 */
export const markThreadAsDone = async (
  input: MarkThreadAsDoneInput
): Promise<{ threadId: string; status: string }> => {
  const client = getPlainClient();

  const result = await client.markThreadAsDone({
    threadId: input.threadId,
  });

  if (result.error) {
    throw new Error(`Failed to mark thread as done: ${result.error.message}`);
  }

  return {
    threadId: result.data.id,
    status: result.data.status,
  };
};

/**
 * GraphQL mutation for upserting a thread field
 */
const UPSERT_THREAD_FIELD_MUTATION = `
  mutation UpsertThreadField($input: UpsertThreadFieldInput!) {
    upsertThreadField(input: $input) {
      threadField {
        key
        stringValue
        booleanValue
      }
      error {
        message
        type
        code
      }
    }
  }
`;

/**
 * Raw response from upsert thread field mutation
 */
interface RawUpsertThreadFieldResponse {
  upsertThreadField: {
    threadField?: {
      key: string;
      stringValue?: string | null;
      booleanValue?: boolean | null;
    } | null;
    error?: {
      message: string;
      type: string;
      code: string;
    } | null;
  };
}

// Boolean field keys that use booleanValue instead of stringValue
const BOOLEAN_FIELD_KEYS = new Set(["request_feature"]);

/**
 * Set or update a custom field value on a thread.
 * Uses Plain's upsertThreadField GraphQL mutation.
 */
export const upsertThreadField = async (
  input: UpsertThreadFieldInput
): Promise<{ success: true; key: string; value: string }> => {
  const client = getPlainClient();

  const isBoolean = BOOLEAN_FIELD_KEYS.has(input.key);
  const threadField = isBoolean
    ? { key: input.key, booleanValue: input.value === "true" }
    : { key: input.key, stringValue: input.value };

  const result = await client.rawRequest({
    query: UPSERT_THREAD_FIELD_MUTATION,
    variables: { input: { threadId: input.threadId, threadField } },
  });

  if (result.error) {
    throw new Error(`Failed to upsert thread field: ${result.error.message}`);
  }

  const data = result.data as RawUpsertThreadFieldResponse;
  const response = data.upsertThreadField;

  if (response.error) {
    throw new Error(`Failed to upsert thread field: ${response.error.message}`);
  }

  return { success: true, key: input.key, value: input.value };
};

/**
 * GraphQL mutation for creating an internal note on a thread
 */
const CREATE_NOTE_MUTATION = `
  mutation CreateNote($input: CreateNoteInput!) {
    createNote(input: $input) {
      note {
        id
      }
      error {
        message
        type
        code
      }
    }
  }
`;

/**
 * Raw response from create note mutation
 */
interface RawCreateNoteResponse {
  createNote: {
    note?: {
      id: string;
    } | null;
    error?: {
      message: string;
      type: string;
      code: string;
    } | null;
  };
}

/**
 * Post an internal note on a thread. Internal notes are visible to the
 * support team only and are NOT sent to the customer.
 */
export const addInternalNote = async (
  input: AddInternalNoteInput
): Promise<{ success: true; noteId: string }> => {
  const client = getPlainClient();

  const result = await client.rawRequest({
    query: CREATE_NOTE_MUTATION,
    variables: { input: { threadId: input.threadId, markdown: input.markdown } },
  });

  if (result.error) {
    throw new Error(`Failed to add internal note: ${result.error.message}`);
  }

  const data = result.data as RawCreateNoteResponse;
  const response = data.createNote;

  if (response.error) {
    throw new Error(`Failed to add internal note: ${response.error.message}`);
  }

  if (!response.note) {
    throw new Error("No note returned from createNote mutation");
  }

  return { success: true, noteId: response.note.id };
};

/**
 * Add labels to a thread by label type IDs.
 * Use getLabelTypes first to discover available label type IDs.
 */
export const addLabelsToThread = async (
  input: AddLabelsInput
): Promise<{ success: true; labelCount: number }> => {
  const client = getPlainClient();

  const result = await client.addLabels({
    threadId: input.threadId,
    labelTypeIds: input.labelTypeIds,
  });

  if (result.error) {
    throw new Error(`Failed to add labels: ${result.error.message}`);
  }

  return { success: true, labelCount: input.labelTypeIds.length };
};

/**
 * Get available label types for the workspace.
 * Returns a filtered list with id, name, and isArchived for each label type.
 */
export const getLabelTypes = async (
  input: GetLabelTypesInput
): Promise<{ labelTypes: Array<{ id: string; name: string; isArchived: boolean }> }> => {
  const client = getPlainClient();

  const result = await client.getLabelTypes({
    first: input.first ?? 50,
  });

  if (result.error) {
    throw new Error(`Failed to get label types: ${result.error.message}`);
  }

  return {
    labelTypes: result.data.labelTypes.map((lt) => ({
      id: lt.id,
      name: lt.name,
      isArchived: lt.isArchived,
    })),
  };
};

/**
 * Format a Plain SDK error into a detailed error message,
 * including field-level validation details when available.
 */
const formatPlainError = (error: { message: string; type?: string; code?: string; fields?: Array<{ field: string; message: string; type: string }> }): string => {
  let msg = error.message;
  if (error.type) msg += ` [${error.type}]`;
  if (error.code) msg += ` (code: ${error.code})`;
  if (error.fields && error.fields.length > 0) {
    const fieldDetails = error.fields.map((f) => `  - ${f.field}: ${f.message} (${f.type})`).join("\n");
    msg += `\nField errors:\n${fieldDetails}`;
  }
  return msg;
};

/**
 * Upsert a customer in Plain by email, returning the customer ID.
 * If the customer already exists, returns them unchanged.
 */
const upsertCustomerByEmail = async (
  email: string,
  fullName?: string,
  externalId?: string,
): Promise<string> => {
  const client = getPlainClient();

  const result = await client.upsertCustomer({
    identifier: { emailAddress: email },
    onCreate: {
      email: { email, isVerified: true },
      fullName: fullName ?? email,
      ...(externalId ? { externalId } : {}),
    },
    onUpdate: {
      ...(fullName ? { fullName: { value: fullName } } : {}),
      ...(externalId ? { externalId: { value: externalId } } : {}),
    },
  });

  if (result.error) {
    throw new Error(`Failed to upsert customer: ${formatPlainError(result.error)}`);
  }

  return result.data.customer.id;
};

/**
 * Create a new thread for a customer.
 * When customerEmail is provided, the customer is automatically upserted
 * (created if they don't exist, found if they do) before thread creation.
 */
export const createThread = async (
  input: CreateThreadInput
): Promise<CreateThreadResponse> => {
  const client = getPlainClient();

  // Build customer identifier — exactly one must be provided
  const identifierCount = [input.customerEmail, input.customerId, input.customerExternalId].filter(Boolean).length;
  if (identifierCount === 0) {
    throw new Error("Provide at least one of customerEmail, customerId, or customerExternalId");
  }
  if (identifierCount > 1) {
    throw new Error("Provide only one of customerEmail, customerId, or customerExternalId");
  }

  // When using email, upsert the customer first to ensure they exist
  let customerIdentifier: { customerId: string } | { emailAddress: string } | { externalId: string };
  if (input.customerEmail) {
    const customerId = await upsertCustomerByEmail(
      input.customerEmail,
      input.customerFullName,
      input.customerExternalId,
    );
    customerIdentifier = { customerId };
  } else if (input.customerId) {
    customerIdentifier = { customerId: input.customerId };
  } else {
    customerIdentifier = { externalId: input.customerExternalId! };
  }

  // Build thread fields from custom field inputs
  const threadFields: Array<{ key: string; stringValue?: string; booleanValue?: boolean; type: ThreadFieldSchemaType }> = [];

  const stringFieldMap: Array<[string, string | undefined, ThreadFieldSchemaType]> = [
    ["app", input.app, ThreadFieldSchemaType.String],
    ["tenant_id", input.tenantId, ThreadFieldSchemaType.String],
    ["stage", input.stage, ThreadFieldSchemaType.String],
    ["reported_from", input.reportedFrom, ThreadFieldSchemaType.String],
    ["posthog_session", input.posthogSession, ThreadFieldSchemaType.String],
    ["sentry_session", input.sentrySession, ThreadFieldSchemaType.String],
    ["notion_ticket", input.notionTicket, ThreadFieldSchemaType.String],
    ["github_pr", input.githubPr, ThreadFieldSchemaType.String],
    ["impact_level", input.impactLevel, ThreadFieldSchemaType.Enum],
  ];

  for (const [key, value, type] of stringFieldMap) {
    if (value !== undefined) {
      threadFields.push({ key, stringValue: value, type });
    }
  }

  if (input.requestFeature !== undefined) {
    threadFields.push({
      key: "request_feature",
      booleanValue: input.requestFeature,
      type: ThreadFieldSchemaType.Bool,
    });
  }

  const result = await client.createThread({
    customerIdentifier,
    title: input.title ?? undefined,
    description: input.description ?? undefined,
    components: [{ componentText: { text: input.markdown } }],
    ...(input.priority !== undefined ? { priority: input.priority } : {}),
    ...(input.labelTypeIds ? { labelTypeIds: input.labelTypeIds } : {}),
    ...(input.externalId ? { externalId: input.externalId } : {}),
    ...(threadFields.length > 0 ? { threadFields } : {}),
  });

  if (result.error) {
    throw new Error(`Failed to create thread: ${formatPlainError(result.error)}`);
  }

  return {
    threadId: result.data.id,
    title: result.data.title ?? undefined,
    status: result.data.status,
    priority: result.data.priority,
  };
};
