import type { ComponentPropsWithoutRef, ElementType } from 'react';
import { cx } from '../../cx';
import styles from './Card.module.css';

export type CardProps<T extends ElementType> = {
  as?: T;
  interactive?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, 'as'>;

// `as` keeps Card free of routing knowledge — a clickable card renders
// as={Link} (MAR-37's job) and gets real keyboard focus for free.
export function Card<T extends ElementType = 'article'>({
  as,
  interactive = false,
  className,
  ...props
}: CardProps<T>) {
  const Component = as ?? 'article';
  const classes = cx(styles.card, interactive && styles.interactive, className);
  return <Component className={classes} {...props} />;
}
