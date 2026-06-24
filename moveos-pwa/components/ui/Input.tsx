'use client';

import { forwardRef, useId, useState, type ChangeEvent, type InputHTMLAttributes, type ReactNode } from 'react';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string;
  error?: string;
  hint?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, prefix, suffix, className = '', id, value, defaultValue, onChange, onFocus, onBlur, disabled, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [focused, setFocused] = useState(false);
  const [innerValue, setInnerValue] = useState(defaultValue?.toString() ?? '');
  const currentValue = value === undefined ? innerValue : value.toString();
  const isFloating = focused || currentValue.length > 0 || props.placeholder !== undefined;
  const helperText = error ?? hint;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (value === undefined) {
      setInnerValue(event.target.value);
    }
    onChange?.(event);
  };

  return (
    <div className={['w-full', className].filter(Boolean).join(' ')}>
      <div
        className={[
          'relative flex min-h-[52px] items-center rounded-xl border bg-[var(--surface)] px-4 transition-all',
          error ? 'border-[var(--red-600)]' : 'border-[var(--border)]',
          focused && !error ? 'border-[var(--brand)] ring-2 ring-[var(--teal-100)]' : '',
          disabled ? 'bg-[var(--surface-inset)] opacity-70' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {prefix ? <div className="mr-3 flex shrink-0 items-center text-[var(--text-secondary)]">{prefix}</div> : null}
        <div className="relative min-w-0 flex-1">
          <label
            htmlFor={inputId}
            className={[
              'pointer-events-none absolute left-0 transition-all duration-150',
              isFloating ? 'top-[-0.45rem] text-micro uppercase text-[var(--brand)]' : 'top-1/2 -translate-y-1/2 text-body text-[var(--text-secondary)]',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {label}
          </label>
          <input
            ref={ref}
            id={inputId}
            value={value}
            defaultValue={defaultValue}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={helperText ? `${inputId}-helper` : undefined}
            className={[
              'h-[52px] w-full bg-transparent pt-3 text-body text-[var(--text-primary)] outline-none placeholder:text-[var(--text-hint)]',
              isFloating ? '' : 'placeholder:text-transparent',
            ].join(' ')}
            onChange={handleChange}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            {...props}
          />
        </div>
        {suffix ? <div className="ml-3 flex shrink-0 items-center text-[var(--text-secondary)]">{suffix}</div> : null}
      </div>
      {helperText ? (
        <p id={`${inputId}-helper`} className={['mt-1.5 text-small', error ? 'text-[var(--red-600)]' : 'text-[var(--text-secondary)]'].join(' ')}>
          {helperText}
        </p>
      ) : null}
    </div>
  );
});
