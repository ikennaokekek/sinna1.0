import { beforeEach, describe, expect, it, vi } from 'vitest';

const awsMocks = vi.hoisted(() => ({
  clientConfigs: [] as unknown[],
  sentCommands: [] as unknown[],
  signedCommands: [] as unknown[],
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    constructor(config: unknown) {
      awsMocks.clientConfigs.push(config);
    }

    async send(command: unknown) {
      awsMocks.sentCommands.push(command);
      return {};
    }
  },
  PutObjectCommand: class {
    readonly kind = 'put';
    constructor(readonly input: unknown) {}
  },
  GetObjectCommand: class {
    readonly kind = 'get';
    constructor(readonly input: unknown) {}
  },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockImplementation(async (_client, command) => {
    awsMocks.signedCommands.push(command);
    return `https://signed.example/${command.kind}`;
  }),
}));

describe('R2 signed URL behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    awsMocks.clientConfigs.length = 0;
    awsMocks.sentCommands.length = 0;
    awsMocks.signedCommands.length = 0;
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-access-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.R2_BUCKET = 'test-bucket';
  });

  it('uses the Cloudflare R2 endpoint with region auto and signs PUT/GET commands', async () => {
    const { getSignedPutUrl, getSignedGetUrl } = await import('./r2');

    await expect(getSignedPutUrl('uploads/video.mp4', 'video/mp4', 300))
      .resolves.toBe('https://signed.example/put');
    await expect(getSignedGetUrl('outputs/video.mp4', 600))
      .resolves.toBe('https://signed.example/get');

    expect(awsMocks.clientConfigs).toEqual([
      expect.objectContaining({
        region: 'auto',
        endpoint: 'https://test-account.r2.cloudflarestorage.com',
      }),
    ]);
    expect(awsMocks.signedCommands).toEqual([
      {
        kind: 'put',
        input: {
          Bucket: 'test-bucket',
          Key: 'uploads/video.mp4',
          ContentType: 'video/mp4',
        },
      },
      {
        kind: 'get',
        input: {
          Bucket: 'test-bucket',
          Key: 'outputs/video.mp4',
        },
      },
    ]);
  });
});