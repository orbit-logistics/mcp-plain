import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ThreadStatus } from "@team-plain/typescript-sdk";
import { listThreads, getThread, getThreadByRef, getThreadFields, replyToThread, markThreadAsDone, createThread } from "./threads.js";
import { getPlainClient } from "../client.js";

// Mock the client module
vi.mock("../client.js", () => ({
  getPlainClient: vi.fn(),
  resetPlainClient: vi.fn(),
}));

// Helper to create mock thread data
const createMockThread = (overrides: Record<string, unknown> = {}) => ({
  id: "thread_123",
  title: "Test Thread",
  status: "TODO",
  priority: 1,
  customer: {
    id: "cust_123",
    email: { email: "test@example.com" },
    fullName: "Test User",
    externalId: "ext_123",
  },
  labels: [{ labelType: { id: "label_1", name: "Bug" } }],
  createdAt: { iso8601: "2024-01-01T00:00:00Z" },
  updatedAt: { iso8601: "2024-01-02T00:00:00Z" },
  threadFields: [],
  previewText: "Thread description",
  externalId: null,
  ...overrides,
});

// Helper to create mock timeline entries
const createMockNoteEntry = () => ({
  node: {
    id: "entry_1",
    timestamp: { iso8601: "2024-01-01T10:00:00Z" },
    actor: {
      __typename: "UserActor",
      user: { fullName: "Support Agent" },
    },
    entry: {
      __typename: "NoteEntry",
      text: "This is a note",
      markdown: "**This is a note**",
    },
  },
});

const createMockEmailEntry = () => ({
  node: {
    id: "entry_2",
    timestamp: { iso8601: "2024-01-01T11:00:00Z" },
    actor: {
      __typename: "CustomerActor",
      customer: { fullName: "Test Customer" },
    },
    entry: {
      __typename: "EmailEntry",
      subject: "Re: Support Request",
      markdownContent: "Thank you for your help",
      from: { email: "customer@example.com", name: "Test Customer" },
    },
  },
});

const createMockChatEntry = () => ({
  node: {
    id: "entry_3",
    timestamp: { iso8601: "2024-01-01T12:00:00Z" },
    actor: {
      __typename: "CustomerActor",
      customer: { fullName: "Test Customer" },
    },
    entry: {
      __typename: "ChatEntry",
      text: "Hello, I need help",
    },
  },
});

const createMockDiscussionEntry = () => ({
  node: {
    id: "entry_disc_1",
    timestamp: { iso8601: "2024-01-01T13:00:00Z" },
    actor: {
      __typename: "UserActor",
      user: { fullName: "Tobias Feltes" },
    },
    entry: {
      __typename: "ThreadDiscussionEntry",
      threadDiscussionId: "disc_123",
      discussionType: "SLACK",
      slackChannelName: "#issues-non-critical",
      slackMessageLink: "https://slack.com/archives/C123/p456",
      emailRecipients: null,
    },
  },
});

const createMockDiscussionMessageEntry = (overrides: Record<string, unknown> = {}) => ({
  node: {
    id: "entry_disc_msg_1",
    timestamp: { iso8601: "2024-01-01T13:05:00Z" },
    actor: {
      __typename: "MachineUserActor",
      machineUser: { fullName: "OrBot" },
    },
    entry: {
      __typename: "ThreadDiscussionMessageEntry",
      threadDiscussionId: "disc_123",
      threadDiscussionMessageId: "disc_msg_456",
      discussionType: "SLACK",
      text: "Raw text with <@U123>",
      resolvedText: "Raw text with @Tobias Feltes",
      slackMessageLink: "https://slack.com/archives/C123/p789",
      attachments: null,
      ...overrides,
    },
  },
});

const createMockDiscussionResolvedEntry = () => ({
  node: {
    id: "entry_disc_resolved_1",
    timestamp: { iso8601: "2024-01-01T14:00:00Z" },
    actor: {
      __typename: "UserActor",
      user: { fullName: "Jan Czekala" },
    },
    entry: {
      __typename: "ThreadDiscussionResolvedEntry",
      threadDiscussionId: "disc_123",
      discussionType: "SLACK",
      resolvedAt: { iso8601: "2024-01-01T14:00:00Z" },
      slackChannelName: "#issues-non-critical",
      slackMessageLink: "https://slack.com/archives/C123/p999",
    },
  },
});

