import { getPlainClient } from "../client.js";
import type {
  ListHelpCentersInput,
  GetHelpCenterInput,
  ListHelpCenterArticlesInput,
  GetHelpCenterArticleInput,
  GetHelpCenterArticleBySlugInput,
  UpsertHelpCenterArticleInput,
  CreateHelpCenterArticleGroupInput,
  DeleteHelpCenterArticleGroupInput,
} from "../types.js";

// --- GraphQL Queries ---

const LIST_HELP_CENTERS_QUERY = `
  query ListHelpCenters($first: Int, $after: String) {
    helpCenters(first: $first, after: $after) {
      edges {
        node {
          id
          publicName
          internalName
          description
          type
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const GET_HELP_CENTER_QUERY = `
  query GetHelpCenter($helpCenterId: ID!) {
    helpCenter(id: $helpCenterId) {
      id
      publicName
      internalName
      description
      type
      articles(first: 100) {
        edges {
          node {
            id
            title
            slug
            status
            description
            articleGroup {
              id
              name
            }
          }
        }
      }
      articleGroups(first: 50) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  }
`;

const LIST_HELP_CENTER_ARTICLES_QUERY = `
  query ListHelpCenterArticles($helpCenterId: ID!, $first: Int) {
    helpCenter(id: $helpCenterId) {
      articles(first: $first) {
        edges {
          node {
            id
            title
            slug
            status
            description
            contentHtml
            articleGroup {
              id
              name
            }
            createdAt { iso8601 }
            updatedAt { iso8601 }
          }
        }
      }
    }
  }
`;

const GET_HELP_CENTER_ARTICLE_QUERY = `
  query GetHelpCenterArticle($helpCenterArticleId: ID!) {
    helpCenterArticle(id: $helpCenterArticleId) {
      id
      title
      slug
      status
      description
      contentHtml
      articleGroup {
        id
        name
      }
      createdAt { iso8601 }
      updatedAt { iso8601 }
    }
  }
`;

const GET_HELP_CENTER_ARTICLE_BY_SLUG_QUERY = `
  query GetHelpCenterArticleBySlug($helpCenterId: ID!, $slug: String!) {
    helpCenterArticleBySlug(helpCenterId: $helpCenterId, slug: $slug) {
      id
      title
      slug
      status
      description
      contentHtml
      articleGroup {
        id
        name
      }
      createdAt { iso8601 }
      updatedAt { iso8601 }
    }
  }
`;

const UPSERT_HELP_CENTER_ARTICLE_MUTATION = `
  mutation UpsertHelpCenterArticle($input: UpsertHelpCenterArticleInput!) {
    upsertHelpCenterArticle(input: $input) {
      helpCenterArticle {
        id
        title
        slug
        status
        description
        contentHtml
        articleGroup {
          id
          name
        }
        createdAt { iso8601 }
        updatedAt { iso8601 }
      }
      error {
        message
        type
        code
        fields {
          field
          message
          type
        }
      }
    }
  }
`;

const CREATE_HELP_CENTER_ARTICLE_GROUP_MUTATION = `
  mutation CreateHelpCenterArticleGroup($input: CreateHelpCenterArticleGroupInput!) {
    createHelpCenterArticleGroup(input: $input) {
      helpCenterArticleGroup {
        id
        name
      }
      error {
        message
        type
        code
        fields {
          field
          message
          type
        }
      }
    }
  }
`;

const DELETE_HELP_CENTER_ARTICLE_GROUP_MUTATION = `
  mutation DeleteHelpCenterArticleGroup($input: DeleteHelpCenterArticleGroupInput!) {
    deleteHelpCenterArticleGroup(input: $input) {
      error {
        message
        type
        code
        fields {
          field
          message
          type
        }
      }
    }
  }
`;

const MY_WORKSPACE_QUERY = `
  query MyWorkspace {
    myWorkspace {
      id
    }
  }
`;

// --- Raw response types ---

interface RawHelpCenter {
  id: string;
  publicName: string;
  internalName: string;
  description?: string;
  type: string;
  articles?: {
    edges: Array<{
      node: RawArticleSummary | RawArticleFull;
    }>;
  };
  articleGroups?: {
    edges: Array<{
      node: { id: string; name: string };
    }>;
  };
}

interface RawArticleSummary {
  id: string;
  title: string;
  slug: string;
  status: string;
  description?: string;
  articleGroup?: { id: string; name: string } | null;
}

interface RawArticleFull extends RawArticleSummary {
  contentHtml: string;
  createdAt: { iso8601: string };
  updatedAt: { iso8601: string };
}

// --- Tool implementations ---

export const listHelpCenters = async (_input: ListHelpCentersInput) => {
  const client = getPlainClient();

  const result = await client.rawRequest({
    query: LIST_HELP_CENTERS_QUERY,
    variables: { first: 25 },
  });

  if (result.error) {
    throw new Error(`Failed to list help centers: ${result.error.message}`);
  }

  const data = result.data as {
    helpCenters: {
      edges: Array<{ node: RawHelpCenter }>;
      pageInfo: { hasNextPage: boolean; endCursor?: string };
    };
  };

  return {
    helpCenters: data.helpCenters.edges.map((edge) => ({
      id: edge.node.id,
      publicName: edge.node.publicName,
      internalName: edge.node.internalName,
      description: edge.node.description ?? undefined,
      type: edge.node.type,
    })),
    pageInfo: data.helpCenters.pageInfo,
  };
};

export const getHelpCenter = async (input: GetHelpCenterInput) => {
  const client = getPlainClient();

  const result = await client.rawRequest({
    query: GET_HELP_CENTER_QUERY,
    variables: { helpCenterId: input.helpCenterId },
  });

  if (result.error) {
    throw new Error(`Failed to get help center: ${result.error.message}`);
  }

  const data = result.data as { helpCenter: RawHelpCenter | null };
  const hc = data.helpCenter;
  if (!hc) {
    throw new Error(`Help center not found: ${input.helpCenterId}`);
  }

  return {
    id: hc.id,
    publicName: hc.publicName,
    internalName: hc.internalName,
    description: hc.description ?? undefined,
    type: hc.type,
    articles: (hc.articles?.edges ?? []).map((edge) => ({
      id: edge.node.id,
      title: edge.node.title,
      slug: edge.node.slug,
      status: edge.node.status,
      description: edge.node.description ?? undefined,
      articleGroup: edge.node.articleGroup ?? undefined,
    })),
    articleGroups: (hc.articleGroups?.edges ?? []).map((edge) => ({
      id: edge.node.id,
      name: edge.node.name,
    })),
  };
};

export const listHelpCenterArticles = async (input: ListHelpCenterArticlesInput) => {
  const client = getPlainClient();

  const result = await client.rawRequest({
    query: LIST_HELP_CENTER_ARTICLES_QUERY,
    variables: {
      helpCenterId: input.helpCenterId,
      first: input.first ?? 20,
    },
  });

  if (result.error) {
    throw new Error(`Failed to list help center articles: ${result.error.message}`);
  }

  const data = result.data as { helpCenter: RawHelpCenter | null };
  const hc = data.helpCenter;
  if (!hc) {
    throw new Error(`Help center not found: ${input.helpCenterId}`);
  }

  return {
    articles: (hc.articles?.edges ?? []).map((edge) => {
      const node = edge.node as RawArticleFull;
      return {
        id: node.id,
        title: node.title,
        slug: node.slug,
        status: node.status,
        description: node.description ?? undefined,
        contentHtml: node.contentHtml,
        articleGroup: node.articleGroup ?? undefined,
        createdAt: node.createdAt.iso8601,
        updatedAt: node.updatedAt.iso8601,
      };
    }),
  };
};

export const getHelpCenterArticle = async (input: GetHelpCenterArticleInput) => {
  const client = getPlainClient();

  const result = await client.rawRequest({
    query: GET_HELP_CENTER_ARTICLE_QUERY,
    variables: { helpCenterArticleId: input.helpCenterArticleId },
  });

  if (result.error) {
    throw new Error(`Failed to get help center article: ${result.error.message}`);
  }

  const data = result.data as { helpCenterArticle: RawArticleFull | null };
  const article = data.helpCenterArticle;
  if (!article) {
    throw new Error(`Help center article not found: ${input.helpCenterArticleId}`);
  }

  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    status: article.status,
    description: article.description ?? undefined,
    contentHtml: article.contentHtml,
    articleGroup: article.articleGroup ?? undefined,
    createdAt: article.createdAt.iso8601,
    updatedAt: article.updatedAt.iso8601,
  };
};

export const getHelpCenterArticleBySlug = async (input: GetHelpCenterArticleBySlugInput) => {
  const client = getPlainClient();

  const result = await client.rawRequest({
    query: GET_HELP_CENTER_ARTICLE_BY_SLUG_QUERY,
    variables: {
      helpCenterId: input.helpCenterId,
      slug: input.slug,
    },
  });

  if (result.error) {
    throw new Error(`Failed to get help center article by slug: ${result.error.message}`);
  }

  const data = result.data as { helpCenterArticleBySlug: RawArticleFull | null };
  const article = data.helpCenterArticleBySlug;
  if (!article) {
    throw new Error(`Help center article not found with slug: ${input.slug}`);
  }

  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    status: article.status,
    description: article.description ?? undefined,
    contentHtml: article.contentHtml,
    articleGroup: article.articleGroup ?? undefined,
    createdAt: article.createdAt.iso8601,
    updatedAt: article.updatedAt.iso8601,
  };
};

export const upsertHelpCenterArticle = async (input: UpsertHelpCenterArticleInput) => {
  const client = getPlainClient();

  const variables: Record<string, unknown> = {
    helpCenterId: input.helpCenterId,
    title: input.title,
    contentHtml: input.contentHtml,
    description: input.description,
    status: "DRAFT", // Always force DRAFT
  };

  if (input.helpCenterArticleId) {
    variables.helpCenterArticleId = input.helpCenterArticleId;
  }
  if (input.slug !== undefined) {
    variables.slug = input.slug;
  }
  // Only set group when creating, not when updating (to preserve existing group)
  if (input.helpCenterArticleGroupId !== undefined && !input.helpCenterArticleId) {
    variables.helpCenterArticleGroupId = input.helpCenterArticleGroupId;
  }

  const result = await client.rawRequest({
    query: UPSERT_HELP_CENTER_ARTICLE_MUTATION,
    variables: { input: variables },
  });

  if (result.error) {
    throw new Error(`Failed to upsert help center article: ${result.error.message}`);
  }

  const data = result.data as {
    upsertHelpCenterArticle: {
      helpCenterArticle: RawArticleFull | null;
      error: { message: string; type: string; code: string; fields?: Array<{ field: string; message: string; type: string }> } | null;
    };
  };

  const mutationResult = data.upsertHelpCenterArticle;
  if (mutationResult.error) {
    const fieldErrors = mutationResult.error.fields
      ?.map((f) => `${f.field}: ${f.message}`)
      .join(", ");
    throw new Error(
      `Failed to upsert article: ${mutationResult.error.message}${fieldErrors ? ` (${fieldErrors})` : ""}`
    );
  }

  const article = mutationResult.helpCenterArticle!;

  // Fetch workspace ID for the UI link
  const workspaceResult = await client.rawRequest({
    query: MY_WORKSPACE_QUERY,
    variables: {},
  });

  let link: string | undefined;
  if (!workspaceResult.error) {
    const wsData = workspaceResult.data as { myWorkspace: { id: string } };
    const workspaceId = wsData.myWorkspace.id;
    link = `https://app.plain.com/workspace/${workspaceId}/help-center/${input.helpCenterId}/articles/${article.id}/`;
  }

  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    status: article.status,
    description: article.description ?? undefined,
    contentHtml: article.contentHtml,
    articleGroup: article.articleGroup ?? undefined,
    createdAt: article.createdAt.iso8601,
    updatedAt: article.updatedAt.iso8601,
    ...(link ? { link } : {}),
  };
};

