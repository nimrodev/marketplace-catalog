import { ServiceUnavailableException } from '@nestjs/common';
import { ListingCategory, ListingCondition } from '@marketplace/shared';
import { AuthenticatedUser } from '../auth/jwt-payload';
import { DraftListingController } from './draft-listing.controller';
import { DraftListingService } from './draft-listing.service';

function buildUser(id: string): AuthenticatedUser {
  return { id, role: 'CONTRIBUTOR' } as AuthenticatedUser;
}

describe('DraftListingController', () => {
  it('delegates to the service with the caller id and photo keys', async () => {
    const draft = {
      title: 'Wooden dining chair',
      description: 'A sturdy chair.',
      category: ListingCategory.FURNITURE,
      condition: ListingCondition.GOOD,
      suggestedPriceMin: 20,
      suggestedPriceMax: 40,
    };
    const service = { draft: jest.fn().mockResolvedValue(draft) } as unknown as jest.Mocked<DraftListingService>;
    const controller = new DraftListingController(service);

    const result = await controller.generateDraft({ photoKeys: ['listings/user-1/a.jpg'] }, buildUser('user-1'));

    expect(result).toEqual(draft);
    expect(service.draft).toHaveBeenCalledWith('user-1', ['listings/user-1/a.jpg']);
  });

  it('propagates a clean service-level failure rather than swallowing it', async () => {
    const service = {
      draft: jest.fn().mockRejectedValue(new ServiceUnavailableException('AI draft is unavailable right now — fill in the details manually.')),
    } as unknown as jest.Mocked<DraftListingService>;
    const controller = new DraftListingController(service);

    await expect(controller.generateDraft({ photoKeys: ['listings/user-1/a.jpg'] }, buildUser('user-1'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
