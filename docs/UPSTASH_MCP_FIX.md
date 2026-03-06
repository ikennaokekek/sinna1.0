# Upstash MCP Bug Fix - Integration Guide

## Overview

This document describes the local fix for the bug in `@upstash/mcp-server`'s `redis_database_list_databases` tool.

**Bug:** The MCP tool returns only a note string instead of the actual database list.  
**Issue:** https://github.com/upstash/mcp-server/issues/13  
**Status:** Fixed locally with utility module

## Solution

We've created a utility module (`apps/api/src/lib/upstash-mcp-fix.ts`) that bypasses the buggy MCP tool and calls the Upstash Management API directly.

## Usage

### Basic Usage

```typescript
import { listUpstashDatabases, formatDatabaseList } from '@/lib/upstash-mcp-fix';

// List all databases
const databases = await listUpstashDatabases();
if (databases) {
  console.log(`Found ${databases.length} database(s)`);
  
  // Format for display
  const formatted = formatDatabaseList(databases);
  console.log(formatted);
}
```

### Find Database by Name

```typescript
import { getDatabaseByName } from '@/lib/upstash-mcp-fix';

const db = await getDatabaseByName('SINNA1.0UPDATED27.12.25');
if (db) {
  console.log(`Found: ${db.database_name} (ID: ${db.database_id})`);
}
```

### Find Database by ID

```typescript
import { getDatabaseById } from '@/lib/upstash-mcp-fix';

const db = await getDatabaseById('ee452215-e9f0-46c6-9862-81895b612aa3');
if (db) {
  console.log(`Found: ${db.database_name}`);
}
```

## API Reference

### `listUpstashDatabases()`

Lists all Upstash Redis databases.

**Returns:** `Promise<UpstashDatabase[] | null>`

- Returns array of database objects on success
- Returns `null` on error (credentials not found, API error, etc.)

**Example:**
```typescript
const databases = await listUpstashDatabases();
if (databases) {
  databases.forEach(db => {
    console.log(`${db.database_name}: ${db.database_id}`);
  });
}
```

### `formatDatabaseList(databases: UpstashDatabase[])`

Formats database list for human-readable display.

**Parameters:**
- `databases`: Array of database objects

**Returns:** `string` - Formatted string with database details

**Example:**
```typescript
const databases = await listUpstashDatabases();
if (databases) {
  console.log(formatDatabaseList(databases));
}
```

### `getDatabaseByName(name: string)`

Finds a database by name (case-insensitive).

**Parameters:**
- `name`: Database name to search for

**Returns:** `Promise<UpstashDatabase | null>`

**Example:**
```typescript
const db = await getDatabaseByName('my-database');
if (db) {
  console.log(`Found: ${db.database_id}`);
}
```

### `getDatabaseById(id: string)`

Finds a database by ID.

**Parameters:**
- `id`: Database ID to search for

**Returns:** `Promise<UpstashDatabase | null>`

**Example:**
```typescript
const db = await getDatabaseById('ee452215-e9f0-46c6-9862-81895b612aa3');
if (db) {
  console.log(`Found: ${db.database_name}`);
}
```

## Type Definitions

```typescript
interface UpstashDatabase {
  database_id: string;
  database_name: string;
  database_type?: string;
  region?: string;
  primary_region?: string;
  state?: string;
  endpoint?: string;
  type?: string;
  [key: string]: any; // Other fields from API
}
```

## How It Works

1. **Reads credentials** from `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global)
2. **Extracts** email and API key from the Upstash MCP server configuration
3. **Calls Upstash API** directly using Basic Auth (`email:apiKey` base64 encoded)
4. **Returns** properly formatted database list

## Credentials

The utility automatically reads credentials from your MCP configuration file:

**Project-level:** `.cursor/mcp.json`  
**Global:** `~/.cursor/mcp.json`

It looks for:
```json
{
  "mcpServers": {
    "upstash": {
      "args": [
        "--email",
        "your-email@example.com",
        "--api-key",
        "your-api-key"
      ]
    }
  }
}
```

## Error Handling

All functions return `null` on error. Check the return value:

```typescript
const databases = await listUpstashDatabases();
if (databases === null) {
  // Handle error:
  // - Credentials not found in MCP config
  // - API authentication failed
  // - Network error
  // - Invalid response format
  console.error('Failed to list databases');
  return;
}

// Use databases...
```

## Testing

Run the integration test:

```bash
npx tsx scripts/test-upstash-fix-integration.ts
```

This tests:
- ✅ Listing databases
- ✅ Formatting database list
- ✅ Finding database by name
- ✅ Finding database by ID

## Migration from MCP Tool

**Before (buggy MCP tool):**
```typescript
// This returns only a note string, not database list
const result = await call_mcp_tool(
  'project-0-SINNA1.0-upstash',
  'redis_database_list_databases',
  {}
);
// result = "NOTE: If the user wants to see dbs in another team..."
```

**After (using fix utility):**
```typescript
import { listUpstashDatabases } from '@/lib/upstash-mcp-fix';

const databases = await listUpstashDatabases();
// databases = [{ database_id: '...', database_name: '...', ... }]
```

## When to Remove This Fix

Once the upstream bug is fixed in `@upstash/mcp-server`, you can:

1. **Monitor the GitHub issue:** https://github.com/upstash/mcp-server/issues/13
2. **Test the fix:** Update `@upstash/mcp-server` and test `redis_database_list_databases`
3. **Remove this utility:** If the MCP tool works correctly, you can remove `apps/api/src/lib/upstash-mcp-fix.ts`
4. **Update code:** Replace calls to this utility with the MCP tool

## Related Files

- **Utility:** `apps/api/src/lib/upstash-mcp-fix.ts`
- **Tests:** `apps/api/src/lib/upstash-mcp-fix.test.ts`
- **Integration Test:** `scripts/test-upstash-fix-integration.ts`
- **Bug Report:** `UPSTASH_MCP_BUG_REPORT.md`
- **GitHub Issue:** https://github.com/upstash/mcp-server/issues/13