describe("listThreads", () => {
  let mockClient: { getThreads: Mock; getThread: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      getThreads: vi.fn(),
      getThread: vi.fn(),
    };
    (getPlainClient as Mock).mockReturnValue(mockClient);
  });

  it("should return threads with pagination info", async () => {
    mockClient.getThreads.mockResolvedValue({
      data: {
        threads: [createMockThread()],
        pageInfo: {
          hasNextPage: true,
          hasPreviousPage: false,
          startCursor: "start",
          endCursor: "end",
        },
      },
      error: null,
    });

    const result = await listThreads({});

    expect(result.threads).toHaveLength(1);
    expect(result.threads[0]!.id).toBe("thread_123");
    expect(result.pageInfo.hasNextPage).toBe(true);
  });

  it("should map TODO status to ThreadStatus.Todo", async () => {
    mockClient.getThreads.mockResolvedValue({
      data: {
        threads: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
      },
      error: null,
    });

    await listThreads({ statuses: ["TODO"] });

    expect(mockClient.getThreads).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { statuses: [ThreadStatus.Todo] },
      })
    );
  });

  it("should map DONE status to ThreadStatus.Done", async () => {
    mockClient.getThreads.mockResolvedValue({
      data: {
        threads: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
      },
      error: null,
    });

    await listThreads({ statuses: ["DONE"] });

    expect(mockClient.getThreads).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { statuses: [ThreadStatus.Done] },
      })
    );
  });

  it("should map SNOOZED status to ThreadStatus.Snoozed", async () => {
    mockClient.getThreads.mockResolvedValue({
      data: {
        threads: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
      },
      error: null,
    });

    await listThreads({ statuses: ["SNOOZED"] });

    expect(mockClient.getThreads).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { statuses: [ThreadStatus.Snoozed] },
      })
    );
  });

  it("should ignore invalid status strings", async () => {
    mockClient.getThreads.mockResolvedValue({
      data: {
        threads: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
      },
      error: null,
    });

    await listThreads({ statuses: ["INVALID", "TODO"] });

    expect(mockClient.getThreads).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { statuses: [ThreadStatus.Todo] },
      })
    );
  });

  it("should filter threads by priority client-side", async () => {
    mockClient.getThreads.mockResolvedValue({
      data: {
        threads: [
          createMockThread({ id: "t1", priority: 0 }),
          createMockThread({ id: "t2", priority: 1 }),
          createMockThread({ id: "t3", priority: 2 }),
        ],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
      },
      error: null,
    });

    const result = await listThreads({ priority: 1 });

    expect(result.threads).toHaveLength(1);
    expect(result.threads[0]!.id).toBe("t2");
  });

  it("should use default pagination (first: 50) when not specified", async () => {
    mockClient.getThreads.mockResolvedValue({
      data: {
        threads: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
      },
      error: null,
    });

    await listThreads({});

    expect(mockClient.getThreads).toHaveBeenCalledWith(
      expect.objectContaining({
        first: 50,
      })
    );
  });

  it("should throw error when API returns error", async () => {
    mockClient.getThreads.mockResolvedValue({
      data: null,
      error: { message: "API Error" },
    });

    await expect(listThreads({})).rejects.toThrow(
      "Failed to list threads: API Error"
    );
  });

  it("should extract customer info correctly", async () => {
    mockClient.getThreads.mockResolvedValue({
      data: {
        threads: [createMockThread()],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
      },
      error: null,
    });

    const result = await listThreads({});

    expect(result.threads[0]!.customer).toEqual({
      id: "cust_123",
      email: "test@example.com",
      fullName: "Test User",
      externalId: "ext_123",
    });
  });

  it("should extract labels correctly", async () => {
    mockClient.getThreads.mockResolvedValue({
      data: {
        threads: [createMockThread()],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
      },
      error: null,
    });

    const result = await listThreads({});

    expect(result.threads[0]!.labels).toEqual([{ id: "label_1", name: "Bug" }]);
  });

  it("should handle missing optional fields", async () => {
    mockClient.getThreads.mockResolvedValue({
      data: {
        threads: [
          createMockThread({
            title: null,
            customer: null,
          }),
        ],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
      },
      error: null,
    });

    const result = await listThreads({});

    expect(result.threads[0]!.title).toBeUndefined();
    expect(result.threads[0]!.customer).toBeUndefined();
  });
});

