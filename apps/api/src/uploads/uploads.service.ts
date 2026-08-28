import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PresignResponse } from '@marketplace/shared';
import { PresignRequestDto } from './dto/presign-request.dto';
import { createS3Client } from './s3-client.factory';
import { buildPhotoKey } from './upload-key';

const PRESIGN_EXPIRES_SECONDS = 5 * 60;

@Injectable()
export class UploadsService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicEndpoint?: string;

  constructor(private readonly config: ConfigService) {
    this.client = createS3Client(config);
    this.bucket = config.getOrThrow<string>('S3_PHOTOS_BUCKET');
    this.publicEndpoint = config.get<string>('S3_PUBLIC_ENDPOINT');
  }

  async createPresignedUpload(userId: string, dto: PresignRequestDto): Promise<PresignResponse> {
    const key = buildPhotoKey(userId, dto.contentType);
    // Binds ContentLength into the signature, so S3 rejects a mismatched
    // upload outright, not just a client-side size check.
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: dto.contentType,
      ContentLength: dto.contentLength,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: PRESIGN_EXPIRES_SECONDS });
    return { url: this.toPublicUrl(url), key };
  }

  // LocalStack only: the API reaches it over the Docker network, but a
  // presigned URL is used by the browser, which needs a host-reachable one.
  private toPublicUrl(url: string): string {
    if (!this.publicEndpoint) {
      return url;
    }
    const target = new URL(url);
    const publicOrigin = new URL(this.publicEndpoint);
    target.protocol = publicOrigin.protocol;
    target.host = publicOrigin.host;
    return target.toString();
  }
}
