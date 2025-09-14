import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export class R2Client {
  private s3Client: S3Client;
  private bucket: string;

  constructor(config: R2Config) {
    this.bucket = config.bucket;
    
    // Cloudflare R2 endpoint format
    const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
    
    this.s3Client = new S3Client({
      region: 'auto', // R2 uses 'auto' as region
      endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /**
   * Generate a signed URL for uploading files to R2
   */
  async getUploadUrl(
    key: string, 
    expiresIn: number = 3600,
    contentType?: string
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Generate a signed URL for downloading files from R2
   */
  async getDownloadUrl(
    key: string, 
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Generate a signed URL for deleting files from R2
   */
  async getDeleteUrl(
    key: string, 
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Get the raw S3Client for advanced operations
   */
  getClient(): S3Client {
    return this.s3Client;
  }

  /**
   * Get bucket name
   */
  getBucket(): string {
    return this.bucket;
  }
}
