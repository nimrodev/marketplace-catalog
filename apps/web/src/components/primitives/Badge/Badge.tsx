import type { ReactNode } from 'react';
import { cx } from '../../cx';
import styles from './Badge.module.css';

// Tone-driven, not enum-driven — mapping condition/risk/status values to
// a tone is each consumer's job (MAR-37/39).
export type BadgeTone = 'neutral' | 'accent' | 'accentSoft' | 'success' | 'warning' | 'danger' | 'outline';

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  const classes = cx(styles.badge, styles[tone], className);
  return (
    <span className={classes}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}
