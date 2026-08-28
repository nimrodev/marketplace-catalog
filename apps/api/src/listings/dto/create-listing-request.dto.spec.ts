import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { ListingCategory, ListingCondition, ListingOption } from '@marketplace/shared';
import { CreateListingRequestDto } from './create-listing-request.dto';
import { UpdateListingRequestDto } from './update-listing-request.dto';

// Same config as bootstrap.ts's global pipe — proves the 400/field-name
// behaviour without standing up a controller (MAR-18, not yet built).
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

function bodyMetadata(metatype: unknown): ArgumentMetadata {
  return { type: 'body', metatype: metatype as new (...args: unknown[]) => unknown, data: '' };
}

function validCreatePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'A perfectly valid listing title',
    description: 'A'.repeat(20),
    price: 100,
    condition: ListingCondition.NEW,
    category: ListingCategory.ELECTRONICS,
    isNegotiable: false,
    options: [ListingOption.LOCAL_PICKUP],
    photoKeys: ['listings/photo-1.jpg'],
    ...overrides,
  };
}

async function expectValid(payload: Record<string, unknown>, metatype: unknown = CreateListingRequestDto): Promise<void> {
  await expect(pipe.transform(payload, bodyMetadata(metatype))).resolves.toBeDefined();
}

async function expectRejects(
  payload: Record<string, unknown>,
  field: string,
  metatype: unknown = CreateListingRequestDto,
): Promise<void> {
  try {
    await pipe.transform(payload, bodyMetadata(metatype));
    throw new Error(`expected validation to reject payload for field "${field}", but it passed`);
  } catch (err) {
    const response = (err as { status?: number; response?: { statusCode: number; message: string[] } }).response;
    expect((err as { status: number }).status).toBe(400);
    expect(response?.statusCode).toBe(400);
    expect(response?.message.some((m) => m.toLowerCase().includes(field.toLowerCase()))).toBe(true);
  }
}

