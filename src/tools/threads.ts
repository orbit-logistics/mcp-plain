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
  type UpdateThreadFieldsInput,
  type UpdateThreadPriorityInput,
  type UpdateThreadLabelsInput,
  type AddInternalNoteInput,
  type AddLabelsInput,
  type GetLabelTypesInput,
  type LinkThreadsInput,
  type GetThreadLinksInput,
  type UnlinkThreadInput,
  type ThreadLinkInfo,
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
 * Shared attachment selection. Every entry type that can carry attachments
 * selects this identical shape so the GraphQL field-merge rules are satisfied
 * and parseAttachments() can read every entry uniformly.
 */
const ATTACHMENT_FIELDS = `
  attachments {
    id
    fileName
    fileSize { kiloBytes }
    fileMimeType
  }
`;

/**
 * Shared selection of a thread link. ThreadLink is a GraphQL interface, so the
 * common fields are selected directly and each concrete type adds its own ids
 * through an inline fragment.
 */
const THREAD_LINK_FIELDS = `
  __typename
  id
  threadId
  title
  url
  status
  sourceType
  sourceId
  description
  createdAt { iso8601 }
  updatedAt { iso8601 }
  ... on PlainThreadThreadLink {
    plainThreadId
  }
  ... on LinearIssueThreadLink {
    linearIssueId
    linearIssueIdentifier
  }
  ... on JiraIssueThreadLink {
    jiraIssueId
    jiraIssueKey
  }
`;

/**
 * Links selection embedded in the thread reads. Capped at 25 because a thread
 * usually carries a handful of links; use get_thread_links with `first` when
 * more are needed.
 */
const THREAD_LINKS_SELECTION = `
  links(first: 25) {
    edges {
      node {
        ${THREAD_LINK_FIELDS}
      }
    }
  }
`;

/**
 * Shared selection set for a thread and its timeline. Used by both the
 * by-id and by-ref queries so the two can never drift (a past source of
 * missing fields). The only difference between the two queries is the root
 * field, so everything below the root is defined once here.
 *
 * Notes on entry coverage:
 * - NoteEntry selects `attachments` — internal notes routinely carry uploaded
 *   files (e.g. screenshots) and the attachment id is required to feed
 *   get_attachment_content. Without this, notes came back with no attachment.
 * - ChatEntry / MSTeamsMessageEntry / DiscordMessageEntry are the inbound
 *   "original message" entries for the chat, MS Teams and Discord channels.
 *   Without their fragments they fell through to the UNKNOWN branch with no
 *   payload, so their attachments were unreachable.
 * - ChatEntry.text is nullable (String) while the Slack/Teams text fields are
 *   non-null (String!). GraphQL refuses to merge same-named fields of differing
 *   nullability across fragments, so ChatEntry's text is aliased to `chatText`.
 */
const THREAD_TIMELINE_SELECTION = `
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
    id
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
  ${THREAD_LINKS_SELECTION}
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
            ${ATTACHMENT_FIELDS}
          }
          ... on ChatEntry {
            chatText: text
            ${ATTACHMENT_FIELDS}
          }
          ... on EmailEntry {
            subject
            markdownContent
            from { email name }
            ${ATTACHMENT_FIELDS}
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
            ${ATTACHMENT_FIELDS}
          }
          ... on SlackMessageEntry {
            text
            slackMessageLink
            ${ATTACHMENT_FIELDS}
          }
          ... on SlackReplyEntry {
            text
            slackMessageLink
            ${ATTACHMENT_FIELDS}
          }
          ... on MSTeamsMessageEntry {
            text
            markdownContent
            msTeamsMessageLink
            ${ATTACHMENT_FIELDS}
          }
          ... on DiscordMessageEntry {
            markdownContent
            discordMessageLink
            ${ATTACHMENT_FIELDS}
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
            ${ATTACHMENT_FIELDS}
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
`;

/**
 * GraphQL query for fetching a thread by ID with timeline entries
 */
const THREAD_QUERY = `
  query GetThread($threadId: ID!) {
    thread(threadId: $threadId) {
      ${THREAD_TIMELINE_SELECTION}
    }
  }
`;

