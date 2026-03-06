# Bug Report: `redis_database_list_databases` returns note string instead of database list

## Summary

The `redis_database_list_databases` tool in `@upstash/mcp-server` returns only an informational note string instead of the actual database list, even when databases exist and the underlying API call succeeds.

## Expected Behavior

According to the tool descriptor, `redis_database_list_databases` should:
- List all Upstash redis databases
- Return database names and IDs
- Provide structured data that can be used by MCP clients

## Actual Behavior

When calling the tool via MCP:
```typescript
call_mcp_tool(
  server: "project-0-SINNA1.0-upstash",
  toolName: "redis_database_list_databases",
  arguments: {}
)
```

**Response received:**
```
"NOTE: If the user wants to see dbs in another team, mention that they need to create a new management api key for that team and initialize MCP server with the newly created key."
```

This is just a note string, not the actual database list.

## Evidence

### 1. API Call Succeeds

When running the MCP server with debug logging, the underlying Upstash API call succeeds:

```
[DEBUG] <- received response [
  {
    "database_id": "ee452215-e9f0-46c6-9862-81895b612aa3",
    "database_name": "SINNA1.0UPDATED27.12.25",
    "database_type": "Pay as You Go",
    "region": "global",
    "type": "paid",
    "primary_members": ["eu-central-1"],
    "all_members": ["eu-central-1", "eu-west-1"],
    "primary_region": "eu-central-1",
    "read_regions": ["eu-west-1"],
    ...
  }
]
```

The API returns valid database data, but the MCP tool does not format/return this data correctly.

### 2. Other Tools Work Correctly

The `redis_database_get_details` tool works correctly when called with a specific database ID, confirming:
- ✅ Authentication works
- ✅ API connection works  
- ✅ Database exists and is accessible
- ❌ Only `list_databases` has the response formatting bug

### 3. Direct API Call Works

A direct API call using Basic Auth (email:apiKey) successfully retrieves the database list:

```bash
curl -X GET "https://api.upstash.com/v2/redis/databases" \
  -H "Authorization: Basic $(echo -n 'email:apiKey' | base64)" \
  -H "Content-Type: application/json"
```

Returns:
```json
[
  {
    "database_id": "ee452215-e9f0-46c6-9862-81895b612aa3",
    "database_name": "SINNA1.0UPDATED27.12.25",
    ...
  }
]
```

## Root Cause Hypothesis

The bug appears to be in the response formatting logic of the `redis_database_list_databases` tool. The tool:
1. ✅ Successfully calls the Upstash API
2. ✅ Receives valid database data
3. ❌ Returns only an informational note instead of formatting the database list

Possible causes:
- Response formatting logic incorrectly extracts/returns only the note from a larger response object
- Conditional logic that returns the note when certain conditions are met, but this condition is incorrectly triggered
- Recent version change introduced a bug where the response structure changed but the formatting wasn't updated

## Impact

- **Severity**: Medium
- **User Impact**: Users cannot list their databases via the MCP tool
- **Workaround**: Use `redis_database_get_details` with specific database IDs (requires knowing IDs beforehand), or call the Upstash API directly

## Environment

- **Package**: `@upstash/mcp-server@latest`
- **MCP Client**: Cursor IDE
- **Upstash Account**: Has 1+ active database(s)
- **API Key**: Valid and working (confirmed via `get_details` tool and direct API calls)

## Recommended Fix

The tool should:
1. Call the Upstash API to get the database list (✅ already working)
2. Format the response as an array of objects with `database_name` and optionally `database_id`
3. Return structured data instead of just a note string
4. Only show the note if it's truly informational (e.g., as a prefix or suffix, not as the only content)

## Test Case

**Input:**
```json
{
  "name": "redis_database_list_databases",
  "arguments": {}
}
```

**Expected Output:**
```json
{
  "content": [
    {
      "type": "text",
      "text": "Databases:\n- SINNA1.0UPDATED27.12.25 (ID: ee452215-e9f0-46c6-9862-81895b612aa3)"
    }
  ]
}
```

**Actual Output:**
```json
{
  "content": [
    {
      "type": "text", 
      "text": "NOTE: If the user wants to see dbs in another team..."
    }
  ]
}
```

## Additional Notes

- The informational note about teams/API keys is useful, but it should not replace the actual database list
- The note could be included as additional context, but the primary response should be the database list
