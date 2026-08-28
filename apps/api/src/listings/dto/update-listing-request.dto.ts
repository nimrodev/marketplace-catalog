import { PartialType } from '@nestjs/mapped-types';
import { CreateListingRequestDto } from './create-listing-request.dto';

// Mirrors UpdateListingRequest = Partial<CreateListingRequest>; present
// fields still run create's decorators, so callers must merge with the
// persisted entity before re-sending isNegotiable/minPrice together.
export class UpdateListingRequestDto extends PartialType(CreateListingRequestDto) {}
