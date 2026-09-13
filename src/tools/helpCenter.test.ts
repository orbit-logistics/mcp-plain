import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  listHelpCenters,
  getHelpCenter,
  listHelpCenterArticles,
  getHelpCenterArticle,
  getHelpCenterArticleBySlug,
  upsertHelpCenterArticle,
  createHelpCenterArticleGroup,
  deleteHelpCenterArticleGroup,
} from "./helpCenter.js";
import { getPlainClient } from "../client.js";

// Mock the client module
vi.mock("../client.js", () => ({
  getPlainClient: vi.fn(),
  resetPlainClient: vi.fn(),
}));

// Helper to create mock article data
const createMockArticle = (overrides: Record<string, unknown> = {}) => ({
  id: "art_123",
  title: "Getting Started",
  slug: "getting-started",
  status: "PUBLISHED",
  description: "How to get started",
  contentHtml: "<p>Welcome to our help center</p>",
  articleGroup: { id: "grp_1", name: "Basics" },
  createdAt: { iso8601: "2024-01-01T00:00:00Z" },
  updatedAt: { iso8601: "2024-01-02T00:00:00Z" },
  ...overrides,
});

const createMockHelpCenter = (overrides: Record<string, unknown> = {}) => ({
  id: "hc_123",
  publicName: "Help Center",
  internalName: "Main Help Center",
  description: "Our help center",
  type: "HELP_CENTER",
  ...overrides,
});

describe("listHelpCenters", () => {
  let mockRawRequest: Mock;

  beforeEach(() => {
    mockRawRequest = vi.fn();
    (getPlainClient as Mock).mockReturnValue({ rawRequest: mockRawRequest });
  });

  it("should return help centers", async () => {
    const hc = createMockHelpCenter();
    mockRawRequest.mockResolvedValue({
      data: {
        helpCenters: {
          edges: [{ node: hc }],
          pageInfo: { hasNextPage: false },
        },
      },
      error: null,
    });

    const result = await listHelpCenters({});

    expect(result.helpCenters).toHaveLength(1);
    expect(result.helpCenters[0]).toEqual({
      id: "hc_123",
      publicName: "Help Center",
      internalName: "Main Help Center",
      description: "Our help center",
      type: "HELP_CENTER",
    });
  });

  it("should handle empty list", async () => {
    mockRawRequest.mockResolvedValue({
      data: {
        helpCenters: {
          edges: [],
          pageInfo: { hasNextPage: false },
        },
      },
      error: null,
    });

    const result = await listHelpCenters({});
    expect(result.helpCenters).toHaveLength(0);
  });

  it("should throw on error", async () => {
    mockRawRequest.mockResolvedValue({
      data: null,
      error: { message: "Unauthorized" },
    });

    await expect(listHelpCenters({})).rejects.toThrow("Failed to list help centers: Unauthorized");
  });
});

describe("getHelpCenter", () => {
  let mockRawRequest: Mock;

  beforeEach(() => {
    mockRawRequest = vi.fn();
    (getPlainClient as Mock).mockReturnValue({ rawRequest: mockRawRequest });
  });

  it("should return help center with articles and groups", async () => {
    const article = createMockArticle();
    mockRawRequest.mockResolvedValue({
      data: {
        helpCenter: {
          ...createMockHelpCenter(),
          articles: { edges: [{ node: article }] },
          articleGroups: { edges: [{ node: { id: "grp_1", name: "Basics" } }] },
        },
      },
      error: null,
    });

    const result = await getHelpCenter({ helpCenterId: "hc_123" });

    expect(result.id).toBe("hc_123");
    expect(result.publicName).toBe("Help Center");
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]!.title).toBe("Getting Started");
    expect(result.articles[0]!.slug).toBe("getting-started");
    expect(result.articleGroups).toHaveLength(1);
    expect(result.articleGroups[0]!.name).toBe("Basics");
  });

  it("should throw when help center not found", async () => {
    mockRawRequest.mockResolvedValue({
      data: { helpCenter: null },
      error: null,
    });

    await expect(getHelpCenter({ helpCenterId: "hc_999" })).rejects.toThrow(
      "Help center not found: hc_999"
    );
  });

  it("should handle help center with no articles", async () => {
    mockRawRequest.mockResolvedValue({
      data: {
        helpCenter: {
          ...createMockHelpCenter(),
          articles: { edges: [] },
          articleGroups: { edges: [] },
        },
      },
      error: null,
    });

    const result = await getHelpCenter({ helpCenterId: "hc_123" });
    expect(result.articles).toHaveLength(0);
    expect(result.articleGroups).toHaveLength(0);
  });

  it("should throw on error", async () => {
    mockRawRequest.mockResolvedValue({
      data: null,
      error: { message: "Server error" },
    });

    await expect(getHelpCenter({ helpCenterId: "hc_123" })).rejects.toThrow(
      "Failed to get help center: Server error"
    );
  });
});

