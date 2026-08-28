import { ValidationError } from '@nestjs/common';
import { toFieldErrors } from './bootstrap';

function error(property: string, constraints: Record<string, string>, children: ValidationError[] = []): ValidationError {
  return { property, constraints, children, target: {}, value: undefined };
}

describe('toFieldErrors', () => {
  it('collects every constraint message under its property name', () => {
    const errors = [
      error('title', { minLength: 'title must be longer than or equal to 3 characters' }),
      error('price', {
        isPositive: 'price must be a positive number',
        max: 'price must not be greater than 10000000',
      }),
    ];

    expect(toFieldErrors(errors)).toEqual({
      title: ['title must be longer than or equal to 3 characters'],
      price: ['price must be a positive number', 'price must not be greater than 10000000'],
    });
  });

  it('walks nested children under a dotted path', () => {
    const errors = [error('risk', {}, [error('level', { isEnum: 'level must be a valid enum value' })])];

    expect(toFieldErrors(errors)).toEqual({
      'risk.level': ['level must be a valid enum value'],
    });
  });

  it('ignores a property with children but no constraints of its own', () => {
    const errors = [error('risk', {}, [error('level', { isEnum: 'invalid' })])];
    expect(toFieldErrors(errors)).not.toHaveProperty('risk');
  });
});
