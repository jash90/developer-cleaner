import type { ReactNode } from 'react';

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export function CloseIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export type ChipTone = 'danger' | 'warn' | 'muted' | 'ok' | 'info';

const CHIP_TONES: Record<ChipTone, string> = {
  // Red is reserved for "you lose work".
  danger: 'bg-red-100 text-red-700',
  warn: 'bg-amber-100 text-amber-800',
  muted: 'bg-slate-100 text-slate-600',
  ok: 'bg-green-100 text-green-800',
  info: 'bg-blue-50 text-blue-700',
};

export function Chip({
  tone = 'muted',
  title,
  children,
}: {
  tone?: ChipTone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center h-[18px] px-1.5 rounded-full text-[10.5px] font-medium whitespace-nowrap ${CHIP_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Proportional bar beside a size, to compare at a glance without coloured numbers. */
export function SizeBar({ bytes, max }: { bytes: number; max: number }) {
  const percent = max > 0 ? Math.max(2, Math.round((bytes / max) * 100)) : 0;
  return (
    <span className="inline-block h-1 w-14 shrink-0 rounded-full bg-slate-200 overflow-hidden" aria-hidden="true">
      <span className="block h-1 bg-slate-400" style={{ width: `${percent}%` }} />
    </span>
  );
}

interface CheckboxProps {
  checked: boolean;
  /** Some but not all of a group: shown as a dash. */
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
  className?: string;
}

export function Checkbox({
  checked,
  indeterminate = false,
  disabled = false,
  label,
  onChange,
  className = '',
}: CheckboxProps) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      ref={(input) => {
        if (input) input.indeterminate = indeterminate && !checked;
      }}
      onChange={onChange}
      onClick={(event) => event.stopPropagation()}
      className={`w-3.5 h-3.5 shrink-0 accent-blue-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${className}`}
    />
  );
}