describe("listHelpCenterArticles", () => {
  let mockRawRequest: Mock;

  beforeEach(() => {
    mockRawRequest = vi.fn();
    (getPlainClient as Mock).mockReturnValue({ rawRequest: mockRawRequest });
  });

  it("should return articles with full content", async () => {
    const article = createMockArticle();
    mockRawRequest.mockResolvedValue({
      data: {
        helpCenter: {
          articles: { edges: [{ node: article }] },
        },
      },
      error: null,
    });

    const result = await listHelpCenterArticles({ helpCenterId: "hc_123" });

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]).toEqual({
      id: "art_123",
      title: "Getting Started",
      slug: "getting-started",
      status: "PUBLISHED",
      description: "How to get started",
      contentHtml: "<p>Welcome to our help center</p>",
      articleGroup: { id: "grp_1", name: "Basics" },
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
    });
  });

  it("should use default first of 20", async () => {
    mockRawRequest.mockResolvedValue({
      data: {
        helpCenter: {
          articles: { edges: [] },
        },
      },
      error: null,
    });

    await listHelpCenterArticles({ helpCenterId: "hc_123" });

    expect(mockRawRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { helpCenterId: "hc_123", first: 20 },
      })
    );
  });

  it("should use custom first parameter", async () => {
    mockRawRequest.mockResolvedValue({
      data: {
        helpCenter: {
          articles: { edges: [] },
        },
      },
      error: null,
    });

    await listHelpCenterArticles({ helpCenterId: "hc_123", first: 5 });

    expect(mockRawRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { helpCenterId: "hc_123", first: 5 },
      })
    );
  });

  it("should throw when help center not found", async () => {
    mockRawRequest.mockResolvedValue({
      data: { helpCenter: null },
      error: null,
    });

    await expect(
      listHelpCenterArticles({ helpCenterId: "hc_999" })
    ).rejects.toThrow("Help center not found: hc_999");
  });

  it("should handle article without group", async () => {
    const article = createMockArticle({ articleGroup: null });
    mockRawRequest.mockResolvedValue({
      data: {
        helpCenter: {
          articles: { edges: [{ node: article }] },
        },
      },
      error: null,
    });

    const result = await listHelpCenterArticles({ helpCenterId: "hc_123" });
    expect(result.articles[0]!.articleGroup).toBeUndefined();
  });
});

describe("getHelpCenterArticle", () => {
  let mockRawRequest: Mock;

  beforeEach(() => {
    mockRawRequest = vi.fn();
    (getPlainClient as Mock).mockReturnValue({ rawRequest: mockRawRequest });
  });

  it("should return full article", async () => {
    const article = createMockArticle();
    mockRawRequest.mockResolvedValue({
      data: { helpCenterArticle: article },
      error: null,
    });

    const result = await getHelpCenterArticle({ helpCenterArticleId: "art_123" });

    expect(result.id).toBe("art_123");
    expect(result.title).toBe("Getting Started");
    expect(result.contentHtml).toBe("<p>Welcome to our help center</p>");
    expect(result.createdAt).toBe("2024-01-01T00:00:00Z");
  });

  it("should throw when article not found", async () => {
    mockRawRequest.mockResolvedValue({
      data: { helpCenterArticle: null },
      error: null,
    });

    await expect(
      getHelpCenterArticle({ helpCenterArticleId: "art_999" })
    ).rejects.toThrow("Help center article not found: art_999");
  });

  it("should throw on error", async () => {
    mockRawRequest.mockResolvedValue({
      data: null,
      error: { message: "Not found" },
    });

    await expect(
      getHelpCenterArticle({ helpCenterArticleId: "art_123" })
    ).rejects.toThrow("Failed to get help center article: Not found");
  });
});

