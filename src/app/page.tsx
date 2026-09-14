// =============================================================================
// page.tsx — Dashboard / Painel Principal
// SPO — Sistema Pimenta Ousada | EST-005
// =============================================================================
//
// Serve a rota raiz "/". Está em app/ (fora do grupo (app)/) portanto usa
// AppShell diretamente para ter hamburger mobile + sidebar desktop.
// Exibe widget de alertas de estoque quando há itens OUT ou LOW.
// =============================================================================

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import type { StockAlertItem, ApiSuccess } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function variationLabel(item: StockAlertItem): string {
  const parts = [item.size, item.color].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : item.variationSku
}

// ---------------------------------------------------------------------------
// Widget de alertas
// ---------------------------------------------------------------------------

const MAX_SHOWN = 5

function AlertWidget() {
  const [alerts, setAlerts] = useState<StockAlertItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/stock/alerts')
      .then(r => r.json())
      .then((json: ApiSuccess<StockAlertItem[]>) => {
        if ('data' in json) setAlerts(json.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-5 py-4 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Verificando estoque...</p>
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-5 py-4 shadow-sm">
        <CheckCircle2 className="h-5 w-5 text-success shrink-0" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">
          Estoque OK — nenhum alerta no momento
        </p>
      </div>
    )
  }

  const shown = alerts.slice(0, MAX_SHOWN)
  const remaining = alerts.length - MAX_SHOWN

  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">Alertas de Estoque</p>
        </div>
        <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground px-2">
          {alerts.length}
        </span>
      </div>

      {/* Lista */}
      <ul className="divide-y divide-border">
        {shown.map(item => (
          <li key={item.variationId} className="flex items-center gap-3 px-5 py-3">
            {item.status === 'OUT' ? (
              <XCircle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" aria-hidden="true" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {item.productName}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {variationLabel(item)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {item.status === 'OUT' ? (
                <span className="text-xs font-semibold text-destructive">ZERADO</span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {item.stockQuantity}/{item.minStock} un.
                </span>
              )}
            </div>
          </li>
        ))}
        {remaining > 0 && (
          <li className="px-5 py-3">
            <p className="text-xs text-muted-foreground">+ {remaining} outros com alerta</p>
          </li>
        )}
      </ul>

      {/* Rodapé */}
      <div className="px-5 py-3 border-t border-border bg-muted/20">
        <Link
          href="/estoque"
          className="text-sm font-medium text-accent-foreground hover:text-accent-foreground transition-colors"
        >
          Ver estoque completo →
        </Link>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="px-4 py-7 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
          Painel
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Visão geral do sistema
        </p>

        <AlertWidget />
      </div>
    </AppShell>
  )
}