describe("getThread", () => {
  let mockClient: { rawRequest: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { rawRequest: vi.fn() };
    (getPlainClient as Mock).mockReturnValue(mockClient);
  });

  it("should return full thread details", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: { thread: createMockThread({ timelineEntries: { edges: [] } }) },
      error: null,
    });

    const result = await getThread({ threadId: "thread_123" });

    expect(result.id).toBe("thread_123");
    expect(result.title).toBe("Test Thread");
    expect(result.customer?.email).toBe("test@example.com");
  });

  it("should parse custom fields from threadFields", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: {
        thread: createMockThread({
          threadFields: [
            { key: "impact_level", stringValue: "P1" },
            { key: "tenant_id", stringValue: "tenant_abc" },
            { key: "request_feature", booleanValue: true },
          ],
          timelineEntries: { edges: [] },
        }),
      },
      error: null,
    });

    const result = await getThread({ threadId: "thread_123" });

    expect(result.customFields.impactLevel).toBe("P1");
    expect(result.customFields.tenant).toBe("tenant_abc");
    expect(result.customFields.requestFeature).toBe(true);
  });

  it("should parse timeline entries from thread response", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: {
        thread: createMockThread({
          timelineEntries: {
            edges: [createMockNoteEntry(), createMockEmailEntry(), createMockChatEntry()],
          },
        }),
      },
      error: null,
    });

    const result = await getThread({ threadId: "thread_123" });

    expect(result.timeline).toHaveLength(3);

    // Check note entry
    expect(result.timeline[0]!.entryType).toBe("NOTE");
    if (result.timeline[0]!.entryType === "NOTE") {
      expect(result.timeline[0]!.text).toBe("This is a note");
      expect(result.timeline[0]!.markdown).toBe("**This is a note**");
      expect(result.timeline[0]!.createdBy?.name).toBe("Support Agent");
      expect(result.timeline[0]!.timestamp).toBe("2024-01-01T10:00:00Z");
    }

    // Check email entry
    expect(result.timeline[1]!.entryType).toBe("EMAIL");
    if (result.timeline[1]!.entryType === "EMAIL") {
      expect(result.timeline[1]!.subject).toBe("Re: Support Request");
      expect(result.timeline[1]!.textContent).toBe("Thank you for your help");
      expect(result.timeline[1]!.from?.email).toBe("customer@example.com");
      expect(result.timeline[1]!.from?.name).toBe("Test Customer");
    }

    // Check chat entry
    expect(result.timeline[2]!.entryType).toBe("CHAT");
    if (result.timeline[2]!.entryType === "CHAT") {
      expect(result.timeline[2]!.text).toBe("Hello, I need help");
      expect(result.timeline[2]!.createdBy?.type).toBe("customer");
      expect(result.timeline[2]!.createdBy?.name).toBe("Test Customer");
    }
  });

  it("should return empty timeline when no entries", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: { thread: createMockThread({ timelineEntries: { edges: [] } }) },
      error: null,
    });

    const result = await getThread({ threadId: "thread_123" });

    expect(result.timeline).toEqual([]);
  });

  it("should throw error when API returns error", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: null,
      error: { message: "API Error" },
    });

    await expect(getThread({ threadId: "thread_123" })).rejects.toThrow(
      "Failed to get thread: API Error"
    );
  });

  it("should throw error when thread not found", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: { thread: null },
      error: null,
    });

    await expect(getThread({ threadId: "unknown" })).rejects.toThrow(
      "Thread not found: unknown"
    );
  });

  it("should handle missing timelineEntries field", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: { thread: createMockThread() },
      error: null,
    });

    const result = await getThread({ threadId: "thread_123" });

    expect(result.timeline).toEqual([]);
  });
});

