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

  constructor(config: ConfigService) {
    this.client = createS3Client(config);
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
