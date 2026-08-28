import type { ComponentPropsWithoutRef, ElementType } from 'react';
import { cx } from '../../cx';
import styles from './Button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

export type ButtonProps<T extends ElementType = 'button'> = {
  as?: T;
  variant?: ButtonVariant;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'variant'>;

const VARIANT_CLASS: Record<ButtonVariant, string | undefined> = {
  default: undefined,
  primary: styles.primary,
  ghost: styles.ghost,
  danger: styles.danger,
};

// `as` mirrors Card's polymorphism — an edit link (as={Link}) gets real
// routing and keyboard focus instead of a disabled-looking button.
export function Button<T extends ElementType = 'button'>({ as, variant = 'default', className, ...props }: ButtonProps<T>) {
  const Component = as ?? 'button';
  const classes = cx(styles.btn, VARIANT_CLASS[variant], className);
  return <Component className={classes} type={as ? undefined : 'button'} {...props} />;
}