describe('CreateListingRequestDto', () => {
  describe('title (3-120 chars, trimmed, non-empty after trim)', () => {
    it('accepts a title within range', async () => {
      await expectValid(validCreatePayload({ title: 'Valid Title' }));
    });

    it('rejects a title shorter than 3 chars', async () => {
      await expectRejects(validCreatePayload({ title: 'ab' }), 'title');
    });

    it('rejects a title longer than 120 chars', async () => {
      await expectRejects(validCreatePayload({ title: 'a'.repeat(121) }), 'title');
    });

    it('rejects a whitespace-only title (empty after trim)', async () => {
      await expectRejects(validCreatePayload({ title: '   ' }), 'title');
    });

    it('trims surrounding whitespace before persisting', async () => {
      const result = (await pipe.transform(
        validCreatePayload({ title: '  Trimmed Title  ' }),
        bodyMetadata(CreateListingRequestDto),
      )) as CreateListingRequestDto;
      expect(result.title).toBe('Trimmed Title');
    });
  });

  describe('description (20-5000 chars)', () => {
    it('accepts a description at the minimum length', async () => {
      await expectValid(validCreatePayload({ description: 'a'.repeat(20) }));
    });

    it('rejects a description shorter than 20 chars', async () => {
      await expectRejects(validCreatePayload({ description: 'a'.repeat(19) }), 'description');
    });

    it('rejects a description longer than 5000 chars', async () => {
      await expectRejects(validCreatePayload({ description: 'a'.repeat(5001) }), 'description');
    });
  });

  describe('price (>0, <=10,000,000, max 2 decimals)', () => {
    it('accepts a valid price', async () => {
      await expectValid(validCreatePayload({ price: 1234.56 }));
    });

    it('rejects a zero price', async () => {
      await expectRejects(validCreatePayload({ price: 0 }), 'price');
    });

    it('rejects a negative price', async () => {
      await expectRejects(validCreatePayload({ price: -5 }), 'price');
    });

    it('rejects a price above the cap', async () => {
      await expectRejects(validCreatePayload({ price: 10_000_000.01 }), 'price');
    });

    it('rejects a price with more than 2 decimals', async () => {
      await expectRejects(validCreatePayload({ price: 100.123 }), 'price');
    });

    it('accepts the price cap exactly', async () => {
      await expectValid(validCreatePayload({ price: 10_000_000 }));
    });
  });

  describe('isNegotiable (boolean, required)', () => {
    it('accepts true', async () => {
      await expectValid(validCreatePayload({ isNegotiable: true, minPrice: 50 }));
    });

    it('accepts false', async () => {
      await expectValid(validCreatePayload({ isNegotiable: false }));
    });

    it('rejects a missing isNegotiable', async () => {
      const { isNegotiable, ...rest } = validCreatePayload();
      await expectRejects(rest, 'isNegotiable');
    });

    it('rejects a non-boolean isNegotiable', async () => {
      await expectRejects(validCreatePayload({ isNegotiable: 'yes' }), 'isNegotiable');
    });
  });

  describe('minPrice (required iff isNegotiable, forbidden otherwise, >0 and <=price)', () => {
    it('accepts minPrice when isNegotiable is true and minPrice <= price', async () => {
      await expectValid(validCreatePayload({ isNegotiable: true, price: 100, minPrice: 80 }));
    });

    it('rejects a missing minPrice when isNegotiable is true', async () => {
      await expectRejects(validCreatePayload({ isNegotiable: true, price: 100 }), 'minPrice');
    });

    it('rejects a present minPrice when isNegotiable is false (not silently ignored)', async () => {
      await expectRejects(validCreatePayload({ isNegotiable: false, minPrice: 50 }), 'minPrice');
    });

    it('rejects a zero minPrice', async () => {
      await expectRejects(validCreatePayload({ isNegotiable: true, price: 100, minPrice: 0 }), 'minPrice');
    });

    it('rejects a minPrice greater than price', async () => {
      await expectRejects(validCreatePayload({ isNegotiable: true, price: 100, minPrice: 150 }), 'minPrice');
    });
  });

  describe('condition (5-value enum)', () => {
    it('accepts a valid condition', async () => {
      await expectValid(validCreatePayload({ condition: ListingCondition.LIKE_NEW }));
    });

    it('rejects an invalid condition', async () => {
      await expectRejects(validCreatePayload({ condition: 'BROKEN' }), 'condition');
    });
  });

  describe('category (8-value enum)', () => {
    it('accepts a valid category', async () => {
      await expectValid(validCreatePayload({ category: ListingCategory.VEHICLES }));
    });

    it('rejects an invalid category', async () => {
      await expectRejects(validCreatePayload({ category: 'FOOD' }), 'category');
    });
  });

  describe('options (subset of 6-value enum, no duplicates, max 6)', () => {
    it('accepts a valid subset', async () => {
      await expectValid(
        validCreatePayload({ options: [ListingOption.DELIVERY_AVAILABLE, ListingOption.WARRANTY_INCLUDED] }),
      );
    });

    it('accepts an empty options array', async () => {
      await expectValid(validCreatePayload({ options: [] }));
    });

    it('rejects an unknown option value', async () => {
      await expectRejects(validCreatePayload({ options: ['FREE_GIFT_WRAP'] }), 'options');
    });

    it('rejects duplicate options', async () => {
      await expectRejects(
        validCreatePayload({ options: [ListingOption.LOCAL_PICKUP, ListingOption.LOCAL_PICKUP] }),
        'options',
      );
    });

    it('rejects more than 6 options', async () => {
      await expectRejects(
        validCreatePayload({
          options: [
            ListingOption.DELIVERY_AVAILABLE,
            ListingOption.LOCAL_PICKUP,
            ListingOption.OPEN_TO_TRADES,
            ListingOption.ORIGINAL_PACKAGING,
            ListingOption.WARRANTY_INCLUDED,
            ListingOption.BUNDLE_DEAL,
            ListingOption.DELIVERY_AVAILABLE, // duplicate, but also pushes size to 7
          ],
        }),
        'options',
      );
    });
  });

  describe('photoKeys (1-5 entries)', () => {
    it('accepts a single photo key', async () => {
      await expectValid(validCreatePayload({ photoKeys: ['listings/a.jpg'] }));
    });

    it('accepts five photo keys', async () => {
      await expectValid(
        validCreatePayload({
          photoKeys: ['listings/a.jpg', 'listings/b.jpg', 'listings/c.jpg', 'listings/d.jpg', 'listings/e.jpg'],
        }),
      );
    });

    it('rejects zero photo keys', async () => {
      await expectRejects(validCreatePayload({ photoKeys: [] }), 'photoKeys');
    });

    it('rejects more than five photo keys', async () => {
      await expectRejects(
        validCreatePayload({
          photoKeys: [
            'listings/a.jpg',
            'listings/b.jpg',
            'listings/c.jpg',
            'listings/d.jpg',
            'listings/e.jpg',
            'listings/f.jpg',
          ],
        }),
        'photoKeys',
      );
    });
  });

  describe('unknown properties', () => {
    it('strips and rejects properties not on the DTO', async () => {
      await expectRejects(validCreatePayload({ isAdminOverride: true }), 'isAdminOverride');
    });
  });
});

describe('UpdateListingRequestDto', () => {
  it('accepts an empty body (every field optional)', async () => {
    await expectValid({}, UpdateListingRequestDto);
  });

  it('accepts a single valid field', async () => {
    await expectValid({ title: 'Updated Title' }, UpdateListingRequestDto);
  });

  it('still applies the field rule when the field is present', async () => {
    await expectRejects({ title: 'ab' }, 'title', UpdateListingRequestDto);
  });

  it('still applies the minPrice/isNegotiable cross-field rule when both are present', async () => {
    await expectRejects({ isNegotiable: false, minPrice: 50 }, 'minPrice', UpdateListingRequestDto);
  });
});
