import { beforeEach, describe, expect, it, vi } from 'vitest';

const awsMocks = vi.hoisted(() => ({
  clientConfigs: [] as unknown[],
  commands: [] as Array<{ kind: string; input: Record<string, unknown> }>,
  responses: [] as unknown[],
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    constructor(config: unknown) {
      awsMocks.clientConfigs.push(config);
    }

    async send(command: { kind: string; input: Record<string, unknown> }) {
      awsMocks.commands.push(command);
      return awsMocks.responses.shift() ?? {};
    }
  },
  PutObjectCommand: class {
    readonly kind = 'put';
    constructor(readonly input: Record<string, unknown>) {}
  },
  GetObjectCommand: class {
    readonly kind = 'get';
    constructor(readonly input: Record<string, unknown>) {}
  },
}));

describe('worker R2 behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    awsMocks.clientConfigs.length = 0;
    awsMocks.commands.length = 0;
    awsMocks.responses.length = 0;
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-access-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.R2_BUCKET = 'test-bucket';
  });

  it('uploads with PutObjectCommand using the Cloudflare R2 client configuration', async () => {
    const { uploadToR2 } = await import('./r2');
    const body = Buffer.from('video');

    await uploadToR2('uploads/video.mp4', body, 'video/mp4');

    expect(awsMocks.clientConfigs).toEqual([
      expect.objectContaining({
        region: 'auto',
        endpoint: 'https://test-account.r2.cloudflarestorage.com',
      }),
    ]);
    expect(awsMocks.commands).toEqual([
      {
        kind: 'put',
        input: {
          Bucket: 'test-bucket',
          Key: 'uploads/video.mp4',
          Body: body,
          ContentType: 'video/mp4',
        },
      },
    ]);
  });

  it('downloads with GetObjectCommand and combines streamed response chunks', async () => {
    awsMocks.responses.push({
      Body: {
        async *[Symbol.asyncIterator]() {
          yield Uint8Array.from([1, 2]);
          yield Buffer.from([3, 4]);
        },
      },
    });
    const { downloadFromR2 } = await import('./r2');

    await expect(downloadFromR2('outputs/video.mp4'))
      .resolves.toEqual(Buffer.from([1, 2, 3, 4]));
    expect(awsMocks.commands).toEqual([
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