describe("getThreadByRef", () => {
  let mockClient: { rawRequest: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { rawRequest: vi.fn() };
    (getPlainClient as Mock).mockReturnValue(mockClient);
  });

  it("should return thread details when found", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: { threadByRef: createMockThread({ timelineEntries: { edges: [] } }) },
      error: null,
    });

    const result = await getThreadByRef({ ref: "T-510" });

    expect(result.id).toBe("thread_123");
    expect(result.title).toBe("Test Thread");
    expect(result.customer?.email).toBe("test@example.com");
  });

  it("should parse custom fields from threadFields", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: {
        threadByRef: createMockThread({
          threadFields: [
            { key: "impact_level", stringValue: "P1" },
            { key: "tenant_id", stringValue: "tenant_abc" },
          ],
          timelineEntries: { edges: [] },
        }),
      },
      error: null,
    });

    const result = await getThreadByRef({ ref: "T-510" });

    expect(result.customFields.impactLevel).toBe("P1");
    expect(result.customFields.tenant).toBe("tenant_abc");
  });

  it("should parse timeline entries from thread response", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: {
        threadByRef: createMockThread({
          timelineEntries: {
            edges: [createMockChatEntry()],
          },
        }),
      },
      error: null,
    });

    const result = await getThreadByRef({ ref: "T-510" });

    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0]!.entryType).toBe("CHAT");
  });

  it("should throw error when thread not found", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: { threadByRef: null },
      error: null,
    });

    await expect(getThreadByRef({ ref: "T-999" })).rejects.toThrow(
      "Thread not found: T-999"
    );
  });

  it("should throw error when API returns error", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: null,
      error: { message: "API Error" },
    });

    await expect(getThreadByRef({ ref: "T-510" })).rejects.toThrow(
      "Failed to get thread: API Error"
    );
  });
});

