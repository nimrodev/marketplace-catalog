import { ConfigService } from '@nestjs/config';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { RiskLevel } from '@marketplace/shared';
import { PrescreenMessageProcessor } from './prescreen-message-processor.service';
import { PrescreenConsumerService } from './prescreen-consumer.service';

describe('PrescreenConsumerService', () => {
  const config = {
    get: (key: string) => (key === 'AWS_REGION' ? 'eu-central-1' : undefined),
    getOrThrow: (key: string) => {
      if (key === 'AWS_REGION') return 'eu-central-1';
      if (key === 'SQS_PRESCREEN_QUEUE_URL') return 'https://sqs.example/queue';
      throw new Error(`missing ${key}`);
    },
  } as unknown as ConfigService;

  let sendSpy: jest.SpyInstance;
  let deletedReceipts: string[];
  let receiveCallCount: number;
  let consumer: PrescreenConsumerService;
  let processor: jest.Mocked<PrescreenMessageProcessor>;

  // Every scenario receives one message on the first ReceiveMessageCommand,
  // then stops the consumer so run() terminates instead of polling forever.
  function queueOneMessage(body: string) {
    receiveCallCount = 0;
    sendSpy.mockImplementation(async (command: unknown) => {
      if (command instanceof ReceiveMessageCommand) {
        receiveCallCount += 1;
        if (receiveCallCount === 1) {
          return { Messages: [{ Body: body, ReceiptHandle: 'receipt-1' }] };
        }
        consumer.stop();
        return { Messages: [] };
      }
      if (command instanceof DeleteMessageCommand) {
        deletedReceipts.push((command.input as { ReceiptHandle: string }).ReceiptHandle);
        return {};
      }
      return {};
    });
  }

  beforeEach(() => {
    deletedReceipts = [];
    processor = { process: jest.fn() } as unknown as jest.Mocked<PrescreenMessageProcessor>;
    consumer = new PrescreenConsumerService(config, processor);
    sendSpy = jest.spyOn(SQSClient.prototype, 'send');
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  it('deletes the message after a successful process', async () => {
    queueOneMessage(JSON.stringify({ listingId: 'listing-1' }));
    processor.process.mockResolvedValue({ status: 'processed', level: RiskLevel.LOW });

    await consumer.run();

    expect(processor.process).toHaveBeenCalledWith({ listingId: 'listing-1', reqId: undefined });
    expect(deletedReceipts).toEqual(['receipt-1']);
  });

  it('deletes the message when the listing is not found — retrying cannot help', async () => {
    queueOneMessage(JSON.stringify({ listingId: 'listing-1' }));
    processor.process.mockResolvedValue({ status: 'not-found' });

    await consumer.run();

    expect(deletedReceipts).toEqual(['receipt-1']);
  });

  it('does not delete the message when processing throws, so SQS redelivers it', async () => {
    queueOneMessage(JSON.stringify({ listingId: 'listing-1' }));
    processor.process.mockRejectedValue(new Error('DB write failed'));

    await consumer.run();

    expect(deletedReceipts).toEqual([]);
  });

  it('deletes and never processes a malformed message body', async () => {
    queueOneMessage('not valid json');

    await consumer.run();

    expect(processor.process).not.toHaveBeenCalled();
    expect(deletedReceipts).toEqual(['receipt-1']);
  });

  it('deletes and never processes a body missing listingId', async () => {
    queueOneMessage(JSON.stringify({ reqId: 'req-1' }));

    await consumer.run();

    expect(processor.process).not.toHaveBeenCalled();
    expect(deletedReceipts).toEqual(['receipt-1']);
  });
});
