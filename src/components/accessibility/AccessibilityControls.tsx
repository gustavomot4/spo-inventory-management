'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useAccessibility } from './AccessibilityProvider'
import { FONT_SCALES } from '@/lib/accessibility'
import { cn } from '@/lib/utils'

const THEMES = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const

const buttonClass = 'min-h-10 min-w-0 flex-1 rounded-md px-1 py-2 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted'

export function AccessibilityControls() {
  const { fontScale, theme, ready, setFontScale, setTheme } = useAccessibility()
  const index = FONT_SCALES.indexOf(fontScale)

  return (
    <section aria-label="Acessibilidade" className="no-print space-y-2">
      <p className="text-xs font-semibold text-foreground">Acessibilidade</p>
      <div role="group" aria-label="Tamanho da fonte" className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        <button type="button" className={buttonClass} aria-label="Diminuir fonte"
          disabled={!ready || index === 0} onClick={() => setFontScale(FONT_SCALES[index - 1]!)}>A−</button>
        <button type="button" className={buttonClass} aria-label="Restaurar fonte para 100%"
          disabled={!ready} onClick={() => setFontScale(100)}>
          <span aria-live="polite">{ready ? `${fontScale}%` : 'Fonte'}</span>
        </button>
        <button type="button" className={buttonClass} aria-label="Aumentar fonte"
          disabled={!ready || index === FONT_SCALES.length - 1} onClick={() => setFontScale(FONT_SCALES[index + 1]!)}>A+</button>
      </div>
      <div role="group" aria-label="Tema de aparência" className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        {THEMES.map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" aria-label={`Tema ${label.toLowerCase()}`}
            aria-pressed={ready && theme === value} disabled={!ready} onClick={() => setTheme(value)}
            className={cn(buttonClass, 'flex flex-col items-center gap-1', ready && theme === value && 'bg-accent text-accent-foreground')}>
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}
