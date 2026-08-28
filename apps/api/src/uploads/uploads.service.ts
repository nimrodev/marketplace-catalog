import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PresignResponse } from '@marketplace/shared';
import { PresignRequestDto } from './dto/presign-request.dto';
import { buildPhotoKey } from './upload-key';

const PRESIGN_EXPIRES_SECONDS = 5 * 60;

@Injectable()
export class UploadsService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('AWS_SECRET_ACCESS_KEY');
    // A static key in production would sit on disk indefinitely, unlike the
    // EC2 instance role's rotating credentials (MAR-43) — fail startup
    // rather than silently accept one.
    if (config.get<string>('NODE_ENV') === 'production' && (accessKeyId || secretAccessKey)) {
      throw new Error('AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY must not be set in production — use the instance role.');
    }
    this.client = new S3Client({
      region: config.getOrThrow<string>('AWS_REGION'),
      // Only for local dev/CI — production omits these and the SDK picks
      // up the EC2 instance role's rotating credentials automatically.
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
    this.bucket = config.getOrThrow<string>('S3_PHOTOS_BUCKET');
  }

  async createPresignedUpload(userId: string, dto: PresignRequestDto): Promise<PresignResponse> {
    const key = buildPhotoKey(userId, dto.contentType);
    // Binding ContentLength into the signed request means S3 rejects the
    // actual PUT outright if the uploaded bytes don't match what was
    // declared here — not just a client-side size check (MAR-23 AC).
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: dto.contentType,
      ContentLength: dto.contentLength,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: PRESIGN_EXPIRES_SECONDS });
    return { url, key };
  }
}
