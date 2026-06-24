'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--brand)] text-white shadow-card hover:bg-[var(--teal-800)]',
  secondary: 'bg-[var(--brand-light)] text-[var(--brand)] hover:bg-[var(--teal-100)]',
  ghost: 'border border-[var(--border)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-inset)]',
  danger: 'border border-red-200 bg-[var(--red-50)] text-[var(--red-600)] hover:bg-red-100',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-[44px] px-4 text-small',
  md: 'min-h-[52px] px-5 text-body',
  lg: 'min-h-[56px] px-6 text-heading',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  children,
  className = '',
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = [
    'relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl font-medium transition-all active:scale-[0.97]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-55',
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled || loading} type={type} {...props}>
      {loading ? (
        <span className="pahadi-spinner" aria-hidden="true" />
      ) : (
        <>
          {icon ? <span className="inline-flex shrink-0 items-center justify-center">{icon}</span> : null}
          <span>{children}</span>
        </>
      )}
    </button>
  );
}
