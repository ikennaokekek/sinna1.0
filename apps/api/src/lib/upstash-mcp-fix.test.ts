/**
 * Tests for Upstash MCP Fix utility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  getUpstashCredentials,
  listUpstashDatabases,
  formatDatabaseList,
  getDatabaseByName,
  getDatabaseById
} from './upstash-mcp-fix';

// Mock fs module
vi.mock('fs');
vi.mock('path');

// Mock fetch
global.fetch = vi.fn();

describe('Upstash MCP Fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUpstashCredentials', () => {
    it('should read credentials from project-level config', () => {
      const mockConfig = {
        mcpServers: {
          upstash: {
            command: 'npx',
            args: [
              '-y',
              '@upstash/mcp-server@latest',
              '--email',
              'test@example.com',
              '--api-key',
              'test-api-key-123'
            ]
          }
        }
      };

      vi.mocked(path.join).mockReturnValue('/project/.cursor/mcp.json');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const credentials = getUpstashCredentials();
      
      expect(credentials).toEqual({
        email: 'test@example.com',
        apiKey: 'test-api-key-123'
      });
    });

    it('should return null if config file not found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      
      const credentials = getUpstashCredentials();
      expect(credentials).toBeNull();
    });

    it('should return null if upstash config missing', () => {
      const mockConfig = { mcpServers: {} };
      
      vi.mocked(path.join).mockReturnValue('/project/.cursor/mcp.json');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));

      const credentials = getUpstashCredentials();
      expect(credentials).toBeNull();
    });
  });

  describe('listUpstashDatabases', () => {
    it('should return database list on success', async () => {
      const mockDatabases = [
        {
          database_id: 'test-id-1',
          database_name: 'Test DB 1',
          database_type: 'Pay as You Go',
          region: 'us-east-1',
          state: 'active'
        }
      ];

      vi.mocked(getUpstashCredentials).mockReturnValue({
        email: 'test@example.com',
        apiKey: 'test-key'
      });

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => mockDatabases
      } as Response);

      const result = await listUpstashDatabases();
      
      expect(result).toEqual(mockDatabases);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.upstash.com/v2/redis/databases',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': expect.stringContaining('Basic'),
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should return null on API error', async () => {
      vi.mocked(getUpstashCredentials).mockReturnValue({
        email: 'test@example.com',
        apiKey: 'test-key'
      });

      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      } as Response);

      const result = await listUpstashDatabases();
      expect(result).toBeNull();
    });

    it('should return null if credentials not found', async () => {
      vi.mocked(getUpstashCredentials).mockReturnValue(null);

      const result = await listUpstashDatabases();
      expect(result).toBeNull();
    });
  });

  describe('formatDatabaseList', () => {
    it('should format database list correctly', () => {
      const databases = [
        {
          database_id: 'id-1',
          database_name: 'DB 1',
          database_type: 'Pay as You Go',
          region: 'us-east-1',
          state: 'active',
          endpoint: 'test.upstash.io'
        },
        {
          database_id: 'id-2',
          database_name: 'DB 2',
          state: 'active'
        }
      ];

      const formatted = formatDatabaseList(databases);
      
      expect(formatted).toContain('Found 2 database(s)');
      expect(formatted).toContain('DB 1');
      expect(formatted).toContain('DB 2');
      expect(formatted).toContain('id-1');
      expect(formatted).toContain('id-2');
    });

    it('should handle empty list', () => {
      const formatted = formatDatabaseList([]);
      expect(formatted).toBe('No databases found');
    });
  });

  describe('getDatabaseByName', () => {
    it('should find database by name (case-insensitive)', async () => {
      const mockDatabases = [
        { database_id: 'id-1', database_name: 'Test DB' },
        { database_id: 'id-2', database_name: 'Another DB' }
      ];

      vi.mocked(listUpstashDatabases).mockResolvedValue(mockDatabases);

      const result = await getDatabaseByName('test db');
      expect(result).toEqual(mockDatabases[0]);
    });

    it('should return null if not found', async () => {
      vi.mocked(listUpstashDatabases).mockResolvedValue([]);

      const result = await getDatabaseByName('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getDatabaseById', () => {
    it('should find database by ID', async () => {
      const mockDatabases = [
        { database_id: 'id-1', database_name: 'DB 1' },
        { database_id: 'id-2', database_name: 'DB 2' }
      ];

      vi.mocked(listUpstashDatabases).mockResolvedValue(mockDatabases);

      const result = await getDatabaseById('id-2');
      expect(result).toEqual(mockDatabases[1]);
    });

    it('should return null if not found', async () => {
      vi.mocked(listUpstashDatabases).mockResolvedValue([]);

      const result = await getDatabaseById('nonexistent');
      expect(result).toBeNull();
    });
  });
});