describe("getHelpCenterArticleBySlug", () => {
  let mockRawRequest: Mock;

  beforeEach(() => {
    mockRawRequest = vi.fn();
    (getPlainClient as Mock).mockReturnValue({ rawRequest: mockRawRequest });
  });

  it("should return article by slug", async () => {
    const article = createMockArticle();
    mockRawRequest.mockResolvedValue({
      data: { helpCenterArticleBySlug: article },
      error: null,
    });

    const result = await getHelpCenterArticleBySlug({
      helpCenterId: "hc_123",
      slug: "getting-started",
    });

    expect(result.id).toBe("art_123");
    expect(result.slug).toBe("getting-started");
    expect(result.contentHtml).toBe("<p>Welcome to our help center</p>");
  });

  it("should throw when article not found by slug", async () => {
    mockRawRequest.mockResolvedValue({
      data: { helpCenterArticleBySlug: null },
      error: null,
    });

    await expect(
      getHelpCenterArticleBySlug({ helpCenterId: "hc_123", slug: "nonexistent" })
    ).rejects.toThrow("Help center article not found with slug: nonexistent");
  });

  it("should throw on error", async () => {
    mockRawRequest.mockResolvedValue({
      data: null,
      error: { message: "Bad request" },
    });

    await expect(
      getHelpCenterArticleBySlug({ helpCenterId: "hc_123", slug: "test" })
    ).rejects.toThrow("Failed to get help center article by slug: Bad request");
  });
});

