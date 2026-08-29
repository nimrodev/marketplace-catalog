import { ConfigService } from '@nestjs/config';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { PreScreenQueueService } from './pre-screen-queue.service';

function buildConfig(overrides: Record<string, string | undefined> = {}): ConfigService {
  const values: Record<string, string | undefined> = {
    AWS_REGION: 'eu-central-1',
    SQS_PRESCREEN_QUEUE_URL: 'https://sqs.eu-central-1.amazonaws.com/000000000000/marketplace-prescreen',
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

describe('PreScreenQueueService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends exactly one message carrying the listing id', async () => {
    const sendSpy = jest.spyOn(SQSClient.prototype, 'send').mockResolvedValue(undefined as never);
    const service = new PreScreenQueueService(buildConfig());

    await service.enqueue('listing-1');

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const command = sendSpy.mock.calls[0][0] as SendMessageCommand;
    expect(command.input.QueueUrl).toBe('https://sqs.eu-central-1.amazonaws.com/000000000000/marketplace-prescreen');
    expect(JSON.parse(command.input.MessageBody!)).toEqual({ listingId: 'listing-1' });
  });

  it('swallows a send failure — an SQS outage never fails the caller', async () => {
    jest.spyOn(SQSClient.prototype, 'send').mockImplementation(() => Promise.reject(new Error('SQS unavailable')));
    const service = new PreScreenQueueService(buildConfig());

    await expect(service.enqueue('listing-1')).resolves.toBeUndefined();
  });
});
