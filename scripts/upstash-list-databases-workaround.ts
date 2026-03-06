#!/usr/bin/env tsx
/**
 * Workaround for Upstash MCP redis_database_list_databases bug
 *
 * Uses the shared utility to list databases via direct API call.
 * Bug: https://github.com/upstash/mcp-server/issues/13
 *
 * Usage: pnpm upstash:list  or  npx tsx scripts/upstash-list-databases-workaround.ts
 */

import {
  listUpstashDatabases,
  formatDatabaseList
} from '../apps/api/src/lib/upstash-mcp-fix';

async function main() {
  console.log('🔧 Upstash List Databases (workaround)\n');

  const databases = await listUpstashDatabases();

  if (databases === null) {
    console.error('❌ Failed to list databases. Check .cursor/mcp.json has Upstash email and api-key.');
    process.exit(1);
  }

  if (databases.length === 0) {
    console.log('📭 No databases found');
    return;
  }

  console.log(formatDatabaseList(databases));
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
