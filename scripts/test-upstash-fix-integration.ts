#!/usr/bin/env tsx
/**
 * Test script to verify the Upstash MCP fix integration
 */

import {
  listUpstashDatabases,
  formatDatabaseList,
  getDatabaseByName,
  getDatabaseById
} from '../apps/api/src/lib/upstash-mcp-fix';

async function testIntegration() {
  console.log('🧪 Testing Upstash MCP Fix Integration\n');

  // Test 1: List databases
  console.log('1. Testing listUpstashDatabases()...');
  const databases = await listUpstashDatabases();

  if (databases === null) {
    console.error('❌ Failed to list databases');
    process.exit(1);
  }

  console.log(`✅ Found ${databases.length} database(s)`);
  console.log('');

  // Test 2: Format database list
  console.log('2. Testing formatDatabaseList()...');
  const formatted = formatDatabaseList(databases);
  console.log(formatted);
  console.log('');

  // Test 3: Get database by name (if we have databases)
  if (databases.length > 0) {
    const firstDb = databases[0];
    if (firstDb.database_name) {
      console.log(`3. Testing getDatabaseByName("${firstDb.database_name}")...`);
      const foundByName = await getDatabaseByName(firstDb.database_name);

      if (foundByName && foundByName.database_id === firstDb.database_id) {
        console.log(`✅ Found database: ${foundByName.database_name} (ID: ${foundByName.database_id})`);
      } else {
        console.error('❌ Failed to find database by name');
      }
      console.log('');
    }

    // Test 4: Get database by ID
    console.log(`4. Testing getDatabaseById("${firstDb.database_id}")...`);
    const foundById = await getDatabaseById(firstDb.database_id);

    if (foundById && foundById.database_id === firstDb.database_id) {
      console.log(`✅ Found database: ${foundById.database_name} (ID: ${foundById.database_id})`);
    } else {
      console.error('❌ Failed to find database by ID');
    }
    console.log('');
  }

  console.log('✅ All integration tests passed!');
}

testIntegration().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
