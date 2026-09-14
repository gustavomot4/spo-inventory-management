// =============================================================================
// Badge.tsx — Badge de status reutilizável
// SPO — Sistema Pimenta Ousada
// =============================================================================

import { cn } from '@/lib/utils'

export interface BadgeProps {
  variant: 'success' | 'warning' | 'danger' | 'muted' | 'brand'
  children: React.ReactNode
  className?: string
}

export function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variant === 'success' &&
          'bg-success-muted text-success border border-success-border',
        variant === 'warning' &&
          'bg-warning-muted text-warning border border-warning-border',
        variant === 'danger' &&
          'bg-danger-muted text-destructive border border-danger-border',
        variant === 'muted' &&
          'bg-muted text-muted-foreground',
        variant === 'brand' &&
          'bg-accent text-accent-foreground border border-accent-border',
        className
      )}
    >
      {children}
    </span>
  )
}
