import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

const bucket = process.env.R2_BUCKET || '';

export async function getSignedPutUrl(key: string, contentType: string, expiresInSeconds = 3600) {
  try {
    if (!bucket) {
      throw new Error('R2_BUCKET environment variable is not set');
    }
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 credentials are not configured');
    }
    const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
    const url = await getSignedUrl(r2, cmd, { expiresIn: expiresInSeconds });
    return url;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Failed to generate signed PUT URL for key ${key}: ${err.message}`);
  }
}

export async function getSignedGetUrl(key: string, expiresInSeconds = 3600) {
  try {
    if (!bucket) {
      throw new Error('R2_BUCKET environment variable is not set');
    }
    if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 credentials are not configured');
    }
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const url = await getSignedUrl(r2, cmd, { expiresIn: expiresInSeconds });
    return url;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Failed to generate signed GET URL for key ${key}: ${err.message}`);
  }
}


