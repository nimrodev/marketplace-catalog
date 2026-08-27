import type { PhotoContentType } from './limits';

export interface PresignRequest {
  contentType: PhotoContentType;
  contentLength: number;
}

export interface PresignResponse {
  url: string;
  key: string;
}
