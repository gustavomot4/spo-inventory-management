// =============================================================================
// Button.tsx — Botão base reutilizável
// SPO — Sistema Pimenta Ousada
// =============================================================================

import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          // Base
          'inline-flex items-center justify-center gap-2 font-medium rounded-lg',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // Sizes
          size === 'sm' && 'px-3 py-1.5 text-xs',
          size === 'md' && 'px-4 py-2 text-sm',
          size === 'lg' && 'px-5 py-2.5 text-sm',
          // Variants
          variant === 'primary' &&
            'bg-primary text-white hover:bg-primary-hover',
          variant === 'secondary' &&
            'bg-surface border border-border text-foreground hover:bg-muted',
          variant === 'destructive' &&
            'bg-danger-solid text-destructive-foreground hover:opacity-90',
          variant === 'ghost' &&
            'text-foreground hover:bg-muted',
          className
        )}
        {...props}
      >
        {loading && (
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export { Button }
