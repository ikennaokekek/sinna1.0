/**
 * Upstash MCP Bug Fix Utility
 * 
 * This module provides a workaround for the bug in @upstash/mcp-server's
 * redis_database_list_databases tool, which returns only a note string instead
 * of the actual database list.
 * 
 * Bug Report: https://github.com/upstash/mcp-server/issues/13
 * 
 * This utility directly calls the Upstash Management API to bypass the bug.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface UpstashDatabase {
  database_id: string;
  database_name: string;
  database_type?: string;
  region?: string;
  primary_region?: string;
  state?: string;
  endpoint?: string;
  type?: string;
  [key: string]: any; // Allow other fields from API
}

export interface UpstashCredentials {
  email: string;
  apiKey: string;
}

/**
 * Read Upstash credentials from MCP config file
 */
export function getUpstashCredentials(): UpstashCredentials | null {
  try {
    // Try project-level config first
    const projectConfigPath = path.join(process.cwd(), '.cursor', 'mcp.json');
    const globalConfigPath = path.join(process.env.HOME || '~', '.cursor', 'mcp.json');
    
    let configPath: string | null = null;
    if (fs.existsSync(projectConfigPath)) {
      configPath = projectConfigPath;
    } else if (fs.existsSync(globalConfigPath)) {
      configPath = globalConfigPath;
    }
    
    if (!configPath) {
      return null;
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const upstashConfig = config.mcpServers?.upstash || config.servers?.upstash;
    
    if (!upstashConfig || !upstashConfig.args) {
      return null;
    }
    
    // Extract email and api-key from args array
    const args = upstashConfig.args;
    let email: string | undefined;
    let apiKey: string | undefined;
    
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--email' && i + 1 < args.length) {
        email = args[i + 1];
      }
      if (args[i] === '--api-key' && i + 1 < args.length) {
        apiKey = args[i + 1];
      }
    }
    
    if (!email || !apiKey) {
      return null;
    }
    
    return { email, apiKey };
  } catch (error) {
    console.error('[Upstash MCP Fix] Error reading credentials:', error);
    return null;
  }
}

/**
 * List Upstash Redis databases using direct API call
 * This bypasses the buggy MCP tool and calls the API directly
 * 
 * @returns Array of database objects, or null if error
 */
export async function listUpstashDatabases(): Promise<UpstashDatabase[] | null> {
  const credentials = getUpstashCredentials();
  if (!credentials) {
    console.error('[Upstash MCP Fix] Failed to get Upstash credentials from MCP config');
    return null;
  }
  
  const { email, apiKey } = credentials;
  
  try {
    // Use Basic Auth (email:apiKey) - this is what works for Upstash Management API
    const authHeader = `Basic ${Buffer.from(`${email}:${apiKey}`).toString('base64')}`;
    
    const response = await fetch('https://api.upstash.com/v2/redis/databases', {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Upstash MCP Fix] API error (${response.status}):`, errorText);
      return null;
    }
    
    const databases = await response.json();
    
    if (!Array.isArray(databases)) {
      console.error('[Upstash MCP Fix] Unexpected response format:', typeof databases);
      return null;
    }
    
    return databases;
  } catch (error) {
    console.error('[Upstash MCP Fix] Exception calling Upstash API:', error);
    return null;
  }
}

/**
 * Format database list for display
 */
export function formatDatabaseList(databases: UpstashDatabase[]): string {
  if (databases.length === 0) {
    return 'No databases found';
  }
  
  const lines = [`Found ${databases.length} database(s):\n`];
  
  databases.forEach((db, index) => {
    lines.push(`${index + 1}. ${db.database_name || 'Unnamed'}`);
    if (db.database_id) {
      lines.push(`   ID: ${db.database_id}`);
    }
    if (db.database_type) {
      lines.push(`   Type: ${db.database_type}`);
    }
    if (db.region || db.primary_region) {
      lines.push(`   Region: ${db.region || db.primary_region}`);
    }
    if (db.state) {
      lines.push(`   State: ${db.state}`);
    }
    if (db.endpoint) {
      lines.push(`   Endpoint: ${db.endpoint}`);
    }
    lines.push('');
  });
  
  return lines.join('\n');
}

/**
 * Get database by name (case-insensitive)
 */
export async function getDatabaseByName(name: string): Promise<UpstashDatabase | null> {
  const databases = await listUpstashDatabases();
  if (!databases) {
    return null;
  }
  
  const lowerName = name.toLowerCase();
  return databases.find(db => 
    db.database_name?.toLowerCase() === lowerName
  ) || null;
}

/**
 * Get database by ID
 */
export async function getDatabaseById(id: string): Promise<UpstashDatabase | null> {
  const databases = await listUpstashDatabases();
  if (!databases) {
    return null;
  }
  
  return databases.find(db => db.database_id === id) || null;
}
