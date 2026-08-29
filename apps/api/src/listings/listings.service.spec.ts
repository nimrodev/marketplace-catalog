import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ListingCategory, ListingCondition, ListingOption, ListingStatus, UserRole } from '@marketplace/shared';
import { PhotoOwnershipValidator } from '../uploads/photo-ownership.validator';
import { AuthenticatedUser } from '../auth/jwt-payload';
import { PreScreenQueueService } from '../pre-screen/pre-screen-queue.service';
import { CreateListingRequestDto } from './dto/create-listing-request.dto';
import { UpdateListingRequestDto } from './dto/update-listing-request.dto';
import { Listing } from './listing.entity';
import { ListingsRepository } from './listings.repository';
import { ListingsService } from './listings.service';

function validDto(overrides: Partial<CreateListingRequestDto> = {}): CreateListingRequestDto {
  return Object.assign(new CreateListingRequestDto(), {
    title: 'Vintage bicycle, great condition',
    description: 'A well-loved bicycle, barely used, ready for a new home.',
    price: 150,
    condition: ListingCondition.GOOD,
    category: ListingCategory.SPORTS_OUTDOORS,
    isNegotiable: false,
    options: [ListingOption.LOCAL_PICKUP],
    photoKeys: ['listings/user-1/abc.jpg'],
    ...overrides,
  });
}

