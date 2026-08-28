import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../../cx';
import styles from './Button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASS: Record<ButtonVariant, string | undefined> = {
  default: undefined,
  primary: styles.primary,
  ghost: styles.ghost,
  danger: styles.danger,
};

export function Button({ variant = 'default', className, type = 'button', ...props }: ButtonProps) {
  const classes = cx(styles.btn, VARIANT_CLASS[variant], className);
  return <button type={type} className={classes} {...props} />;
}