export const createHelpCenterArticleGroup = async (input: CreateHelpCenterArticleGroupInput) => {
  const client = getPlainClient();

  const variables: Record<string, unknown> = {
    helpCenterId: input.helpCenterId,
    name: input.name,
  };

  if (input.parentHelpCenterArticleGroupId !== undefined) {
    variables.parentHelpCenterArticleGroupId = input.parentHelpCenterArticleGroupId;
  }

  const result = await client.rawRequest({
    query: CREATE_HELP_CENTER_ARTICLE_GROUP_MUTATION,
    variables: { input: variables },
  });

  if (result.error) {
    throw new Error(`Failed to create article group: ${result.error.message}`);
  }

  const data = result.data as {
    createHelpCenterArticleGroup: {
      helpCenterArticleGroup: { id: string; name: string } | null;
      error: { message: string; type: string; code: string; fields?: Array<{ field: string; message: string; type: string }> } | null;
    };
  };

  const mutationResult = data.createHelpCenterArticleGroup;
  if (mutationResult.error) {
    const fieldErrors = mutationResult.error.fields
      ?.map((f) => `${f.field}: ${f.message}`)
      .join(", ");
    throw new Error(
      `Failed to create article group: ${mutationResult.error.message}${fieldErrors ? ` (${fieldErrors})` : ""}`
    );
  }

  return {
    id: mutationResult.helpCenterArticleGroup!.id,
    name: mutationResult.helpCenterArticleGroup!.name,
  };
};

export const deleteHelpCenterArticleGroup = async (input: DeleteHelpCenterArticleGroupInput) => {
  const client = getPlainClient();

  const result = await client.rawRequest({
    query: DELETE_HELP_CENTER_ARTICLE_GROUP_MUTATION,
    variables: {
      input: { helpCenterArticleGroupId: input.helpCenterArticleGroupId },
    },
  });

  if (result.error) {
    throw new Error(`Failed to delete article group: ${result.error.message}`);
  }

  const data = result.data as {
    deleteHelpCenterArticleGroup: {
      error: { message: string; type: string; code: string; fields?: Array<{ field: string; message: string; type: string }> } | null;
    };
  };

  const mutationResult = data.deleteHelpCenterArticleGroup;
  if (mutationResult.error) {
    throw new Error(`Failed to delete article group: ${mutationResult.error.message}`);
  }

  return { success: true as const };
};
