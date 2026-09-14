'use client'

// =============================================================================
// pin/page.tsx — Tela de verificação de PIN
// SPO — Sistema Pimenta Ousada
// =============================================================================
//
// Exibida quando usuário tenta acessar área protegida sem sessão ativa.
// PIN padrão: 1234 (configurável via APP_PIN no .env)
// =============================================================================

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Flame, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AccessibilityControls } from '@/components/accessibility/AccessibilityControls'

const PIN_LENGTH = 4

function PinScreen() {
  const searchParams = useSearchParams()
  // QA-016: sanitizar redirect — aceitar apenas caminhos relativos internos
  const rawRedirect = searchParams.get('redirect') ?? '/produtos'
  const redirectTo = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
    ? rawRedirect
    : '/produtos'

  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // QA-025: redirecionar se sessão PIN já está ativa
  useEffect(() => {
    fetch('/api/auth/status')
      .then(r => r.json())
      .then((j: { authenticated: boolean }) => {
        if (j.authenticated) window.location.href = redirectTo
      })
      .catch(() => {})
  }, [redirectTo])

  // Foca no primeiro input ao montar
  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  async function submitPin(pin: string) {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })

      if (res.ok) {
        window.location.href = redirectTo
      } else {
        setError('PIN incorreto. Tente novamente.')
        setDigits(Array(PIN_LENGTH).fill(''))
        setTimeout(() => inputRefs.current[0]?.focus(), 50)
      }
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const newDigits = [...digits]
    newDigits[index] = digit
    setDigits(newDigits)
    setError(null)

    if (digit && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }

    if (digit && index === PIN_LENGTH - 1) {
      const pin = newDigits.join('')
      if (pin.length === PIN_LENGTH) {
        submitPin(pin)
      }
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH)
    if (pasted.length === PIN_LENGTH) {
      const newDigits = pasted.split('')
      setDigits(newDigits)
      submitPin(pasted)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary mb-4">
            <Flame className="h-6 w-6 text-white" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Pimenta Ousada
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sistema de Gestão de Estoque
          </p>
        </div>

        {/* Card do PIN */}
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
          <div className="flex items-center justify-center gap-2 mb-5">
            <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">
              Digite o PIN de acesso
            </p>
          </div>

          {/* Inputs dos dígitos */}
          <div className="flex justify-center gap-3 mb-5" onPaste={handlePaste}>
            {Array.from({ length: PIN_LENGTH }).map((_, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digits[i] ? '•' : ''}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={loading}
                aria-label={`Dígito ${i + 1} do PIN`}
                className={cn(
                  'h-14 w-14 min-w-0 rounded-xl border-2 text-center text-2xl font-bold',
                  'focus:outline-none focus:border-ring transition-colors',
                  'disabled:opacity-50',
                  error
                    ? 'border-destructive bg-danger-muted text-destructive'
                    : digits[i]
                    ? 'border-accent-border bg-accent text-accent-foreground'
                    : 'border-border bg-background text-foreground'
                )}
              />
            ))}
          </div>

          {/* Erro */}
          {error && (
            <p className="text-center text-sm text-destructive mb-3" role="alert">
              {error}
            </p>
          )}

          {/* Estado loading */}
          {loading && (
            <p className="text-center text-sm text-muted-foreground">
              Verificando...
            </p>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
                Área protegida — somente pessoal autorizado
        </p>
        <div className="mt-6 rounded-xl border border-border bg-surface p-4">
          <AccessibilityControls />
        </div>
      </div>
    </div>
  )
}

export default function PinPage() {
  return (
    <Suspense>
      <PinScreen />
    </Suspense>
  )
}