describe("discussion timeline entries", () => {
  let mockClient: { rawRequest: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { rawRequest: vi.fn() };
    (getPlainClient as Mock).mockReturnValue(mockClient);
  });

  it("should parse ThreadDiscussionEntry correctly", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: {
        thread: createMockThread({
          timelineEntries: { edges: [createMockDiscussionEntry()] },
        }),
      },
      error: null,
    });

    const result = await getThread({ threadId: "thread_123" });

    expect(result.timeline).toHaveLength(1);
    const entry = result.timeline[0]!;
    expect(entry.entryType).toBe("DISCUSSION");
    if (entry.entryType === "DISCUSSION") {
      expect(entry.threadDiscussionId).toBe("disc_123");
      expect(entry.discussionType).toBe("SLACK");
      expect(entry.slackChannelName).toBe("#issues-non-critical");
      expect(entry.slackMessageLink).toBe("https://slack.com/archives/C123/p456");
    }
  });

  it("should parse ThreadDiscussionMessageEntry correctly", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: {
        thread: createMockThread({
          timelineEntries: { edges: [createMockDiscussionMessageEntry()] },
        }),
      },
      error: null,
    });

    const result = await getThread({ threadId: "thread_123" });

    expect(result.timeline).toHaveLength(1);
    const entry = result.timeline[0]!;
    expect(entry.entryType).toBe("DISCUSSION_MESSAGE");
    if (entry.entryType === "DISCUSSION_MESSAGE") {
      expect(entry.threadDiscussionId).toBe("disc_123");
      expect(entry.threadDiscussionMessageId).toBe("disc_msg_456");
      expect(entry.discussionType).toBe("SLACK");
      expect(entry.text).toBe("Raw text with @Tobias Feltes");
      expect(entry.slackMessageLink).toBe("https://slack.com/archives/C123/p789");
      expect(entry.createdBy?.name).toBe("OrBot");
    }
  });

  it("should prefer resolvedText over raw text for discussion messages", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: {
        thread: createMockThread({
          timelineEntries: {
            edges: [createMockDiscussionMessageEntry({
              text: "Raw text with <@U123>",
              resolvedText: "Resolved text with @Tobias Feltes",
            })],
          },
        }),
      },
      error: null,
    });

    const result = await getThread({ threadId: "thread_123" });
    const entry = result.timeline[0]!;

    if (entry.entryType === "DISCUSSION_MESSAGE") {
      expect(entry.text).toBe("Resolved text with @Tobias Feltes");
    }
  });

  it("should fall back to raw text when resolvedText is null", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: {
        thread: createMockThread({
          timelineEntries: {
            edges: [createMockDiscussionMessageEntry({
              text: "Raw text with <@U123>",
              resolvedText: null,
            })],
          },
        }),
      },
      error: null,
    });

    const result = await getThread({ threadId: "thread_123" });
    const entry = result.timeline[0]!;

    if (entry.entryType === "DISCUSSION_MESSAGE") {
      expect(entry.text).toBe("Raw text with <@U123>");
    }
  });

  it("should parse ThreadDiscussionResolvedEntry correctly", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: {
        thread: createMockThread({
          timelineEntries: { edges: [createMockDiscussionResolvedEntry()] },
        }),
      },
      error: null,
    });

    const result = await getThread({ threadId: "thread_123" });

    expect(result.timeline).toHaveLength(1);
    const entry = result.timeline[0]!;
    expect(entry.entryType).toBe("DISCUSSION_RESOLVED");
    if (entry.entryType === "DISCUSSION_RESOLVED") {
      expect(entry.threadDiscussionId).toBe("disc_123");
      expect(entry.discussionType).toBe("SLACK");
      expect(entry.resolvedAt).toBe("2024-01-01T14:00:00Z");
      expect(entry.slackChannelName).toBe("#issues-non-critical");
    }
  });

  it("should show discussion entries chronologically alongside other types", async () => {
    mockClient.rawRequest.mockResolvedValue({
      data: {
        thread: createMockThread({
          timelineEntries: {
            edges: [
              createMockNoteEntry(),
              createMockDiscussionEntry(),
              createMockDiscussionMessageEntry(),
              createMockDiscussionResolvedEntry(),
              createMockChatEntry(),
            ],
          },
        }),
      },
      error: null,
    });

    const result = await getThread({ threadId: "thread_123" });

    expect(result.timeline).toHaveLength(5);
    expect(result.timeline[0]!.entryType).toBe("NOTE");
    expect(result.timeline[1]!.entryType).toBe("DISCUSSION");
    expect(result.timeline[2]!.entryType).toBe("DISCUSSION_MESSAGE");
    expect(result.timeline[3]!.entryType).toBe("DISCUSSION_RESOLVED");
    expect(result.timeline[4]!.entryType).toBe("CHAT");
  });
});

