// Standard error envelope so the frontend maps field errors without
// guessing at shape. fieldErrors is present only for 400s raised by the
// validation pipe; other errors carry just statusCode/error/message.
export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
}