/**
 * GraphQL query for fetching a thread by reference with timeline entries
 */
const THREAD_BY_REF_QUERY = `
  query GetThreadByRef($ref: String!) {
    threadByRef(ref: $ref) {
      ${THREAD_TIMELINE_SELECTION}
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
 * Build a raw key-indexed view of every custom field on the thread, regardless
 * of whether it's in FIELD_KEY_MAP. Lets callers read fields the typed shape
 * doesn't model (e.g. agent_readiness before it was added to the map).
 */
const parseThreadFieldsRaw = (
  fields: Array<{ key: string; stringValue?: string | null; booleanValue?: boolean | null }>
): Record<string, string | boolean> => {
  const result: Record<string, string | boolean> = {};
  for (const field of fields) {
    if (field.booleanValue !== null && field.booleanValue !== undefined) {
      result[field.key] = field.booleanValue;
    } else if (field.stringValue !== null && field.stringValue !== undefined) {
      result[field.key] = field.stringValue;
    }
  }
  return result;
};

/**
 * Format a Plain SDK error with details from graphqlErrors and requestId so
 * callers see actionable info (field-level codes, path, request ID) instead of
 * a generic "Malformed query" message.
 */
const formatPlainError = (error: unknown): string => {
  if (!error || typeof error !== "object") {
    return String(error);
  }
  const e = error as {
    type?: string;
    code?: string;
    message?: string;
    requestId?: string;
    graphqlErrors?: Array<{
      message: string;
      path?: ReadonlyArray<string | number>;
      extensions?: { code?: string };
    }>;
    fields?: Array<{ field: string; type: string; message?: string }>;
    errorDetails?: { message?: string; fields?: Array<{ field: string; type: string; message?: string }> };
  };
  const parts: string[] = [];
  if (e.message) parts.push(e.message);
  if (e.type) parts.push(`type=${e.type}`);
  if (e.code) parts.push(`code=${e.code}`);
  if (e.graphqlErrors?.length) {
    const details = e.graphqlErrors
      .map((g) => {
        const path = g.path?.length ? g.path.join(".") : undefined;
        const code = g.extensions?.code;
        const tags = [path && `path=${path}`, code && `code=${code}`].filter(Boolean).join(", ");
        return tags ? `${g.message} (${tags})` : g.message;
      })
      .join("; ");
    parts.push(`graphqlErrors: ${details}`);
  }
  const fieldErrors = e.fields ?? e.errorDetails?.fields;
  if (fieldErrors?.length) {
    const fields = fieldErrors
      .map((f) => `${f.field}: ${f.type}${f.message ? ` (${f.message})` : ""}`)
      .join("; ");
    parts.push(`fields: ${fields}`);
  }
  if (e.requestId) parts.push(`requestId=${e.requestId}`);
  return parts.length > 0 ? parts.join(" | ") : "unknown error";
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
  labels: Array<{ id?: string; labelType: { id: string; name: string } }>
): ThreadLabel[] =>
  labels.map((l) => ({
    id: l.labelType.id,
    labelId: l.id,
    name: l.labelType.name,
  }));

/**
 * Raw thread link from GraphQL response
 */
interface RawThreadLink {
  __typename: string;
  id: string;
  threadId: string;
  title: string;
  url: string;
  status: string;
  sourceType: string;
  sourceId: string;
  description?: string | null;
  createdAt?: { iso8601: string } | null;
  updatedAt?: { iso8601: string } | null;
  plainThreadId?: string | null;
  linearIssueId?: string | null;
  linearIssueIdentifier?: string | null;
  jiraIssueId?: string | null;
  jiraIssueKey?: string | null;
}

/**
 * Parse a single thread link. `linkedThreadId` is only set for links pointing
 * at another Plain thread.
 *
 * A thread-to-thread link is a single record that both threads show. It is
 * owned by the thread it was created on (`ownerThreadId`) and points at
 * `linkedThreadId`. Read from the far end, `linkedThreadId` is the thread you
 * are reading and `ownerThreadId` is the other end, so callers resolving "the
 * other thread" must compare both against the thread they asked for.
 */
const parseThreadLink = (link: RawThreadLink): ThreadLinkInfo => ({
  id: link.id,
  type: link.__typename,
  ownerThreadId: link.threadId,
  title: link.title,
  url: link.url,
  status: link.status,
  sourceType: link.sourceType,
  sourceId: link.sourceId,
  description: link.description ?? undefined,
  linkedThreadId: link.plainThreadId ?? undefined,
  linearIssueId: link.linearIssueId ?? undefined,
  linearIssueIdentifier: link.linearIssueIdentifier ?? undefined,
  jiraIssueId: link.jiraIssueId ?? undefined,
  jiraIssueKey: link.jiraIssueKey ?? undefined,
  createdAt: link.createdAt?.iso8601 ?? "",
  updatedAt: link.updatedAt?.iso8601 ?? "",
});

const parseThreadLinks = (
  links?: { edges?: Array<{ node: RawThreadLink }> } | null
): ThreadLinkInfo[] => (links?.edges ?? []).map((edge) => parseThreadLink(edge.node));

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
    // ChatEntry.text is aliased to chatText in the query because its nullable
    // String type can't be merged with the non-null Slack/Teams text fields.
    chatText?: string | null;
    markdown?: string | null;
    subject?: string | null;
    textContent?: string | null;
    markdownContent?: string | null;
    title?: string | null;
    externalId?: string | null;
    from?: { email: string; name?: string | null } | null;
    slackMessageLink?: string | null;
    msTeamsMessageLink?: string | null;
    discordMessageLink?: string | null;
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
        attachments: parseAttachments(entry.attachments),
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
        text: entry.chatText ?? entry.text ?? "",
        attachments: parseAttachments(entry.attachments),
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
        attachments: parseAttachments(entry.attachments),
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
    case "MSTeamsMessageEntry":
      return {
        ...baseEntry,
        entryType: "MS_TEAMS" as const,
        text: entry.markdownContent || entry.text || "",
        messageLink: entry.msTeamsMessageLink ?? undefined,
        attachments: parseAttachments(entry.attachments),
        createdBy: actor ? { name: extractActorName(actor) } : undefined,
      };
    case "DiscordMessageEntry":
      return {
        ...baseEntry,
        entryType: "DISCORD" as const,
        text: entry.markdownContent ?? "",
        messageLink: entry.discordMessageLink ?? undefined,
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
    throw new Error(`Failed to list threads: ${formatPlainError(result.error)}`);
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
  labels: Array<{ id?: string; labelType: { id: string; name: string } }>;
  threadFields: Array<{ key: string; stringValue?: string | null; booleanValue?: boolean | null }>;
  links?: { edges?: Array<{ node: RawThreadLink }> } | null;
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
    throw new Error(`Failed to get thread: ${formatPlainError(result.error)}`);
  }

  const data = result.data as RawThreadResponse;
  const thread = data.thread;
  if (!thread) {
    throw new Error(`Thread not found: ${input.threadId}`);
  }

  // Parse custom fields (typed + raw passthrough)
  const customFields = parseThreadFields(thread.threadFields ?? []);
  const customFieldsRaw = parseThreadFieldsRaw(thread.threadFields ?? []);

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
    customFieldsRaw,
    links: parseThreadLinks(thread.links),
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
    throw new Error(`Failed to get thread: ${formatPlainError(result.error)}`);
  }

  const data = result.data as RawThreadByRefResponse;
  const thread = data.threadByRef;
  if (!thread) {
    throw new Error(`Thread not found: ${input.ref}`);
  }

  // Parse custom fields (typed + raw passthrough)
  const customFields = parseThreadFields(thread.threadFields ?? []);
  const customFieldsRaw = parseThreadFieldsRaw(thread.threadFields ?? []);

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
    customFieldsRaw,
    links: parseThreadLinks(thread.links),
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
    throw new Error(`Failed to get thread fields: ${formatPlainError(result.error)}`);
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
    throw new Error(`Failed to get attachment download URL: ${formatPlainError(result.error)}`);
  }

  const data = result.data as RawAttachmentDownloadUrlResponse;
  const response = data.createAttachmentDownloadUrl;

  if (response.error) {
    throw new Error(`Failed to get attachment download URL: ${formatPlainError(response.error)}`);
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
    throw new Error(`Failed to reply to thread: ${formatPlainError(result.error)}`);
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
    throw new Error(`Failed to mark thread as done: ${formatPlainError(result.error)}`);
  }

  return {
    threadId: result.data.id,
    status: result.data.status,
  };
};

/**
 * GraphQL mutation for upserting a thread field.
 *
 * Plain's current schema requires:
 *   input: {
 *     identifier: { threadId, key },
 *     type: BOOL | ENUM | STRING,
 *     stringValue? | booleanValue?,
 *   }
 *
 * Earlier versions of this server sent a flat `{ threadId, threadField }`
 * shape which the API now rejects with "Malformed query, missing or invalid
 * arguments provided."
 */
const UPSERT_THREAD_FIELD_MUTATION = `
  mutation UpsertThreadField($input: UpsertThreadFieldInput!) {
    upsertThreadField(input: $input) {
      result
      threadField {
        id
        key
        type
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

interface RawUpsertThreadFieldResponse {
  upsertThreadField: {
    result?: string | null;
    threadField?: {
      id: string;
      key: string;
      type: string;
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

// Boolean field keys that should be sent as type=BOOL with booleanValue.
const BOOLEAN_FIELD_KEYS = new Set(["request_feature"]);

// Enum field keys that must be sent as type=ENUM. Plain's schema rejects
// STRING writes against ENUM-typed fields, so this mapping prevents that
// silent failure mode.
const ENUM_FIELD_KEYS = new Set(["agent_readiness", "impact_level"]);

type ThreadFieldType = "BOOL" | "ENUM" | "STRING";

const inferFieldType = (key: string, override?: string): ThreadFieldType => {
  if (override === "BOOL" || override === "ENUM" || override === "STRING") {
    return override;
  }
  if (BOOLEAN_FIELD_KEYS.has(key)) return "BOOL";
  if (ENUM_FIELD_KEYS.has(key)) return "ENUM";
  return "STRING";
};

interface FieldWriteResult {
  key: string;
  value: string;
  type: ThreadFieldType;
  result?: string;
}

/**
 * Write a single custom field via Plain's upsertThreadField mutation. Shared by
 * the single-field upsert_thread_field tool and the batch update_thread_fields
 * tool. Throws with a formatted error on failure.
 */
const upsertOneField = async (
  client: ReturnType<typeof getPlainClient>,
  threadId: string,
  key: string,
  value: string,
  typeOverride?: string
): Promise<FieldWriteResult> => {
  const type = inferFieldType(key, typeOverride);
  const valueField =
    type === "BOOL" ? { booleanValue: value === "true" } : { stringValue: value };

  const result = await client.rawRequest({
    query: UPSERT_THREAD_FIELD_MUTATION,
    variables: {
      input: {
        identifier: { threadId, key },
        type,
        ...valueField,
      },
    },
  });

  if (result.error) {
    throw new Error(`Failed to upsert thread field '${key}': ${formatPlainError(result.error)}`);
  }

  const data = result.data as RawUpsertThreadFieldResponse;
  const response = data.upsertThreadField;

  if (response.error) {
    throw new Error(`Failed to upsert thread field '${key}': ${formatPlainError(response.error)}`);
  }

  return { key, value, type, result: response.result ?? undefined };
};

/**
 * Set or update a single custom field value on a thread.
 * Uses Plain's upsertThreadField GraphQL mutation.
 */
export const upsertThreadField = async (
  input: UpsertThreadFieldInput
): Promise<{ success: true } & FieldWriteResult> => {
  const client = getPlainClient();
  const written = await upsertOneField(client, input.threadId, input.key, input.value, input.type);
  return { success: true, ...written };
};

/**
 * Set or update multiple custom fields on a thread in one call. Each key must
 * be allowlisted (present in FIELD_KEY_MAP); unknown keys are rejected before
 * any write happens so the call is all-or-nothing on validation. Writes are
 * applied sequentially (Plain has no batch field mutation).
 */
export const updateThreadFields = async (
  input: UpdateThreadFieldsInput
): Promise<{ success: true; updated: FieldWriteResult[] }> => {
  const client = getPlainClient();

  const unknown = input.fields.map((f) => f.key).filter((k) => !(k in FIELD_KEY_MAP));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown custom field key(s): ${unknown.join(", ")}. Allowed keys: ${Object.keys(FIELD_KEY_MAP).join(", ")}.`
    );
  }

  const updated: FieldWriteResult[] = [];
  for (const field of input.fields) {
    updated.push(await upsertOneField(client, input.threadId, field.key, field.value, field.type));
  }

  return { success: true, updated };
};

/**
 * Set a thread's priority (0 = Urgent, 1 = High, 2 = Normal, 3 = Low).
 */
export const updateThreadPriority = async (
  input: UpdateThreadPriorityInput
): Promise<{ success: true; threadId: string; priority: number }> => {
  const client = getPlainClient();

  const result = await client.changeThreadPriority({
    threadId: input.threadId,
    priority: input.priority,
  });

  if (result.error) {
    throw new Error(`Failed to update thread priority: ${formatPlainError(result.error)}`);
  }

  return { success: true, threadId: input.threadId, priority: input.priority };
};

const THREAD_LABELS_QUERY = `
  query GetThreadLabels($threadId: ID!) {
    thread(threadId: $threadId) {
      labels {
        id
        labelType { id }
      }
    }
  }
`;

/**
 * Add and/or remove labels on a thread. `add` and `remove` both take label
 * TYPE ids. Removal resolves each type id to the applied label's instance id
 * (via a thread read) because Plain's removeLabels mutation operates on label
 * instance ids, not type ids. Type ids not currently applied are ignored.
 */
export const updateThreadLabels = async (
  input: UpdateThreadLabelsInput
): Promise<{ success: true; added: number; removed: number }> => {
  const client = getPlainClient();

  let added = 0;
  let removed = 0;

  if (input.add && input.add.length > 0) {
    const addResult = await client.addLabels({
      threadId: input.threadId,
      labelTypeIds: input.add,
    });
    if (addResult.error) {
      throw new Error(`Failed to add labels: ${formatPlainError(addResult.error)}`);
    }
    added = input.add.length;
  }

  if (input.remove && input.remove.length > 0) {
    const lookup = await client.rawRequest({
      query: THREAD_LABELS_QUERY,
      variables: { threadId: input.threadId },
    });
    if (lookup.error) {
      throw new Error(`Failed to look up thread labels: ${formatPlainError(lookup.error)}`);
    }
    const lookupData = lookup.data as {
      thread?: { labels?: Array<{ id: string; labelType: { id: string } }> } | null;
    };
    const removeSet = new Set(input.remove);
    const labelIds = (lookupData.thread?.labels ?? [])
      .filter((l) => removeSet.has(l.labelType.id))
      .map((l) => l.id);

    if (labelIds.length > 0) {
      const removeResult = await client.removeLabels({ labelIds });
      if (removeResult.error) {
        throw new Error(`Failed to remove labels: ${formatPlainError(removeResult.error)}`);
      }
      removed = labelIds.length;
    }
  }

  return { success: true, added, removed };
};

const THREAD_ID_BY_REF_QUERY = `
  query GetThreadIdByRef($ref: String!) {
    threadByRef(ref: $ref) {
      id
    }
  }
`;

/**
 * Resolve a thread to its id. Callers may pass the id directly or a human
 * reference like "T-510", which is what the Plain UI shows. Exactly one of the
 * two must be given.
 */
const resolveThreadId = async (
  client: ReturnType<typeof getPlainClient>,
  threadId: string | undefined,
  ref: string | undefined,
  label: string
): Promise<string> => {
  if (threadId && ref) {
    throw new Error(`Provide only one of ${label}Id or ${label}Ref.`);
  }
  if (threadId) return threadId;
  if (!ref) {
    throw new Error(`Provide ${label}Id or ${label}Ref.`);
  }

  const result = await client.rawRequest({
    query: THREAD_ID_BY_REF_QUERY,
    variables: { ref },
  });

  if (result.error) {
    throw new Error(`Failed to resolve thread ${ref}: ${formatPlainError(result.error)}`);
  }

  const data = result.data as { threadByRef?: { id: string } | null };
  const id = data.threadByRef?.id;
  if (!id) {
    throw new Error(`Thread not found: ${ref}`);
  }
  return id;
};

const CREATE_THREAD_LINK_MUTATION = `
  mutation CreateThreadLink($input: CreateThreadLinkInput!) {
    createThreadLink(input: $input) {
      threadLink {
        ${THREAD_LINK_FIELDS}
      }
      error {
        message
        type
        code
      }
    }
  }
`;

const DELETE_THREAD_LINK_MUTATION = `
  mutation DeleteThreadLink($input: DeleteThreadLinkInput!) {
    deleteThreadLink(input: $input) {
      error {
        message
        type
        code
      }
    }
  }
`;

const THREAD_LINKS_QUERY = `
  query GetThreadLinks($threadId: ID!, $first: Int!) {
    thread(threadId: $threadId) {
      id
      links(first: $first) {
        edges {
          node {
            ${THREAD_LINK_FIELDS}
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

/**
 * Link a thread to another Plain thread, a Linear issue, a Jira issue, or a
 * generic external resource. The link is created on the thread named by
 * threadId/threadRef and points at the target.
 *
 * Exactly one target kind must be given. Linear needs both its id and url;
 * a generic link needs both sourceType and sourceId (the source type must be
 * configured in the Plain workspace).
 */
export const linkThreads = async (
  input: LinkThreadsInput
): Promise<{ success: true; threadId: string; threadLink: ThreadLinkInfo }> => {
  const client = getPlainClient();

  const threadId = await resolveThreadId(client, input.threadId, input.threadRef, "thread");

  const hasPlainTarget = Boolean(input.linkedThreadId || input.linkedThreadRef);
  const hasLinearTarget = Boolean(input.linearIssueId || input.linearIssueUrl);
  const hasJiraTarget = Boolean(input.jiraIssueId);
  const hasGenericTarget = Boolean(input.sourceType || input.sourceId);

  const targetCount = [hasPlainTarget, hasLinearTarget, hasJiraTarget, hasGenericTarget].filter(
    Boolean
  ).length;
  if (targetCount === 0) {
    throw new Error(
      "Provide a link target: linkedThreadId/linkedThreadRef, linearIssueId + linearIssueUrl, jiraIssueId, or sourceType + sourceId."
    );
  }
  if (targetCount > 1) {
    throw new Error("Provide only one link target per call.");
  }

  let target: Record<string, unknown>;
  if (hasPlainTarget) {
    const plainThreadId = await resolveThreadId(
      client,
      input.linkedThreadId,
      input.linkedThreadRef,
      "linkedThread"
    );
    if (plainThreadId === threadId) {
      throw new Error("A thread cannot be linked to itself.");
    }
    target = { plainThread: { plainThreadId } };
  } else if (hasLinearTarget) {
    if (!input.linearIssueId || !input.linearIssueUrl) {
      throw new Error("Linear links need both linearIssueId and linearIssueUrl.");
    }
    target = {
      linearIssue: { linearIssueId: input.linearIssueId, linearIssueUrl: input.linearIssueUrl },
    };
  } else if (hasJiraTarget) {
    target = { jiraIssue: { jiraIssueId: input.jiraIssueId } };
  } else {
    if (!input.sourceType || !input.sourceId) {
      throw new Error("Generic links need both sourceType and sourceId.");
    }
    target = { sourceType: input.sourceType, sourceId: input.sourceId };
  }

  const result = await client.rawRequest({
    query: CREATE_THREAD_LINK_MUTATION,
    variables: { input: { threadId, ...target } },
  });

  if (result.error) {
    throw new Error(`Failed to link thread: ${formatPlainError(result.error)}`);
  }

  const data = result.data as {
    createThreadLink: {
      threadLink?: RawThreadLink | null;
      error?: { message: string; type: string; code: string } | null;
    };
  };
  const response = data.createThreadLink;

  if (response.error) {
    throw new Error(`Failed to link thread: ${formatPlainError(response.error)}`);
  }
  if (!response.threadLink) {
    throw new Error("No thread link returned from createThreadLink mutation");
  }

  return { success: true, threadId, threadLink: parseThreadLink(response.threadLink) };
};

/**
 * List the links attached to a thread. get_thread already returns the first 25
 * links; use this when a thread has more, or to read links without the
 * timeline payload.
 */
export const getThreadLinks = async (
  input: GetThreadLinksInput
): Promise<{ threadId: string; links: ThreadLinkInfo[]; hasNextPage: boolean }> => {
  const client = getPlainClient();

  const threadId = await resolveThreadId(client, input.threadId, input.ref, "thread");

  const result = await client.rawRequest({
    query: THREAD_LINKS_QUERY,
    variables: { threadId, first: input.first ?? 25 },
  });

  if (result.error) {
    throw new Error(`Failed to get thread links: ${formatPlainError(result.error)}`);
  }

  const data = result.data as {
    thread?: {
      id: string;
      links?: {
        edges?: Array<{ node: RawThreadLink }>;
        pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
      } | null;
    } | null;
  };
  const thread = data.thread;
  if (!thread) {
    throw new Error(`Thread not found: ${threadId}`);
  }

  return {
    threadId: thread.id,
    links: parseThreadLinks(thread.links),
    hasNextPage: thread.links?.pageInfo?.hasNextPage ?? false,
  };
};

/**
 * Remove a link from a thread. Takes the link's own id (the `id` field of an
 * entry in `links`), not the id of the thread on the other end. Plain's
 * deleteThreadLink is idempotent: deleting an id that no longer exists returns
 * no error, so this reports success in that case too.
 */
export const unlinkThread = async (
  input: UnlinkThreadInput
): Promise<{ success: true; threadLinkId: string }> => {
  const client = getPlainClient();

  const result = await client.rawRequest({
    query: DELETE_THREAD_LINK_MUTATION,
    variables: { input: { threadLinkId: input.threadLinkId } },
  });

  if (result.error) {
    throw new Error(`Failed to unlink thread: ${formatPlainError(result.error)}`);
  }

  const data = result.data as {
    deleteThreadLink: { error?: { message: string; type: string; code: string } | null };
  };

  if (data.deleteThreadLink?.error) {
    throw new Error(`Failed to unlink thread: ${formatPlainError(data.deleteThreadLink.error)}`);
  }

  return { success: true, threadLinkId: input.threadLinkId };
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

const THREAD_CUSTOMER_QUERY = `
  query GetThreadCustomer($threadId: ID!) {
    thread(threadId: $threadId) {
      customer { id }
    }
  }
`;

/**
 * Post an internal note on a thread. Internal notes are visible to the
 * support team only and are NOT sent to the customer.
 *
 * Plain's CreateNoteInput requires customerId and text. If callers only pass
 * threadId + markdown, derive the customerId from the thread and use markdown
 * as the text fallback.
 */
export const addInternalNote = async (
  input: AddInternalNoteInput
): Promise<{ success: true; noteId: string }> => {
  const client = getPlainClient();

  let customerId = input.customerId;
  if (!customerId) {
    const lookup = await client.rawRequest({
      query: THREAD_CUSTOMER_QUERY,
      variables: { threadId: input.threadId },
    });
    if (lookup.error) {
      throw new Error(`Failed to look up thread customer: ${formatPlainError(lookup.error)}`);
    }
    const lookupData = lookup.data as { thread?: { customer?: { id: string } | null } | null };
    const id = lookupData.thread?.customer?.id;
    if (!id) {
      throw new Error(`Could not resolve customerId for thread ${input.threadId}`);
    }
    customerId = id;
  }

  const text = input.text ?? input.markdown;

  const result = await client.rawRequest({
    query: CREATE_NOTE_MUTATION,
    variables: {
      input: {
        threadId: input.threadId,
        customerId,
        text,
        markdown: input.markdown,
      },
    },
  });

  if (result.error) {
    throw new Error(`Failed to add internal note: ${formatPlainError(result.error)}`);
  }

  const data = result.data as RawCreateNoteResponse;
  const response = data.createNote;

  if (response.error) {
    throw new Error(`Failed to add internal note: ${formatPlainError(response.error)}`);
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
    throw new Error(`Failed to add labels: ${formatPlainError(result.error)}`);
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
    throw new Error(`Failed to get label types: ${formatPlainError(result.error)}`);
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
