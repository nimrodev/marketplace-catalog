import { ListingCategory, ListingCondition, ListingOption, ListingStatus } from '@marketplace/shared';
import { Listing } from './listing.entity';
import { ListingsRepository } from './listings.repository';

const validInput = {
  title: 'Vintage bicycle, great condition',
  description: 'A well-loved bicycle, barely used, ready for a new home.',
  price: 150,
  condition: ListingCondition.GOOD,
  category: ListingCategory.SPORTS_OUTDOORS,
  isNegotiable: false,
  options: [ListingOption.LOCAL_PICKUP],
  photoKeys: ['listings/user-1/a.jpg', 'listings/user-1/b.jpg'],
};

// Proves the code's transaction wiring, not Postgres's ACID guarantees.
describe('ListingsRepository.create', () => {
  function buildFakes() {
    const savedListing = {
      id: 'listing-1',
      status: ListingStatus.PENDING,
      price: '150.00',
      minPrice: null,
      rejectionReason: null,
      contributorId: 'user-1',
      publishedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    } as Listing;
    const listingRepoInTx = {
      create: jest.fn((input) => input),
      save: jest.fn().mockResolvedValue(savedListing),
    };
    const photoRepoInTx = {
      create: jest.fn((input) => input),
      save: jest.fn().mockResolvedValue([]),
    };
    const fakeManager = {
      getRepository: jest.fn((entity: unknown) => (entity === Listing ? listingRepoInTx : photoRepoInTx)),
    };
    const transaction = jest.fn(async (cb: (manager: typeof fakeManager) => unknown) => cb(fakeManager));

    const photoRepo = { find: jest.fn().mockResolvedValue([]) };
    const listingRepo = { manager: { transaction } };
    const riskRepo = {};

    const repository = new ListingsRepository(listingRepo as never, photoRepo as never, riskRepo as never);

    return { repository, transaction, listingRepoInTx, photoRepoInTx, savedListing };
  }

  it('performs the listing and photo inserts inside one transaction, via the transactional manager', async () => {
    const { repository, transaction, listingRepoInTx, photoRepoInTx } = buildFakes();

    await repository.create('user-1', validInput);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(listingRepoInTx.save).toHaveBeenCalledTimes(1);
    expect(photoRepoInTx.save).toHaveBeenCalledTimes(1);
  });

  it('assigns sort_order from photo order, primary photo at 0', async () => {
    const { repository, photoRepoInTx } = buildFakes();

    await repository.create('user-1', validInput);

    expect(photoRepoInTx.save).toHaveBeenCalledWith([
      { listingId: 'listing-1', s3Key: 'listings/user-1/a.jpg', sortOrder: 0 },
      { listingId: 'listing-1', s3Key: 'listings/user-1/b.jpg', sortOrder: 1 },
    ]);
  });

  it('always sets status to PENDING, regardless of caller', async () => {
    const { repository, listingRepoInTx } = buildFakes();

    await repository.create('user-1', validInput);

    expect(listingRepoInTx.save).toHaveBeenCalledWith(expect.objectContaining({ status: ListingStatus.PENDING }));
  });

  it('lets a photo-insert failure propagate — never swallowed into a false success', async () => {
    const { repository, photoRepoInTx } = buildFakes();
    photoRepoInTx.save.mockRejectedValue(new Error('constraint violation'));

    await expect(repository.create('user-1', validInput)).rejects.toThrow('constraint violation');
  });
});