describe("upsertHelpCenterArticle", () => {
  let mockRawRequest: Mock;

  // Response shapes for the calls the upsert makes, in order:
  // an optional pre-update read, the mutation, the read-back, the workspace query.
  const articleReadResponse = (article: unknown) => ({
    data: { helpCenterArticle: article },
    error: null,
  });
  const upsertResponse = (article: unknown) => ({
    data: { upsertHelpCenterArticle: { helpCenterArticle: article, error: null } },
    error: null,
  });
  const workspaceResponse = {
    data: { myWorkspace: { id: "ws_456" } },
    error: null,
  };

  const upsertInput = (call: unknown) =>
    (call as [{ variables: { input: Record<string, unknown> } }])[0].variables.input;

  beforeEach(() => {
    mockRawRequest = vi.fn();
    (getPlainClient as Mock).mockReturnValue({ rawRequest: mockRawRequest });
  });

  it("should create a new article as DRAFT and return link", async () => {
    const article = createMockArticle({ status: "DRAFT" });

    // No pre-update read when creating: mutation, read-back, workspace query.
    mockRawRequest.mockResolvedValueOnce(upsertResponse(article));
    mockRawRequest.mockResolvedValueOnce(articleReadResponse(article));
    mockRawRequest.mockResolvedValueOnce(workspaceResponse);

    const result = await upsertHelpCenterArticle({
      helpCenterId: "hc_123",
      title: "Getting Started",
      description: "How to get started",
      contentHtml: "<p>Welcome to our help center</p>",
    });

    expect(result.id).toBe("art_123");
    expect(result.status).toBe("DRAFT");
    expect(result.link).toBe(
      "https://app.plain.com/workspace/ws_456/help-center/hc_123/articles/art_123/"
    );

    expect(mockRawRequest).toHaveBeenCalledTimes(3);
    expect(upsertInput(mockRawRequest.mock.calls[0]!).status).toBe("DRAFT");
  });

  it("should update an existing article", async () => {
    const article = createMockArticle({ status: "DRAFT", title: "Updated Title" });

    mockRawRequest.mockResolvedValueOnce(
      articleReadResponse(createMockArticle({ status: "DRAFT" }))
    );
    mockRawRequest.mockResolvedValueOnce(upsertResponse(article));
    mockRawRequest.mockResolvedValueOnce(articleReadResponse(article));
    mockRawRequest.mockResolvedValueOnce(workspaceResponse);

    const result = await upsertHelpCenterArticle({
      helpCenterId: "hc_123",
      helpCenterArticleId: "art_123",
      title: "Updated Title",
      description: "Updated description",
      contentHtml: "<p>Updated content</p>",
    });

    expect(result.id).toBe("art_123");
    expect(upsertInput(mockRawRequest.mock.calls[1]!).helpCenterArticleId).toBe("art_123");
  });

  it("should keep a published article published and keep its group", async () => {
    const published = createMockArticle({
      status: "PUBLISHED",
      articleGroup: { id: "grp_1", name: "Basics" },
    });

    mockRawRequest.mockResolvedValueOnce(articleReadResponse(published));
    mockRawRequest.mockResolvedValueOnce(upsertResponse(published));
    mockRawRequest.mockResolvedValueOnce(articleReadResponse(published));
    mockRawRequest.mockResolvedValueOnce(workspaceResponse);

    const result = await upsertHelpCenterArticle({
      helpCenterId: "hc_123",
      helpCenterArticleId: "art_123",
      title: "Getting Started",
      description: "How to get started",
      contentHtml: "<p>Updated content</p>",
    });

    const input = upsertInput(mockRawRequest.mock.calls[1]!);
    expect(input.status).toBe("PUBLISHED");
    expect(input.helpCenterArticleGroupId).toBe("grp_1");
    expect(result.status).toBe("PUBLISHED");
    expect(result.articleGroup).toEqual({ id: "grp_1", name: "Basics" });
  });

  it("should let an explicit status win over the fetched one", async () => {
    const published = createMockArticle({ status: "PUBLISHED" });
    const drafted = createMockArticle({ status: "DRAFT" });

    mockRawRequest.mockResolvedValueOnce(articleReadResponse(published));
    mockRawRequest.mockResolvedValueOnce(upsertResponse(drafted));
    mockRawRequest.mockResolvedValueOnce(articleReadResponse(drafted));
    mockRawRequest.mockResolvedValueOnce(workspaceResponse);

    const result = await upsertHelpCenterArticle({
      helpCenterId: "hc_123",
      helpCenterArticleId: "art_123",
      title: "Getting Started",
      description: "How to get started",
      contentHtml: "<p>Updated content</p>",
      status: "DRAFT",
    });

    expect(upsertInput(mockRawRequest.mock.calls[1]!).status).toBe("DRAFT");
    expect(result.status).toBe("DRAFT");
  });

  it("should let an explicit group win over the fetched one", async () => {
    const existing = createMockArticle({ articleGroup: { id: "grp_1", name: "Basics" } });
    const moved = createMockArticle({ articleGroup: { id: "grp_2", name: "Advanced" } });

    mockRawRequest.mockResolvedValueOnce(articleReadResponse(existing));
    mockRawRequest.mockResolvedValueOnce(upsertResponse(moved));
    mockRawRequest.mockResolvedValueOnce(articleReadResponse(moved));
    mockRawRequest.mockResolvedValueOnce(workspaceResponse);

    const result = await upsertHelpCenterArticle({
      helpCenterId: "hc_123",
      helpCenterArticleId: "art_123",
      title: "Getting Started",
      description: "How to get started",
      contentHtml: "<p>Updated content</p>",
      helpCenterArticleGroupId: "grp_2",
    });

    expect(upsertInput(mockRawRequest.mock.calls[1]!).helpCenterArticleGroupId).toBe("grp_2");
    expect(result.articleGroup).toEqual({ id: "grp_2", name: "Advanced" });
  });

  it("should keep the existing slug when the update omits it", async () => {
    const existing = createMockArticle({ slug: "getting-started-abc123" });

    mockRawRequest.mockResolvedValueOnce(articleReadResponse(existing));
    mockRawRequest.mockResolvedValueOnce(upsertResponse(existing));
    mockRawRequest.mockResolvedValueOnce(articleReadResponse(existing));
    mockRawRequest.mockResolvedValueOnce(workspaceResponse);

    const result = await upsertHelpCenterArticle({
      helpCenterId: "hc_123",
      helpCenterArticleId: "art_123",
      title: "A Completely Different Title",
      description: "How to get started",
      contentHtml: "<p>Updated content</p>",
    });

    expect(upsertInput(mockRawRequest.mock.calls[1]!).slug).toBe("getting-started-abc123");
    expect(result.slug).toBe("getting-started-abc123");
  });

  it("should let an explicit slug win over the fetched one", async () => {
    const existing = createMockArticle({ slug: "getting-started-abc123" });
    const renamed = createMockArticle({ slug: "new-slug" });

    mockRawRequest.mockResolvedValueOnce(articleReadResponse(existing));
    mockRawRequest.mockResolvedValueOnce(upsertResponse(renamed));
    mockRawRequest.mockResolvedValueOnce(articleReadResponse(renamed));
    mockRawRequest.mockResolvedValueOnce(workspaceResponse);

    const result = await upsertHelpCenterArticle({
      helpCenterId: "hc_123",
      helpCenterArticleId: "art_123",
      title: "Getting Started",
      description: "How to get started",
      contentHtml: "<p>Updated content</p>",
      slug: "new-slug",
    });

    expect(upsertInput(mockRawRequest.mock.calls[1]!).slug).toBe("new-slug");
    expect(result.slug).toBe("new-slug");
  });

  it("should not send a slug when creating without one", async () => {
    const article = createMockArticle({ status: "DRAFT" });

    mockRawRequest.mockResolvedValueOnce(upsertResponse(article));
    mockRawRequest.mockResolvedValueOnce(articleReadResponse(article));
    mockRawRequest.mockResolvedValueOnce(workspaceResponse);

    await upsertHelpCenterArticle({
      helpCenterId: "hc_123",
      title: "Getting Started",
      description: "How to get started",
      contentHtml: "<p>Welcome to our help center</p>",
    });

    expect(upsertInput(mockRawRequest.mock.calls[0]!)).not.toHaveProperty("slug");
  });

  it("should omit the group when the article has none and none was passed", async () => {
    const ungrouped = createMockArticle({ articleGroup: null });

    mockRawRequest.mockResolvedValueOnce(articleReadResponse(ungrouped));
    mockRawRequest.mockResolvedValueOnce(upsertResponse(ungrouped));
    mockRawRequest.mockResolvedValueOnce(articleReadResponse(ungrouped));
    mockRawRequest.mockResolvedValueOnce(workspaceResponse);

    await upsertHelpCenterArticle({
      helpCenterId: "hc_123",
      helpCenterArticleId: "art_123",
      title: "Getting Started",
      description: "How to get started",
      contentHtml: "<p>Updated content</p>",
    });

    expect(upsertInput(mockRawRequest.mock.calls[1]!)).not.toHaveProperty(
      "helpCenterArticleGroupId"
    );
  });

  it("should fall back to DRAFT when the pre-update read fails", async () => {
    const article = createMockArticle({ status: "DRAFT" });

    mockRawRequest.mockResolvedValueOnce({ data: null, error: { message: "Read failed" } });
    mockRawRequest.mockResolvedValueOnce(upsertResponse(article));
    mockRawRequest.mockResolvedValueOnce(articleReadResponse(article));
    mockRawRequest.mockResolvedValueOnce(workspaceResponse);

    await upsertHelpCenterArticle({
      helpCenterId: "hc_123",
      helpCenterArticleId: "art_123",
      title: "Getting Started",
      description: "How to get started",
      contentHtml: "<p>Updated content</p>",
    });

    expect(upsertInput(mockRawRequest.mock.calls[1]!).status).toBe("DRAFT");
  });

  it("should return the status and group read back after the write", async () => {
    const mutated = createMockArticle({ status: "DRAFT", articleGroup: null });
    const readBack = createMockArticle({
      status: "PUBLISHED",
      articleGroup: { id: "grp_1", name: "Basics" },
    });

    mockRawRequest.mockResolvedValueOnce(articleReadResponse(readBack));
    mockRawRequest.mockResolvedValueOnce(upsertResponse(mutated));
    mockRawRequest.mockResolvedValueOnce(articleReadResponse(readBack));
    mockRawRequest.mockResolvedValueOnce(workspaceResponse);

    const result = await upsertHelpCenterArticle({
      helpCenterId: "hc_123",
      helpCenterArticleId: "art_123",
      title: "Getting Started",
      description: "How to get started",
      contentHtml: "<p>Updated content</p>",
    });

    expect(result.status).toBe("PUBLISHED");
    expect(result.articleGroup).toEqual({ id: "grp_1", name: "Basics" });
  });

  it("should fall back to the mutation result when the read-back fails", async () => {
    const article = createMockArticle({ status: "DRAFT" });

    mockRawRequest.mockResolvedValueOnce(upsertResponse(article));
    mockRawRequest.mockResolvedValueOnce({ data: null, error: { message: "Read failed" } });
    mockRawRequest.mockResolvedValueOnce(workspaceResponse);

    const result = await upsertHelpCenterArticle({
      helpCenterId: "hc_123",
      title: "Getting Started",
      description: "How to get started",
      contentHtml: "<p>Welcome to our help center</p>",
    });

    expect(result.id).toBe("art_123");
    expect(result.status).toBe("DRAFT");
  });

  it("should include optional fields when provided", async () => {
    const article = createMockArticle({ status: "DRAFT" });

    mockRawRequest.mockResolvedValueOnce(upsertResponse(article));
    mockRawRequest.mockResolvedValueOnce(articleReadResponse(article));
    mockRawRequest.mockResolvedValueOnce(workspaceResponse);

    await upsertHelpCenterArticle({
      helpCenterId: "hc_123",
      title: "Test",
      contentHtml: "<p>Test</p>",
      description: "A test article",
      slug: "test-article",
      helpCenterArticleGroupId: "grp_1",
    });

    const input = upsertInput(mockRawRequest.mock.calls[0]!);
    expect(input.description).toBe("A test article");
    expect(input.slug).toBe("test-article");
    expect(input.helpCenterArticleGroupId).toBe("grp_1");
  });

  it("should omit link when workspace query fails", async () => {
    const article = createMockArticle({ status: "DRAFT" });

    mockRawRequest.mockResolvedValueOnce(upsertResponse(article));
    mockRawRequest.mockResolvedValueOnce(articleReadResponse(article));
    mockRawRequest.mockResolvedValueOnce({
      data: null,
      error: { message: "Workspace error" },
    });

    const result = await upsertHelpCenterArticle({
      helpCenterId: "hc_123",
      title: "Test",
      description: "Test desc",
      contentHtml: "<p>Test</p>",
    });

    expect(result.link).toBeUndefined();
  });

  it("should throw on mutation error with field details", async () => {
    mockRawRequest.mockResolvedValue({
      data: {
        upsertHelpCenterArticle: {
          helpCenterArticle: null,
          error: {
            message: "Validation failed",
            type: "VALIDATION",
            code: "invalid_input",
            fields: [
              { field: "title", message: "is required", type: "VALIDATION" },
            ],
          },
        },
      },
      error: null,
    });

    await expect(
      upsertHelpCenterArticle({
        helpCenterId: "hc_123",
        title: "",
        description: "Test desc",
        contentHtml: "<p>Test</p>",
      })
    ).rejects.toThrow("Failed to upsert article: Validation failed (title: is required)");
  });

  it("should throw on rawRequest error", async () => {
    mockRawRequest.mockResolvedValue({
      data: null,
      error: { message: "Network error" },
    });

    await expect(
      upsertHelpCenterArticle({
        helpCenterId: "hc_123",
        title: "Test",
        description: "Test desc",
        contentHtml: "<p>Test</p>",
      })
    ).rejects.toThrow("Failed to upsert help center article: Network error");
  });
});

