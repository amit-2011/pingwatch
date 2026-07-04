import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  forwardRef,
} from 'react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';

/**
 * Buttons — pill radius, weight 600. Primary is the green action color (design system), with a
 * green focus ring shared by every variant. Sizes map to the design's --control-h scale.
 */
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'icon' }
>(({ className, variant = 'default', size = 'md', ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[background-color,box-shadow,transform,border-color] duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0',
      size === 'sm' && 'h-8 px-3.5 text-[13px]',
      size === 'md' && 'h-10 px-4.5 text-sm',
      size === 'lg' && 'h-11 px-6 text-[15px]',
      size === 'icon' && 'h-10 w-10 p-0',
      variant === 'default' && 'bg-primary text-white shadow-sm hover:bg-primary-hover',
      variant === 'secondary' &&
        'bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
      variant === 'outline' &&
        'border border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
      variant === 'ghost' &&
        'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
      variant === 'danger' && 'bg-red-500 text-white shadow-sm hover:bg-red-600',
      variant === 'link' && 'h-auto rounded-none px-1 text-brand-600 hover:underline dark:text-brand-400',
      className,
    )}
    {...props}
  />
));
Button.displayName = 'Button';

/** Inputs — white field, green focus ring, red error state (add `aria-invalid` for the error look). */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-signal/50 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-red-500 aria-invalid:focus-visible:ring-red-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('text-sm font-medium text-slate-800 dark:text-slate-300', className)}
      {...props}
    />
  );
}

/** Cards — 14px radius, slate-tinted soft shadow so they sit warm on the canvas. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[14px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0b1220]',
        className,
      )}
      {...props}
    />
  );
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-400',
        className,
      )}
      {...props}
    />
  );
}
