import { BadRequestException } from '@nestjs/common';
import { ListingCategory, ListingCondition, ListingOption } from '@marketplace/shared';
import { PhotoOwnershipValidator } from '../uploads/photo-ownership.validator';
import { CreateListingRequestDto } from './dto/create-listing-request.dto';
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
  let service: ListingsService;

  beforeEach(() => {
    repository = { create: jest.fn() } as unknown as jest.Mocked<ListingsRepository>;
    photoOwnership = { validate: jest.fn() } as unknown as jest.Mocked<PhotoOwnershipValidator>;
    service = new ListingsService(repository, photoOwnership);
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

  it('persists a clean listing', async () => {
    photoOwnership.validate.mockResolvedValue(undefined);
    const dto = validDto();
    repository.create.mockResolvedValue({ id: 'listing-1' } as never);

    const result = await service.create('user-1', dto);

    expect(repository.create).toHaveBeenCalledWith('user-1', dto);
    expect(result).toEqual({ id: 'listing-1' });
  });

  it('persists a soft-hit listing too — MEDIUM is accepted, not rejected', async () => {
    photoOwnership.validate.mockResolvedValue(undefined);
    repository.create.mockResolvedValue({ id: 'listing-1' } as never);

    await service.create('user-1', validDto({ description: 'Message me at https://my-shop.example.com to arrange' }));

    expect(repository.create).toHaveBeenCalledTimes(1);
  });
});
