#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { listThreads, getThread, getThreadByRef, getThreadFields, getAttachmentDownloadUrl, getAttachmentContent, replyToThread, markThreadAsDone, upsertThreadField, addInternalNote, addLabelsToThread, getLabelTypes, createThread } from "./tools/threads.js";
import { listHelpCenters, getHelpCenter, listHelpCenterArticles, getHelpCenterArticle, getHelpCenterArticleBySlug, upsertHelpCenterArticle, createHelpCenterArticleGroup, deleteHelpCenterArticleGroup } from "./tools/helpCenter.js";
import {
  listThreadsInputSchema,
  getThreadInputSchema,
  getThreadByRefInputSchema,
  getThreadFieldsInputSchema,
  getAttachmentDownloadUrlInputSchema,
  getAttachmentContentInputSchema,
  upsertThreadFieldInputSchema,
  addInternalNoteInputSchema,
  replyToThreadInputSchema,
  markThreadAsDoneInputSchema,
  addLabelsInputSchema,
  getLabelTypesInputSchema,
  createThreadInputSchema,
  listHelpCentersInputSchema,
  getHelpCenterInputSchema,
  listHelpCenterArticlesInputSchema,
  getHelpCenterArticleInputSchema,
  getHelpCenterArticleBySlugInputSchema,
  upsertHelpCenterArticleInputSchema,
  createHelpCenterArticleGroupInputSchema,
  deleteHelpCenterArticleGroupInputSchema,
} from "./types.js";

// Validate required environment variable early
if (!process.env.PLAIN_API_KEY) {
  console.error("Error: PLAIN_API_KEY environment variable is required.");
  console.error("Set it in your MCP server configuration or shell environment.");
  process.exit(1);
}