describe("getThreadFields", () => {
  let mockClient: { getThread: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { getThread: vi.fn() };
    (getPlainClient as Mock).mockReturnValue(mockClient);
  });

  it("should return only custom fields", async () => {
    mockClient.getThread.mockResolvedValue({
      data: createMockThread({
        threadFields: [
          { key: "posthog_session", stringValue: "session_123" },
          { key: "sentry_session", stringValue: "sentry_456" },
        ],
      }),
      error: null,
    });

    const result = await getThreadFields({ threadId: "thread_123" });

    expect(result.posthogSession).toBe("session_123");
    expect(result.sentrySession).toBe("sentry_456");
    // Should not have other thread properties
    expect((result as Record<string, unknown>).id).toBeUndefined();
  });

  it("should map snake_case keys to camelCase", async () => {
    mockClient.getThread.mockResolvedValue({
      data: createMockThread({
        threadFields: [
          { key: "impact_level", stringValue: "P0" },
          { key: "notion_ticket", stringValue: "notion_123" },
          { key: "github_pr", stringValue: "https://github.com/pr/123" },
          { key: "tenant_id", stringValue: "tenant_abc" },
          { key: "app", stringValue: "web" },
          { key: "reported_from", stringValue: "https://example.com" },
          { key: "stage", stringValue: "production" },
        ],
      }),
      error: null,
    });

    const result = await getThreadFields({ threadId: "thread_123" });

    expect(result.impactLevel).toBe("P0");
    expect(result.notionTicket).toBe("notion_123");
    expect(result.githubPr).toBe("https://github.com/pr/123");
    expect(result.tenant).toBe("tenant_abc");
    expect(result.affectedApp).toBe("web");
    expect(result.reportedFromUrl).toBe("https://example.com");
    expect(result.affectedStage).toBe("production");
  });

  it("should handle boolean values for requestFeature", async () => {
    mockClient.getThread.mockResolvedValue({
      data: createMockThread({
        threadFields: [{ key: "request_feature", booleanValue: true }],
      }),
      error: null,
    });

    const result = await getThreadFields({ threadId: "thread_123" });

    expect(result.requestFeature).toBe(true);
  });

  it("should validate impactLevel against allowed values", async () => {
    mockClient.getThread.mockResolvedValue({
      data: createMockThread({
        threadFields: [{ key: "impact_level", stringValue: "INVALID" }],
      }),
      error: null,
    });

    const result = await getThreadFields({ threadId: "thread_123" });

    expect(result.impactLevel).toBeUndefined();
  });

  it("should accept valid impactLevel values", async () => {
    const validLevels = ["P0", "P1", "P2", "RBS", "RBP", "not-a-bug"];

    for (const level of validLevels) {
      mockClient.getThread.mockResolvedValue({
        data: createMockThread({
          threadFields: [{ key: "impact_level", stringValue: level }],
        }),
        error: null,
      });

      const result = await getThreadFields({ threadId: "thread_123" });

      expect(result.impactLevel).toBe(level);
    }
  });

  it("should handle empty threadFields array", async () => {
    mockClient.getThread.mockResolvedValue({
      data: createMockThread({ threadFields: [] }),
      error: null,
    });

    const result = await getThreadFields({ threadId: "thread_123" });

    expect(result).toEqual({});
  });

  it("should ignore unknown field keys", async () => {
    mockClient.getThread.mockResolvedValue({
      data: createMockThread({
        threadFields: [{ key: "unknown_field", stringValue: "value" }],
      }),
      error: null,
    });

    const result = await getThreadFields({ threadId: "thread_123" });

    expect((result as Record<string, unknown>).unknown_field).toBeUndefined();
    expect((result as Record<string, unknown>).unknownField).toBeUndefined();
  });

  it("should throw error when API returns error", async () => {
    mockClient.getThread.mockResolvedValue({
      data: null,
      error: { message: "API Error" },
    });

    await expect(getThreadFields({ threadId: "thread_123" })).rejects.toThrow(
      "Failed to get thread fields: API Error"
    );
  });

  it("should throw error when thread not found", async () => {
    mockClient.getThread.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(getThreadFields({ threadId: "unknown" })).rejects.toThrow(
      "Thread not found: unknown"
    );
  });
});

describe("replyToThread", () => {
  let mockClient: { replyToThread: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { replyToThread: vi.fn() };
    (getPlainClient as Mock).mockReturnValue(mockClient);
  });

  it("should send a reply with text content", async () => {
    mockClient.replyToThread.mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await replyToThread({
      threadId: "thread_123",
      textContent: "Thanks for reaching out!",
    });

    expect(result).toEqual({ success: true });
    expect(mockClient.replyToThread).toHaveBeenCalledWith({
      threadId: "thread_123",
      textContent: "Thanks for reaching out!",
    });
  });

  it("should send a reply with markdown content", async () => {
    mockClient.replyToThread.mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await replyToThread({
      threadId: "thread_123",
      textContent: "Thanks for reaching out!",
      markdownContent: "**Thanks** for reaching out!",
    });

    expect(result).toEqual({ success: true });
    expect(mockClient.replyToThread).toHaveBeenCalledWith({
      threadId: "thread_123",
      textContent: "Thanks for reaching out!",
      markdownContent: "**Thanks** for reaching out!",
    });
  });

  it("should throw error when API returns error", async () => {
    mockClient.replyToThread.mockResolvedValue({
      data: null,
      error: { message: "Thread not found" },
    });

    await expect(
      replyToThread({ threadId: "unknown", textContent: "Hello" })
    ).rejects.toThrow("Failed to reply to thread: Thread not found");
  });
});

