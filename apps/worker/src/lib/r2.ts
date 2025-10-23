import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

const bucket = process.env.R2_BUCKET || '';

export async function uploadToR2(key: string, body: Buffer | Uint8Array | string, contentType: string): Promise<void> {
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: body as any, ContentType: contentType });
  await r2.send(cmd);
}