const server = new Server(
  {
    name: "mcp-plain",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_threads",
      description:
        "List support threads from Plain with optional filters. Returns thread summaries including id, title, status, priority, customer info, labels, and timestamps.",
      inputSchema: {
        type: "object",
        properties: {
          statuses: {
            type: "array",
            items: { type: "string" },
            description:
              "Filter by thread statuses (e.g., 'TODO', 'DONE', 'SNOOZED')",
          },
          priority: {
            type: "number",
            minimum: 0,
            maximum: 3,
            description: "Filter by priority (0 = urgent, 3 = low)",
          },
          labelTypeIds: {
            type: "array",
            items: { type: "string" },
            description: "Filter by label type IDs",
          },
          customerId: {
            type: "string",
            description: "Filter by customer ID",
          },
          tenantId: {
            type: "string",
            description: "Filter by tenant ID (via thread field)",
          },
          first: {
            type: "number",
            minimum: 1,
            maximum: 100,
            default: 50,
            description: "Number of threads to return (default 50, max 100)",
          },
          after: {
            type: "string",
            description: "Cursor for pagination",
          },
        },
      },
    },
    {
      name: "get_thread",
      description:
        "Get full details of a specific thread including basic info, customer, labels, custom fields, and timeline entries.",
      inputSchema: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "The ID of the thread to retrieve",
          },
        },
        required: ["threadId"],
      },
    },
    {
      name: "get_thread_by_ref",
      description:
        "Get full details of a thread by its reference number (e.g., T-510). Returns the same details as get_thread.",
      inputSchema: {
        type: "object",
        properties: {
          ref: {
            type: "string",
            description: "Thread reference number (e.g., 'T-510')",
          },
        },
        required: ["ref"],
      },
    },
    {
      name: "get_thread_fields",
      description:
        "Get just the custom field values for a thread. Returns fields like impactLevel, posthogSession, sentrySession, tenant, etc.",
      inputSchema: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "The ID of the thread to get fields for",
          },
        },
        required: ["threadId"],
      },
    },
    {
      name: "get_attachment_download_url",
      description:
        "Get a temporary download URL for an attachment. Use this to download attachment content when needed. The URL expires after a short time.",
      inputSchema: {
        type: "object",
        properties: {
          attachmentId: {
            type: "string",
            description: "The ID of the attachment to get a download URL for",
          },
        },
        required: ["attachmentId"],
      },
    },
    {
      name: "get_attachment_content",
      description:
        "Fetch the content of an attachment. Returns the content as text for text-based files (text/*, JSON, XML, etc.) or as base64-encoded string for binary files (images, PDFs, etc.). The response includes the encoding type ('text' or 'base64') and MIME type.",
      inputSchema: {
        type: "object",
        properties: {
          attachmentId: {
            type: "string",
            description: "The ID of the attachment to fetch content for",
          },
        },
        required: ["attachmentId"],
      },
    },
    {
      name: "reply_to_thread",
      description:
        "Send a reply to a customer thread. The reply is sent through the original channel (email, Slack, chat). Provide textContent (required) and optionally markdownContent for rich formatting.",
      inputSchema: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "The ID of the thread to reply to",
          },
          textContent: {
            type: "string",
            description: "Plain text content of the reply",
          },
          markdownContent: {
            type: "string",
            description: "Optional markdown-formatted content of the reply",
          },
        },
        required: ["threadId", "textContent"],
      },
    },
    {
      name: "mark_thread_as_done",
      description:
        "Mark a thread as done/resolved. Use this after replying to a thread when the issue has been resolved.",
      inputSchema: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "The ID of the thread to mark as done",
          },
        },
        required: ["threadId"],
      },
    },
    {
      name: "upsert_thread_field",
      description:
        "Set or update a custom field value on a thread. Use this to write investigation results back to the ticket (e.g., impact_level, app, stage). Field keys use Plain's snake_case format.",
      inputSchema: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "The ID of the thread to update",
          },
          key: {
            type: "string",
            description:
              "Custom field key in snake_case, e.g. impact_level, app, stage, tenant_id, notion_ticket, github_pr, posthog_session, sentry_session, reported_from, request_feature",
          },
          value: {
            type: "string",
            description:
              "Field value to set. For boolean fields like request_feature, use 'true' or 'false'",
          },
        },
        required: ["threadId", "key", "value"],
      },
    },
    {
      name: "add_internal_note",
      description:
        "Post an internal note on a thread. Internal notes are visible to the support team only and are NOT sent to the customer. Use this to post investigation summaries, findings, and recommendations.",
      inputSchema: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "The ID of the thread to add a note to",
          },
          markdown: {
            type: "string",
            description: "Markdown content for the internal note",
          },
        },
        required: ["threadId", "markdown"],
      },
    },
    {
      name: "add_labels",
      description:
        "Add category labels to a thread. Use get_label_types first to discover available label type IDs for bug, support, feature-request, sales categories.",
      inputSchema: {
        type: "object",
        properties: {
          threadId: {
            type: "string",
            description: "The ID of the thread to add labels to",
          },
          labelTypeIds: {
            type: "array",
            items: { type: "string" },
            description:
              "Array of label type IDs to add (get IDs from get_label_types)",
          },
        },
        required: ["threadId", "labelTypeIds"],
      },
    },
    {
      name: "get_label_types",
      description:
        "List available label types in the Plain workspace. Returns label type IDs and names. Call this once to discover the IDs for category labels (bug, support, feature-request, sales) before using add_labels.",
      inputSchema: {
        type: "object",
        properties: {
          first: {
            type: "number",
            minimum: 1,
            maximum: 100,
            default: 50,
            description:
              "Number of label types to return (default 50)",
          },
        },
      },
    },
    {
      name: "create_thread",
      description:
        "Create a new support thread for a customer. Provide exactly one customer identifier (email, ID, or external ID) and markdown content for the initial message. When using customerEmail, the customer is automatically created in Plain if they don't exist. Optionally set title, description, priority, labels, custom fields, and external ID.",
      inputSchema: {
        type: "object",
        properties: {
          customerEmail: {
            type: "string",
            description:
              "Customer email address. Provide either customerEmail, customerId, or customerExternalId.",
          },
          customerId: {
            type: "string",
            description:
              "Existing Plain customer ID. Provide either customerEmail, customerId, or customerExternalId.",
          },
          customerExternalId: {
            type: "string",
            description:
              "Customer external ID. Provide either customerEmail, customerId, or customerExternalId.",
          },
          customerFullName: {
            type: "string",
            description:
              "Customer full name. Used when upserting a customer by email (ignored when customerId is provided).",
          },
          title: {
            type: "string",
            description: "Thread title",
          },
          description: {
            type: "string",
            description: "Thread description / preview text",
          },
          markdown: {
            type: "string",
            description:
              "Markdown content for the first timeline entry in the thread",
          },
          priority: {
            type: "number",
            minimum: 0,
            maximum: 3,
            description:
              "Priority: 0 = urgent, 1 = high, 2 = normal (default), 3 = low",
          },
          labelTypeIds: {
            type: "array",
            items: { type: "string" },
            description:
              "Label type IDs to attach. Use get_label_types to discover available IDs.",
          },
          externalId: {
            type: "string",
            description: "Your own unique identifier for this thread",
          },
          impactLevel: {
            type: "string",
            enum: ["P0", "P1", "P2", "RBS", "RBP", "not-a-bug"],
            description:
              "Impact level: P0 (critical), P1, P2, RBS (release blocker staging), RBP (release blocker production), not-a-bug",
          },
          app: {
            type: "string",
            description:
              "Affected app identifier (e.g. 'web', 'mobile', 'api')",
          },
          tenantId: {
            type: "string",
            description: "Tenant ID to associate with the thread",
          },
          stage: {
            type: "string",
            description:
              "Environment stage (e.g. 'production', 'staging', 'develop')",
          },
          reportedFrom: {
            type: "string",
            description: "URL where the issue was reported from",
          },
          posthogSession: {
            type: "string",
            description:
              "PostHog session replay URL or session recording ID",
          },
          sentrySession: {
            type: "string",
            description: "Sentry replay URL or replay ID",
          },
          notionTicket: {
            type: "string",
            description: "Notion ticket URL or ID",
          },
          githubPr: {
            type: "string",
            description: "GitHub PR URL",
          },
          requestFeature: {
            type: "boolean",
            description: "Whether this is a feature request",
          },
        },
        required: ["markdown"],
      },
    },
    // --- Help Center tools ---
    {
      name: "list_help_centers",
      description:
        "List all help centers in the Plain workspace. Returns help center IDs, names, descriptions, and types. Use this to discover help center IDs before using other help center tools.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_help_center",
      description:
        "Get a help center by ID with an overview of its article groups and articles (titles, slugs, statuses). Use this to browse the structure of a help center.",
      inputSchema: {
        type: "object",
        properties: {
          helpCenterId: {
            type: "string",
            description: "The ID of the help center to retrieve",
          },
        },
        required: ["helpCenterId"],
      },
    },
    {
      name: "list_help_center_articles",
      description:
        "List articles in a help center with full content (contentHtml). Use this to read all articles at once for review or analysis.",
      inputSchema: {
        type: "object",
        properties: {
          helpCenterId: {
            type: "string",
            description: "The ID of the help center to list articles from",
          },
          first: {
            type: "number",
            minimum: 1,
            maximum: 100,
            default: 20,
            description: "Number of articles to return (default 20, max 100)",
          },
        },
        required: ["helpCenterId"],
      },
    },
    {
      name: "get_help_center_article",
      description:
        "Get a single help center article by ID including its full HTML content, metadata, and group assignment.",
      inputSchema: {
        type: "object",
        properties: {
          helpCenterArticleId: {
            type: "string",
            description: "The ID of the help center article to retrieve",
          },
        },
        required: ["helpCenterArticleId"],
      },
    },
    {
      name: "get_help_center_article_by_slug",
      description:
        "Get a single help center article by its URL slug. Useful when you know the slug from a URL but not the article ID.",
      inputSchema: {
        type: "object",
        properties: {
          helpCenterId: {
            type: "string",
            description: "The ID of the help center the article belongs to",
          },
          slug: {
            type: "string",
            description: "The URL slug of the article",
          },
        },
        required: ["helpCenterId", "slug"],
      },
    },
    {
      name: "upsert_help_center_article",
      description:
        "Create or update a help center article. Articles are always saved as DRAFT status. To update an existing article, provide helpCenterArticleId. Content must be HTML (not markdown). Returns the article data and a link to edit it in the Plain UI.\n\nIMPORTANT: When updating an existing article, you MUST preserve the original HTML formatting exactly. Copy the existing contentHtml verbatim and only modify the specific parts that need changing. Do NOT reformat, re-indent, restructure tags, collapse whitespace, change tag styles, or rewrite any HTML that isn't part of your intended edit. Treat the HTML as a surgical edit, not a rewrite.",
      inputSchema: {
        type: "object",
        properties: {
          helpCenterId: {
            type: "string",
            description: "The ID of the help center to create/update the article in",
          },
          title: {
            type: "string",
            description: "Article title",
          },
          contentHtml: {
            type: "string",
            description: "Article content as HTML (not markdown)",
          },
          helpCenterArticleId: {
            type: "string",
            description: "Existing article ID for updates. Omit to create a new article.",
          },
          description: {
            type: "string",
            description: "Short description / summary of the article",
          },
          slug: {
            type: "string",
            description: "URL slug for the article",
          },
          helpCenterArticleGroupId: {
            type: "string",
            description: "Article group ID to place the article in",
          },
        },
        required: ["helpCenterId", "title", "contentHtml", "description"],
      },
    },
    {
      name: "create_help_center_article_group",
      description:
        "Create a new article group (category/folder) in a help center. Groups organize articles and can be nested.",
      inputSchema: {
        type: "object",
        properties: {
          helpCenterId: {
            type: "string",
            description: "The ID of the help center to create the group in",
          },
          name: {
            type: "string",
            description: "Name of the article group",
          },
          parentHelpCenterArticleGroupId: {
            type: "string",
            description: "Parent group ID for nested groups",
          },
        },
        required: ["helpCenterId", "name"],
      },
    },
    {
      name: "delete_help_center_article_group",
      description:
        "Delete an article group from a help center. The group must be empty (no articles or child groups).",
      inputSchema: {
        type: "object",
        properties: {
          helpCenterArticleGroupId: {
            type: "string",
            description: "The ID of the article group to delete",
          },
        },
        required: ["helpCenterArticleGroupId"],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_threads": {
        const input = listThreadsInputSchema.parse(args);
        const result = await listThreads(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_thread": {
        const input = getThreadInputSchema.parse(args);
        const result = await getThread(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_thread_by_ref": {
        const input = getThreadByRefInputSchema.parse(args);
        const result = await getThreadByRef(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_thread_fields": {
        const input = getThreadFieldsInputSchema.parse(args);
        const result = await getThreadFields(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_attachment_download_url": {
        const input = getAttachmentDownloadUrlInputSchema.parse(args);
        const result = await getAttachmentDownloadUrl(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_attachment_content": {
        const input = getAttachmentContentInputSchema.parse(args);
        const result = await getAttachmentContent(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "reply_to_thread": {
        const input = replyToThreadInputSchema.parse(args);
        const result = await replyToThread(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "mark_thread_as_done": {
        const input = markThreadAsDoneInputSchema.parse(args);
        const result = await markThreadAsDone(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "upsert_thread_field": {
        const input = upsertThreadFieldInputSchema.parse(args);
        const result = await upsertThreadField(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "add_internal_note": {
        const input = addInternalNoteInputSchema.parse(args);
        const result = await addInternalNote(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "add_labels": {
        const input = addLabelsInputSchema.parse(args);
        const result = await addLabelsToThread(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_label_types": {
        const input = getLabelTypesInputSchema.parse(args);
        const result = await getLabelTypes(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "create_thread": {
        const input = createThreadInputSchema.parse(args);
        const result = await createThread(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      // Help Center tools
      case "list_help_centers": {
        const input = listHelpCentersInputSchema.parse(args);
        const result = await listHelpCenters(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_help_center": {
        const input = getHelpCenterInputSchema.parse(args);
        const result = await getHelpCenter(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "list_help_center_articles": {
        const input = listHelpCenterArticlesInputSchema.parse(args);
        const result = await listHelpCenterArticles(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_help_center_article": {
        const input = getHelpCenterArticleInputSchema.parse(args);
        const result = await getHelpCenterArticle(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_help_center_article_by_slug": {
        const input = getHelpCenterArticleBySlugInputSchema.parse(args);
        const result = await getHelpCenterArticleBySlug(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "upsert_help_center_article": {
        const input = upsertHelpCenterArticleInputSchema.parse(args);
        const result = await upsertHelpCenterArticle(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "create_help_center_article_group": {
        const input = createHelpCenterArticleGroupInputSchema.parse(args);
        const result = await createHelpCenterArticleGroup(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "delete_help_center_article_group": {
        const input = deleteHelpCenterArticleGroupInputSchema.parse(args);
        const result = await deleteHelpCenterArticleGroup(input);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Start the server
const main = async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Plain MCP server running on stdio");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