describe("createHelpCenterArticleGroup", () => {
  let mockRawRequest: Mock;

  beforeEach(() => {
    mockRawRequest = vi.fn();
    (getPlainClient as Mock).mockReturnValue({ rawRequest: mockRawRequest });
  });

  it("should create an article group", async () => {
    mockRawRequest.mockResolvedValue({
      data: {
        createHelpCenterArticleGroup: {
          helpCenterArticleGroup: { id: "grp_new", name: "New Group" },
          error: null,
        },
      },
      error: null,
    });

    const result = await createHelpCenterArticleGroup({
      helpCenterId: "hc_123",
      name: "New Group",
    });

    expect(result).toEqual({ id: "grp_new", name: "New Group" });
  });

  it("should pass parent group ID when provided", async () => {
    mockRawRequest.mockResolvedValue({
      data: {
        createHelpCenterArticleGroup: {
          helpCenterArticleGroup: { id: "grp_child", name: "Child Group" },
          error: null,
        },
      },
      error: null,
    });

    await createHelpCenterArticleGroup({
      helpCenterId: "hc_123",
      name: "Child Group",
      parentHelpCenterArticleGroupId: "grp_parent",
    });

    const call = mockRawRequest.mock.calls[0]!;
    expect(call![0]!.variables.input.parentHelpCenterArticleGroupId).toBe("grp_parent");
  });

  it("should throw on mutation error", async () => {
    mockRawRequest.mockResolvedValue({
      data: {
        createHelpCenterArticleGroup: {
          helpCenterArticleGroup: null,
          error: {
            message: "Name already exists",
            type: "VALIDATION",
            code: "duplicate",
            fields: [],
          },
        },
      },
      error: null,
    });

    await expect(
      createHelpCenterArticleGroup({ helpCenterId: "hc_123", name: "Existing" })
    ).rejects.toThrow("Failed to create article group: Name already exists");
  });

  it("should throw on rawRequest error", async () => {
    mockRawRequest.mockResolvedValue({
      data: null,
      error: { message: "Server error" },
    });

    await expect(
      createHelpCenterArticleGroup({ helpCenterId: "hc_123", name: "Test" })
    ).rejects.toThrow("Failed to create article group: Server error");
  });
});

