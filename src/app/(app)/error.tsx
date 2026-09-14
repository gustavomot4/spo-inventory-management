'use client'
// =============================================================================
// error.tsx — Error boundary global do grupo (app)
// SPO — Sistema Pimenta Ousada | QA-017
// =============================================================================
// Captura exceções não tratadas em Server Components (banco offline, query falha, etc.)
// Sem este arquivo, produção exibiria tela em branco silenciosamente.

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[SPO] Erro não capturado:', error)
  }, [error])

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 px-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-foreground">
          Algo deu errado ao carregar esta página.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Verifique sua conexão ou tente novamente.
        </p>
      </div>
      <button
        onClick={reset}
        className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
      >
        Tentar novamente
      </button>
    </div>
  )
}
