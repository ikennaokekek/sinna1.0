# Upstash MCP Server Bug Report: `redis_database_list_databases`

## Bug Summary

The `redis_database_list_databases` tool in `@upstash/mcp-server` returns only a note string instead of the actual database list, even when databases exist and the underlying API call succeeds.

## Evidence

### 1. Observed Behavior

**When calling the tool via MCP:**
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

### 2. Expected Behavior

According to the tool descriptor (`redis_database_list_databases.json`):
- **Description**: "List all Upstash redis databases. Only their names and ids."
- **Expected**: An array or object containing database names and IDs

### 3. API Call Succeeds

From debug output when running the MCP server directly:
```
[DEBUG] <- received response [
  {
    "database_id": "ee452215-e9f0-46c6-9862-81895b612aa3",
    "database_name": "SINNA1.0UPDATED27.12.25",
    "database_type": "Pay as You Go",
    "region": "global",
    ...
  }
]
```

**Conclusion**: The underlying Upstash API call succeeds and returns database data, but the MCP tool does not format/return this data correctly.

### 4. Workaround Confirmed

The `redis_database_get_details` tool works correctly when called with a specific database ID:
```typescript
call_mcp_tool(
  server: "project-0-SINNA1.0-upstash",
  toolName: "redis_database_get_details",
  arguments: { database_id: "ee452215-e9f0-46c6-9862-81895b612aa3" }
)
```

This returns complete database information, confirming:
- ✅ Authentication works
- ✅ API connection works  
- ✅ Database exists and is accessible
- ❌ Only `list_databases` has the response formatting bug

## Root Cause Hypothesis

Based on the evidence, the bug appears to be in the response formatting logic of the `redis_database_list_databases` tool implementation. Possible causes:

1. **Hypothesis A**: The tool returns the note as a fallback message when databases exist, instead of formatting the database list
2. **Hypothesis B**: Response formatting logic incorrectly extracts/returns only the note from a larger response object
3. **Hypothesis C**: The tool has conditional logic that returns the note when certain conditions are met (e.g., team context), but this condition is incorrectly triggered
4. **Hypothesis D**: Recent version change introduced a bug where the response structure changed but the formatting wasn't updated

## Impact

- **Severity**: Medium (workaround exists via `get_details` with known IDs)
- **User Impact**: Users cannot list their databases via the MCP tool
- **Workaround**: Use `redis_database_get_details` with specific database IDs (requires knowing IDs beforehand)

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
      "text": "Databases:\n- SINNA1.0UPDATED27.12.25"
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

## Environment

- **Package**: `@upstash/mcp-server@latest`
- **MCP Client**: Cursor IDE
- **Upstash Account**: Has 1 active database
- **API Key**: Valid and working (confirmed via `get_details` tool)

## Next Steps

1. Report this bug to the Upstash MCP Server repository: https://github.com/upstash/mcp-server/issues
2. Include this bug report and evidence
3. Request fix or clarification on expected behavior