describe("deleteHelpCenterArticleGroup", () => {
  let mockRawRequest: Mock;

  beforeEach(() => {
    mockRawRequest = vi.fn();
    (getPlainClient as Mock).mockReturnValue({ rawRequest: mockRawRequest });
  });

  it("should delete an article group", async () => {
    mockRawRequest.mockResolvedValue({
      data: {
        deleteHelpCenterArticleGroup: { error: null },
      },
      error: null,
    });

    const result = await deleteHelpCenterArticleGroup({
      helpCenterArticleGroupId: "grp_123",
    });

    expect(result).toEqual({ success: true });
  });

  it("should throw on mutation error", async () => {
    mockRawRequest.mockResolvedValue({
      data: {
        deleteHelpCenterArticleGroup: {
          error: {
            message: "Group is not empty",
            type: "VALIDATION",
            code: "not_empty",
          },
        },
      },
      error: null,
    });

    await expect(
      deleteHelpCenterArticleGroup({ helpCenterArticleGroupId: "grp_123" })
    ).rejects.toThrow("Failed to delete article group: Group is not empty");
  });

  it("should throw on rawRequest error", async () => {
    mockRawRequest.mockResolvedValue({
      data: null,
      error: { message: "Network error" },
    });

    await expect(
      deleteHelpCenterArticleGroup({ helpCenterArticleGroupId: "grp_123" })
    ).rejects.toThrow("Failed to delete article group: Network error");
  });
});