describe("markThreadAsDone", () => {
  let mockClient: { markThreadAsDone: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { markThreadAsDone: vi.fn() };
    (getPlainClient as Mock).mockReturnValue(mockClient);
  });

  it("should mark a thread as done", async () => {
    mockClient.markThreadAsDone.mockResolvedValue({
      data: { id: "thread_123", status: "DONE" },
      error: null,
    });

    const result = await markThreadAsDone({ threadId: "thread_123" });

    expect(result).toEqual({ threadId: "thread_123", status: "DONE" });
    expect(mockClient.markThreadAsDone).toHaveBeenCalledWith({
      threadId: "thread_123",
    });
  });

  it("should throw error when API returns error", async () => {
    mockClient.markThreadAsDone.mockResolvedValue({
      data: null,
      error: { message: "Thread not found" },
    });

    await expect(
      markThreadAsDone({ threadId: "unknown" })
    ).rejects.toThrow("Failed to mark thread as done: Thread not found");
  });
});

describe("createThread", () => {
  let mockClient: { createThread: Mock; upsertCustomer: Mock };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      createThread: vi.fn(),
      upsertCustomer: vi.fn(),
    };
    (getPlainClient as Mock).mockReturnValue(mockClient);
  });

  const mockUpsertSuccess = (customerId = "cust_upserted") => {
    mockClient.upsertCustomer.mockResolvedValue({
      data: { customer: { id: customerId }, result: "CREATED" },
      error: null,
    });
  };

  const mockCreateSuccess = (overrides: Record<string, unknown> = {}) => {
    mockClient.createThread.mockResolvedValue({
      data: { id: "thread_new", title: null, status: "TODO", priority: 2, ...overrides },
      error: null,
    });
  };

  it("should upsert customer by email then create thread with returned ID", async () => {
    mockUpsertSuccess("cust_resolved");
    mockCreateSuccess({ title: "Bug report" });

    const result = await createThread({
      customerEmail: "user@example.com",
      title: "Bug report",
      markdown: "Something is broken",
    });

    expect(result).toEqual({
      threadId: "thread_new",
      title: "Bug report",
      status: "TODO",
      priority: 2,
    });
    expect(mockClient.upsertCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: { emailAddress: "user@example.com" },
      })
    );
    expect(mockClient.createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        customerIdentifier: { customerId: "cust_resolved" },
        title: "Bug report",
      })
    );
  });

  it("should pass fullName to upsert when provided", async () => {
    mockUpsertSuccess();
    mockCreateSuccess();

    await createThread({
      customerEmail: "user@example.com",
      customerFullName: "Jane Doe",
      markdown: "Something is broken",
    });

    const upsertCall = mockClient.upsertCustomer.mock.calls[0]![0];
    expect(upsertCall.onCreate.fullName).toBe("Jane Doe");
    expect(upsertCall.onUpdate.fullName).toEqual({ value: "Jane Doe" });
  });

  it("should skip upsert when customerId is provided directly", async () => {
    mockCreateSuccess();

    await createThread({
      customerId: "cust_123",
      markdown: "Something is broken",
    });

    expect(mockClient.upsertCustomer).not.toHaveBeenCalled();
    expect(mockClient.createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        customerIdentifier: { customerId: "cust_123" },
      })
    );
  });

  it("should create a thread with external ID", async () => {
    mockCreateSuccess();

    await createThread({
      customerExternalId: "ext_456",
      markdown: "Something is broken",
    });

    expect(mockClient.upsertCustomer).not.toHaveBeenCalled();
    expect(mockClient.createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        customerIdentifier: { externalId: "ext_456" },
      })
    );
  });

  it("should throw when no customer identifier is provided", async () => {
    await expect(
      createThread({ markdown: "Something is broken" })
    ).rejects.toThrow("Provide at least one of customerEmail, customerId, or customerExternalId");
  });

  it("should throw when multiple customer identifiers are provided", async () => {
    await expect(
      createThread({
        customerEmail: "user@example.com",
        customerId: "cust_123",
        markdown: "Something is broken",
      })
    ).rejects.toThrow("Provide only one of customerEmail, customerId, or customerExternalId");
  });

  it("should pass optional fields when provided", async () => {
    mockUpsertSuccess();
    mockCreateSuccess({ title: "Bug", priority: 0 });

    await createThread({
      customerEmail: "user@example.com",
      title: "Bug",
      description: "A serious bug",
      markdown: "Details here",
      priority: 0,
      labelTypeIds: ["label_1", "label_2"],
      externalId: "my-ext-id",
    });

    expect(mockClient.createThread).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Bug",
        description: "A serious bug",
        priority: 0,
        labelTypeIds: ["label_1", "label_2"],
        externalId: "my-ext-id",
      })
    );
  });

  it("should use raw componentText format for components", async () => {
    mockUpsertSuccess();
    mockCreateSuccess();

    await createThread({
      customerEmail: "user@example.com",
      markdown: "**Hello** world",
    });

    const call = mockClient.createThread.mock.calls[0]![0];
    expect(call.components).toEqual([{ componentText: { text: "**Hello** world" } }]);
  });

  it("should pass custom thread fields when provided", async () => {
    mockUpsertSuccess();
    mockCreateSuccess({ title: "Bug", priority: 0 });

    await createThread({
      customerEmail: "user@example.com",
      markdown: "Details here",
      impactLevel: "P0",
      app: "web",
      tenantId: "tenant_abc",
      stage: "production",
      reportedFrom: "https://app.example.com/page",
      posthogSession: "https://eu.posthog.com/project/123/replay/session_1",
      sentrySession: "https://sentry.io/replays/replay_1/",
      notionTicket: "https://notion.so/ticket-123",
      githubPr: "https://github.com/org/repo/pull/42",
    });

    const call = mockClient.createThread.mock.calls[0]![0];
    expect(call.threadFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "impact_level", stringValue: "P0" }),
        expect.objectContaining({ key: "app", stringValue: "web" }),
        expect.objectContaining({ key: "tenant_id", stringValue: "tenant_abc" }),
        expect.objectContaining({ key: "stage", stringValue: "production" }),
        expect.objectContaining({ key: "reported_from", stringValue: "https://app.example.com/page" }),
        expect.objectContaining({ key: "posthog_session", stringValue: "https://eu.posthog.com/project/123/replay/session_1" }),
        expect.objectContaining({ key: "sentry_session", stringValue: "https://sentry.io/replays/replay_1/" }),
        expect.objectContaining({ key: "notion_ticket", stringValue: "https://notion.so/ticket-123" }),
        expect.objectContaining({ key: "github_pr", stringValue: "https://github.com/org/repo/pull/42" }),
      ])
    );
  });

  it("should pass boolean request_feature field", async () => {
    mockUpsertSuccess();
    mockCreateSuccess();

    await createThread({
      customerEmail: "user@example.com",
      markdown: "Feature idea",
      requestFeature: true,
    });

    const call = mockClient.createThread.mock.calls[0]![0];
    expect(call.threadFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "request_feature", booleanValue: true }),
      ])
    );
  });

  it("should not include threadFields when none are provided", async () => {
    mockUpsertSuccess();
    mockCreateSuccess();

    await createThread({
      customerEmail: "user@example.com",
      markdown: "Simple thread",
    });

    const call = mockClient.createThread.mock.calls[0]![0];
    expect(call.threadFields).toBeUndefined();
  });

  it("should throw with detailed error when upsert fails", async () => {
    mockClient.upsertCustomer.mockResolvedValue({
      data: null,
      error: {
        message: "Invalid email",
        type: "VALIDATION",
        code: "invalid_email",
        fields: [{ field: "email", message: "Email format is invalid", type: "VALIDATION" }],
      },
    });

    await expect(
      createThread({ customerEmail: "bad-email", markdown: "test" })
    ).rejects.toThrow("Failed to upsert customer: Invalid email [VALIDATION] (code: invalid_email)");
  });

  it("should throw with detailed error when createThread fails", async () => {
    mockUpsertSuccess();
    mockClient.createThread.mockResolvedValue({
      data: null,
      error: {
        message: "There was a validation error.",
        type: "VALIDATION",
        fields: [{ field: "components", message: "Text exceeds maximum length", type: "VALIDATION" }],
      },
    });

    await expect(
      createThread({ customerEmail: "user@example.com", markdown: "test" })
    ).rejects.toThrow("Field errors:");
  });
});
