export class AiUnavailableError extends Error {
  constructor(message = 'AI provider is not configured') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export class AiTimeoutError extends Error {
  constructor(message = 'AI provider request timed out') {
    super(message);
    this.name = 'AiTimeoutError';
  }
}

export class AiSchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiSchemaValidationError';
  }
}

export class AiProviderError extends Error {
  constructor(
    public readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
