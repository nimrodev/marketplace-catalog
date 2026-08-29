import { useEffect, useRef, useState } from 'react';
import { ListingCategory, ListingCondition, ListingOption } from '@marketplace/shared';
import { categoryLabel, optionLabel } from '../detail/labels';
import { conditionLabel } from './conditionTone';
import { Badge, Button, Select } from '../primitives';
import { useCatalogFilters, type CatalogFilters, type FilterKey } from './useCatalogFilters';
import styles from './FilterBar.module.css';

const PRICE_DEBOUNCE_MS = 400;

// A ref for the commit callback means the debounce effect only needs the
// raw input text as its dependency — no risk of the *result* of committing
// (filters/updateFilters changing) re-triggering the timer it just fired.
function useDebouncedCommit(input: string, commit: (value: string) => void, delayMs: number) {
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    const timer = setTimeout(() => commitRef.current(input), delayMs);
    return () => clearTimeout(timer);
  }, [input, delayMs]);
}

function activeChips(filters: CatalogFilters): { key: FilterKey; label: string; removeValue?: string }[] {
  const chips: { key: FilterKey; label: string; removeValue?: string }[] = [];
  if (filters.category) chips.push({ key: 'category', label: categoryLabel(filters.category) });
  if (filters.condition) chips.push({ key: 'condition', label: conditionLabel(filters.condition) });
  if (filters.minPrice !== undefined) chips.push({ key: 'minPrice', label: `Min $${filters.minPrice.toLocaleString()}` });
  if (filters.maxPrice !== undefined) chips.push({ key: 'maxPrice', label: `Max $${filters.maxPrice.toLocaleString()}` });
  if (filters.negotiable) chips.push({ key: 'negotiable', label: 'Negotiable only' });
  for (const option of filters.options ?? []) {
    chips.push({ key: 'options', label: optionLabel(option), removeValue: option });
  }
  return chips;
}

export function FilterBar() {
  const { filters, updateFilters, toggleOption, removeFilter, clearAll } = useCatalogFilters();
  const [expanded, setExpanded] = useState(false);
  const [minPriceInput, setMinPriceInput] = useState(filters.minPrice?.toString() ?? '');
  const [maxPriceInput, setMaxPriceInput] = useState(filters.maxPrice?.toString() ?? '');

  // Filters are the URL's source of truth — if it changes from outside
  // this component (a chip removed, back/forward, a pasted link), the
  // debounced local input state has to follow, not fight it.
  useEffect(() => setMinPriceInput(filters.minPrice?.toString() ?? ''), [filters.minPrice]);
  useEffect(() => setMaxPriceInput(filters.maxPrice?.toString() ?? ''), [filters.maxPrice]);

  useDebouncedCommit(
    minPriceInput,
    (value) => {
      const parsed = value.trim() === '' ? undefined : Number(value);
      if (parsed !== filters.minPrice && (parsed === undefined || Number.isFinite(parsed))) {
        updateFilters({ minPrice: parsed }, { replace: true });
      }
    },
    PRICE_DEBOUNCE_MS,
  );

  useDebouncedCommit(
    maxPriceInput,
    (value) => {
      const parsed = value.trim() === '' ? undefined : Number(value);
      if (parsed !== filters.maxPrice && (parsed === undefined || Number.isFinite(parsed))) {
        updateFilters({ maxPrice: parsed }, { replace: true });
      }
    },
    PRICE_DEBOUNCE_MS,
  );

  const chips = activeChips(filters);

  return (
    <div className={styles.wrap}>
      {/* The default (bordered) variant, not ghost — a ghost button here
          reads as plain text with no tap affordance at all. */}
      <Button className={styles.toggle} aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
        <span>Filters{chips.length > 0 ? ` (${chips.length})` : ''}</span>
        <span className={expanded ? styles.chevronOpen : styles.chevron} aria-hidden="true">
          ▾
        </span>
      </Button>

      <div className={expanded ? `${styles.panel} ${styles.open}` : styles.panel}>
        <Select
          label="Category"
          value={filters.category ?? ''}
          onChange={(e) => updateFilters({ category: e.target.value ? (e.target.value as ListingCategory) : undefined })}
        >
          <option value="">Any category</option>
          {Object.values(ListingCategory).map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </Select>

        <Select
          label="Condition"
          value={filters.condition ?? ''}
          onChange={(e) => updateFilters({ condition: e.target.value ? (e.target.value as ListingCondition) : undefined })}
        >
          <option value="">Any condition</option>
          {Object.values(ListingCondition).map((c) => (
            <option key={c} value={c}>
              {conditionLabel(c)}
            </option>
          ))}
        </Select>

        <div className={styles.priceRow}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Min price</span>
            <input
              type="number"
              min="0"
              className={styles.priceInput}
              value={minPriceInput}
              onChange={(e) => setMinPriceInput(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Max price</span>
            <input
              type="number"
              min="0"
              className={styles.priceInput}
              value={maxPriceInput}
              onChange={(e) => setMaxPriceInput(e.target.value)}
            />
          </label>
        </div>

        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={filters.negotiable ?? false}
            onChange={(e) => updateFilters({ negotiable: e.target.checked || undefined })}
          />
          Negotiable only
        </label>

        <fieldset className={styles.fieldset}>
          <legend className={styles.fieldLabel}>Options</legend>
          {Object.values(ListingOption).map((option) => (
            <label key={option} className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={(filters.options ?? []).includes(option)}
                onChange={() => toggleOption(option)}
              />
              {optionLabel(option)}
            </label>
          ))}
        </fieldset>
      </div>

      {chips.length > 0 && (
        <div className={styles.chipRow}>
          {chips.map((chip, i) => (
            <button
              key={`${chip.key}-${chip.removeValue ?? i}`}
              type="button"
              className={styles.chipButton}
              onClick={() => (chip.removeValue ? toggleOption(chip.removeValue as ListingOption) : removeFilter(chip.key))}
            >
              <Badge tone="accentSoft">{chip.label} ×</Badge>
            </button>
          ))}
          <Button variant="ghost" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}
