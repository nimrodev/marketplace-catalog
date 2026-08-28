import { ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

interface MinPriceHost {
  isNegotiable?: boolean;
  price?: number;
}

// class-validator has no built-in cross-field rule: minPrice must be
// present-and-valid (>0, <=price) when isNegotiable, absent otherwise.
@ValidatorConstraint({ name: 'minPrice', async: false })
export class MinPriceConstraint implements ValidatorConstraintInterface {
  validate(minPrice: unknown, args: ValidationArguments): boolean {
    const { isNegotiable, price } = args.object as MinPriceHost;

    if (!isNegotiable) {
      return minPrice === undefined;
    }
    return typeof minPrice === 'number' && minPrice > 0 && (typeof price !== 'number' || minPrice <= price);
  }

  defaultMessage(args: ValidationArguments): string {
    const { isNegotiable } = args.object as MinPriceHost;
    return isNegotiable
      ? 'minPrice is required when isNegotiable is true, must be greater than 0, and must not exceed price'
      : 'minPrice must not be provided when isNegotiable is false';
  }
}
