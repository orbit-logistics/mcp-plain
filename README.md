# @orbit-logistics/mcp-plain

MCP server for the [Plain](https://plain.com) customer support platform. Provides tools for managing threads, help center articles, and more via the [Model Context Protocol](https://modelcontextprotocol.io).

## Setup

### With Claude Code

Add to your project's `.claude/settings.json`:

```json
{
  "mcpServers": {
    "plain": {
      "command": "npx",
      "args": ["-y", "@orbit-logistics/mcp-plain@latest"],
      "env": {
        "PLAIN_API_KEY": "${PLAIN_API_KEY}"
      }
    }
  }
}
```

Then set `PLAIN_API_KEY` in your shell environment (e.g. `.zshrc`, `.envrc`, or a secrets manager).

### With other MCP clients

Run the server directly:

```bash
PLAIN_API_KEY=plainApiKey_xxx npx @orbit-logistics/mcp-plain@latest
```

## Tools

> **Note:** This server does not cover the full Plain API — only the endpoints we actively use. If you need additional methods, PRs are welcome!

### Threads
- `list_threads` - List threads with filters (status, priority, labels, customer, tenant)
- `get_thread` - Get full thread details by ID (includes timeline)
- `get_thread_by_ref` - Get thread by reference number (e.g. T-510)
- `get_thread_fields` - Get custom field values for a thread
- `create_thread` - Create a new thread (auto-creates customer by email if needed)
- `reply_to_thread` - Send a reply through the original channel
- `mark_thread_as_done` - Mark a thread as resolved
- `upsert_thread_field` - Set/update custom field values
- `add_internal_note` - Post an internal note (not visible to customer)
- `add_labels` - Add category labels to a thread
- `get_label_types` - List available label types

### Attachments
- `get_attachment_download_url` - Get a temporary download URL
- `get_attachment_content` - Fetch attachment content (text or base64)

### Help Center
- `list_help_centers` - List all help centers
- `get_help_center` - Get help center structure (groups and articles)
- `list_help_center_articles` - List articles with full content
- `get_help_center_article` - Get article by ID
- `get_help_center_article_by_slug` - Get article by URL slug
- `upsert_help_center_article` - Create or update an article (always saves as DRAFT)
- `create_help_center_article_group` - Create an article group
- `delete_help_center_article_group` - Delete an empty article group

## Development

```bash
pnpm install
pnpm test
pnpm build
```

## License

MIT
