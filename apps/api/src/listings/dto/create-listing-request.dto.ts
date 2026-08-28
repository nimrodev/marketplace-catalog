import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';
import { CreateListingRequest, LISTING_LIMITS, ListingCategory, ListingCondition, ListingOption } from '@marketplace/shared';
import { MinPriceConstraint } from './min-price.validator';

// Layer 1 validation — mirrors CreateListingRequest field-for-field.
// No status/contributorId: with forbidNonWhitelisted, sending either 400s.
export class CreateListingRequestDto implements CreateListingRequest {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(LISTING_LIMITS.title.min)
  @MaxLength(LISTING_LIMITS.title.max)
  title!: string;

  @IsString()
  @MinLength(LISTING_LIMITS.description.min)
  @MaxLength(LISTING_LIMITS.description.max)
  description!: string;

  // price.min is 0 with exclusiveMin: true — IsPositive() is exactly ">0".
  @IsNumber({ maxDecimalPlaces: LISTING_LIMITS.price.maxDecimals })
  @IsPositive()
  @Max(LISTING_LIMITS.price.max)
  price!: number;

  @IsEnum(ListingCondition)
  condition!: ListingCondition;

  @IsEnum(ListingCategory)
  category!: ListingCategory;

  @IsBoolean()
  isNegotiable!: boolean;

  // No @IsOptional() — undefined must still hit the constraint, since it's
  // the only valid value when isNegotiable is false.
  @Validate(MinPriceConstraint)
  minPrice?: number;

  @IsArray()
  @IsEnum(ListingOption, { each: true })
  @ArrayUnique()
  @ArrayMaxSize(LISTING_LIMITS.options.max)
  options!: ListingOption[];

  @IsArray()
  @ArrayMinSize(LISTING_LIMITS.photos.min)
  @ArrayMaxSize(LISTING_LIMITS.photos.max)
  @IsString({ each: true })
  photoKeys!: string[];
}