describe('ListingsService.create', () => {
  let repository: jest.Mocked<ListingsRepository>;
  let photoOwnership: jest.Mocked<PhotoOwnershipValidator>;
  let preScreenQueue: jest.Mocked<PreScreenQueueService>;
  let service: ListingsService;

  beforeEach(() => {
    repository = { create: jest.fn() } as unknown as jest.Mocked<ListingsRepository>;
    photoOwnership = { validate: jest.fn() } as unknown as jest.Mocked<PhotoOwnershipValidator>;
    preScreenQueue = { enqueue: jest.fn() } as unknown as jest.Mocked<PreScreenQueueService>;
    service = new ListingsService(repository, photoOwnership, preScreenQueue);
  });

  it('validates photo ownership before running the legality screen', async () => {
    photoOwnership.validate.mockRejectedValue(new BadRequestException('not yours'));

    await expect(service.create('user-1', validDto())).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects hard-hit content outright, without ever persisting anything', async () => {
    photoOwnership.validate.mockResolvedValue(undefined);

    await expect(service.create('user-1', validDto({ description: 'Selling a rifle, barely used' }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('persists a clean listing and enqueues it for pre-screening', async () => {
    photoOwnership.validate.mockResolvedValue(undefined);
    const dto = validDto();
    repository.create.mockResolvedValue({ id: 'listing-1' } as never);

    const result = await service.create('user-1', dto);

    expect(repository.create).toHaveBeenCalledWith('user-1', dto);
    expect(result).toEqual({ id: 'listing-1' });
    expect(preScreenQueue.enqueue).toHaveBeenCalledWith('listing-1');
  });

  it('never enqueues when the listing is rejected outright', async () => {
    photoOwnership.validate.mockResolvedValue(undefined);

    await expect(service.create('user-1', validDto({ description: 'Selling a rifle, barely used' }))).rejects.toThrow();

    expect(preScreenQueue.enqueue).not.toHaveBeenCalled();
  });

  it('persists a soft-hit listing too — MEDIUM is accepted, not rejected', async () => {
    photoOwnership.validate.mockResolvedValue(undefined);
    repository.create.mockResolvedValue({ id: 'listing-1' } as never);

    await service.create('user-1', validDto({ description: 'Message me at https://my-shop.example.com to arrange' }));

    expect(repository.create).toHaveBeenCalledTimes(1);
  });
});

function existingListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'listing-1',
    title: 'Vintage bicycle, great condition',
    description: 'A well-loved bicycle, barely used, ready for a new home.',
    price: '150.00',
    condition: ListingCondition.GOOD,
    category: ListingCategory.SPORTS_OUTDOORS,
    isNegotiable: false,
    minPrice: null,
    options: [ListingOption.LOCAL_PICKUP],
    status: ListingStatus.PUBLISHED,
    rejectionReason: null,
    contributorId: 'owner-1',
    expiresAt: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  } as Listing;
}

const owner: AuthenticatedUser = { id: 'owner-1', role: UserRole.CONTRIBUTOR };
const otherContributor: AuthenticatedUser = { id: 'someone-else', role: UserRole.CONTRIBUTOR };
const moderator: AuthenticatedUser = { id: 'mod-1', role: UserRole.MODERATOR };

describe('ListingsService.update', () => {
  let repository: jest.Mocked<ListingsRepository>;
  let photoOwnership: jest.Mocked<PhotoOwnershipValidator>;
  let preScreenQueue: jest.Mocked<PreScreenQueueService>;
  let service: ListingsService;

  beforeEach(() => {
    repository = {
      findEditableById: jest.fn(),
      update: jest.fn(),
      findDetail: jest.fn(),
    } as unknown as jest.Mocked<ListingsRepository>;
    photoOwnership = { validate: jest.fn() } as unknown as jest.Mocked<PhotoOwnershipValidator>;
    preScreenQueue = { enqueue: jest.fn() } as unknown as jest.Mocked<PreScreenQueueService>;
    service = new ListingsService(repository, photoOwnership, preScreenQueue);
  });

  it('404s when the listing does not exist', async () => {
    repository.findEditableById.mockResolvedValue(null);

    await expect(service.update(owner, 'listing-1', new UpdateListingRequestDto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('403s a contributor editing another contributor\'s listing', async () => {
    repository.findEditableById.mockResolvedValue(existingListing());

    await expect(service.update(otherContributor, 'listing-1', new UpdateListingRequestDto())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('lets a moderator edit any listing', async () => {
    repository.findEditableById.mockResolvedValue(existingListing());
    repository.findDetail.mockResolvedValue({ id: 'listing-1' } as never);

    await service.update(moderator, 'listing-1', Object.assign(new UpdateListingRequestDto(), { title: 'New title' }));

    expect(repository.update).toHaveBeenCalledTimes(1);
  });

  it('reverts a PUBLISHED listing to PENDING, clears rejectionReason, and enqueues it for pre-screening', async () => {
    repository.findEditableById.mockResolvedValue(existingListing({ status: ListingStatus.PUBLISHED }));
    repository.findDetail.mockResolvedValue({ id: 'listing-1' } as never);

    await service.update(owner, 'listing-1', Object.assign(new UpdateListingRequestDto(), { title: 'New title' }));

    expect(repository.update).toHaveBeenCalledWith(
      'listing-1',
      expect.objectContaining({ title: 'New title' }),
      { status: ListingStatus.PENDING, rejectionReason: null },
      undefined,
    );
    expect(preScreenQueue.enqueue).toHaveBeenCalledWith('listing-1');
  });

  it('leaves a PUBLISHED listing untouched, and does not enqueue, when a moderator edits it', async () => {
    repository.findEditableById.mockResolvedValue(existingListing({ status: ListingStatus.PUBLISHED }));
    repository.findDetail.mockResolvedValue({ id: 'listing-1' } as never);

    await service.update(moderator, 'listing-1', Object.assign(new UpdateListingRequestDto(), { title: 'New title' }));

    expect(repository.update).toHaveBeenCalledWith(
      'listing-1',
      expect.objectContaining({ title: 'New title' }),
      { status: ListingStatus.PUBLISHED, rejectionReason: null },
      undefined,
    );
    expect(preScreenQueue.enqueue).not.toHaveBeenCalled();
  });

  it('does not re-enqueue a contributor editing an already-PENDING listing', async () => {
    repository.findEditableById.mockResolvedValue(existingListing({ status: ListingStatus.PENDING }));
    repository.findDetail.mockResolvedValue({ id: 'listing-1' } as never);

    await service.update(owner, 'listing-1', Object.assign(new UpdateListingRequestDto(), { title: 'New title' }));

    expect(preScreenQueue.enqueue).not.toHaveBeenCalled();
  });

  it('re-validates photo ownership against the listing owner, not the acting moderator', async () => {
    repository.findEditableById.mockResolvedValue(existingListing());
    repository.findDetail.mockResolvedValue({ id: 'listing-1' } as never);

    await service.update(
      moderator,
      'listing-1',
      Object.assign(new UpdateListingRequestDto(), { photoKeys: ['listings/owner-1/new.jpg'] }),
    );

    expect(photoOwnership.validate).toHaveBeenCalledWith('owner-1', ['listings/owner-1/new.jpg']);
  });

  it('rejects hard-hit content even when only unrelated fields changed', async () => {
    repository.findEditableById.mockResolvedValue(existingListing({ description: 'Selling a rifle, barely used' }));

    await expect(
      service.update(owner, 'listing-1', Object.assign(new UpdateListingRequestDto(), { title: 'New title' })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('clears minPrice when isNegotiable flips to false without a minPrice in the same payload', async () => {
    repository.findEditableById.mockResolvedValue(
      existingListing({ isNegotiable: true, minPrice: '100.00', price: '150.00' }),
    );
    repository.findDetail.mockResolvedValue({ id: 'listing-1' } as never);

    await service.update(owner, 'listing-1', Object.assign(new UpdateListingRequestDto(), { isNegotiable: false }));

    expect(repository.update).toHaveBeenCalledWith(
      'listing-1',
      expect.objectContaining({ isNegotiable: false, minPrice: null }),
      { status: ListingStatus.PENDING, rejectionReason: null },
      undefined,
    );
  });
});
