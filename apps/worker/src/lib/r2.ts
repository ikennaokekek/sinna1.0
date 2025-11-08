import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

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
  try {
    if (!bucket) {
      throw new Error('R2_BUCKET environment variable is not set');
    }
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 credentials are not configured');
    }
    const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: body as any, ContentType: contentType });
    await r2.send(cmd);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Failed to upload to R2 for key ${key}: ${err.message}`);
  }
}

export async function downloadFromR2(key: string): Promise<Buffer> {
  try {
    if (!bucket) {
      throw new Error('R2_BUCKET environment variable is not set');
    }
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 credentials are not configured');
    }
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await r2.send(cmd);
    
    if (!response.Body) {
      throw new Error(`No body returned for key ${key}`);
    }
    
    const chunks: Uint8Array[] = [];
    const stream = response.Body as any;
    
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Failed to download from R2 for key ${key}: ${err.message}`);
  }
}


