import { cx } from '../cx';
import styles from './StatusTabs.module.css';

export interface StatusTab<T extends string> {
  value: T;
  label: string;
  tone?: 'rejected';
}

export interface StatusTabsProps<T extends string> {
  tabs: StatusTab<T>[];
  active: T;
  onChange: (value: T) => void;
}

// Status is a mode a viewer switches into, not a filter that composes with
// others (a listing has exactly one status) — a permanent tab row keeps it
// glanceable instead of one more field inside the (collapsed-by-default)
// filter panel.
export function StatusTabs<T extends string>({ tabs, active, onChange }: StatusTabsProps<T>) {
  return (
    <div className={styles.tabrow} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === active}
          className={cx(
            styles.tab,
            tab.value === active && styles.active,
            tab.value === active && tab.tone === 'rejected' && styles.rejectedActive,
          )}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
