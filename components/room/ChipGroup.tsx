'use client';

interface Props<T extends string> {
  label?: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  labelFor: (option: T) => string;
}

/** A row of single-choice chips (filters, background effects, face props). */
export default function ChipGroup<T extends string>({ label, options, value, onChange, labelFor }: Props<T>) {
  return (
    <>
      {label && (
        <p className="panel-title" style={{ marginTop: 14 }}>
          {label}
        </p>
      )}
      <div className="filter-chips" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            className={`filter-chip ${value === option ? 'active' : ''}`}
            onClick={() => onChange(option)}
          >
            {labelFor(option)}
          </button>
        ))}
      </div>
    </>
  );
}
