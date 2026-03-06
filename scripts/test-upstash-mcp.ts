#!/usr/bin/env tsx
/**
 * Documents the Upstash MCP redis_database_list_databases bug.
 * Use scripts/upstash-list-databases-workaround.ts or apps/api/src/lib/upstash-mcp-fix.ts for working list.
 * Bug: https://github.com/upstash/mcp-server/issues/13
 */

console.log('Upstash MCP Bug (redis_database_list_databases):');
console.log('  The MCP tool returns only a note string instead of the database list.');
console.log('  Use: pnpm upstash:list  or  import { listUpstashDatabases } from "@/lib/upstash-mcp-fix"');
console.log('  See: docs/UPSTASH_MCP_FIX.md');
