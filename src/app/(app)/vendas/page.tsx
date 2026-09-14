// =============================================================================
// vendas/page.tsx — Histórico de Vendas (VEND-005)
// SPO — Sistema Pimenta Ousada
// =============================================================================
'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn, formatCurrency, formatDateTime } from '@/lib/utils'
import type { SaleListItem, ApiSuccess } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PeriodFilter = 'today' | 'week' | 'month' | 'all'
type StatusFilter = 'all' | 'ACTIVE' | 'CANCELLED'

function getPeriodDates(period: PeriodFilter): { dateFrom?: string; dateTo?: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const toDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (period === 'today') {
    const t = toDate(now)
    return { dateFrom: t, dateTo: t }
  }
  if (period === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    return { dateFrom: toDate(start), dateTo: toDate(now) }
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { dateFrom: toDate(start), dateTo: toDate(now) }
  }
  return {}
}

function SaleRow({ sale }: { sale: SaleListItem }) {
  const cancelled = sale.status === 'CANCELLED'
  const hasDiscount = sale.discountCents > 0

  return (
    <Link
      href={`/vendas/${sale.id}`}
      className="grid grid-cols-[7rem_1fr_4rem_8rem_7rem] gap-3 px-5 py-3.5 items-center hover:bg-muted/30 transition-colors border-b border-border last:border-0"
    >
      <div>
        <p className="text-xs text-foreground">{formatDateTime(new Date(sale.createdAt)).split(',')[0]}</p>
        <p className="text-xs text-muted-foreground">{formatDateTime(new Date(sale.createdAt)).split(',')[1]}</p>
        <p className="text-[0.625rem] font-mono text-muted-foreground/70">#{sale.id.slice(0, 8).toUpperCase()}</p>
      </div>
      <p className="text-sm text-foreground">{sale.paymentMethodLabel}</p>
      <p className="text-sm text-muted-foreground text-center">{sale.itemCount} it.</p>
      <div className="text-right">
        {hasDiscount && (
          <p className="text-xs text-muted-foreground line-through">{formatCurrency(sale.subtotalCents)}</p>
        )}
        <p className={cn('text-sm font-medium', cancelled ? 'text-muted-foreground line-through' : 'text-foreground')}>
          {formatCurrency(sale.totalCents)}
        </p>
      </div>
      <div className="flex justify-end">
        <Badge variant={cancelled ? 'muted' : 'success'}>
          {cancelled ? 'Cancelada' : 'Ativa'}
        </Badge>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  today: 'Hoje',
  week: 'Esta semana',
  month: 'Este mês',
  all: 'Todas',
}

export default function VendasPage() {
  const [sales, setSales] = useState<SaleListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)

  const [period, setPeriod] = useState<PeriodFilter>('today')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [codeSearch, setCodeSearch] = useState('')
  const [codeQuery, setCodeQuery] = useState('')

  // Debounce da busca por código
  useEffect(() => {
    const t = setTimeout(() => setCodeQuery(codeSearch.trim().toLowerCase()), 400)
    return () => clearTimeout(t)
  }, [codeSearch])

  const fetchSales = useCallback(async (opts: {
    period: PeriodFilter
    status: StatusFilter
    code?: string
    cursorParam?: string
    append?: boolean
  }) => {
    const params = new URLSearchParams()
    params.set('pageSize', '20')
    if (opts.code) {
      params.set('code', opts.code)
    } else {
      const dates = getPeriodDates(opts.period)
      if (dates.dateFrom) params.set('dateFrom', dates.dateFrom)
      if (dates.dateTo) params.set('dateTo', dates.dateTo)
    }
    if (opts.status !== 'all') params.set('status', opts.status)
    if (opts.cursorParam) params.set('cursor', opts.cursorParam)

    const res = await fetch(`/api/sales?${params}`)
    // A tela de Vendas é ÁREA ABERTA — sem PIN para entrar. GET /api/sales é público
    // (decisão do cliente 2026-06-12). Este 401 é só uma rede de segurança defensiva
    // e, na prática, NÃO dispara. NÃO transformar /vendas em rota protegida por PIN.
    if (res.status === 401) { window.location.href = '/pin?redirect=/vendas'; return }
    const json: ApiSuccess<SaleListItem[]> = await res.json()
    if (!('data' in json)) return

    if (opts.append) {
      setSales(prev => [...prev, ...json.data])
    } else {
      setSales(json.data)
    }
    setHasNextPage(json.meta?.hasNextPage ?? false)
    setCursor(json.meta?.cursor ?? null)
  }, [])

  useEffect(() => {
    setLoading(true)
    // QA-050: catch para falhas de rede
    fetchSales({ period, status: statusFilter, code: codeQuery || undefined })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [period, statusFilter, codeQuery, fetchSales])

  async function handleLoadMore() {
    if (!cursor) return
    setLoadingMore(true)
    await fetchSales({ period, status: statusFilter, code: codeQuery || undefined, cursorParam: cursor, append: true })
    setLoadingMore(false)
  }

  return (
    <div className="px-4 py-7 sm:px-6 lg:px-8 max-w-4xl mx-auto">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Vendas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Registro e histórico de vendas</p>
        </div>
        <Link href="/vendas/nova">
          <Button size="md">
            <Plus className="h-4 w-4" />
            Nova Venda
          </Button>
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        {/* Período */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          {(Object.keys(PERIOD_LABELS) as PeriodFilter[]).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                period === p
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Status */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-36"
        >
          <option value="all">Todas</option>
          <option value="ACTIVE">Ativas</option>
          <option value="CANCELLED">Canceladas</option>
        </select>

        {/* Busca por código */}
        <div className="relative sm:ml-auto sm:w-44">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={codeSearch}
            onChange={e => setCodeSearch(e.target.value.toUpperCase().slice(0, 8))}
            placeholder="Buscar #CÓDIGO"
            maxLength={8}
            className="w-full rounded-lg border border-input bg-background pl-8 pr-3 py-2 text-sm font-mono uppercase placeholder:normal-case placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
        {/* Header */}
        <div className="hidden sm:grid grid-cols-[7rem_1fr_4rem_8rem_7rem] gap-3 px-5 py-2.5 border-b border-border bg-muted/30">
          {['Data/hora', 'Método', 'Itens', 'Total', 'Status'].map(h => (
            <p key={h} className="text-xs font-medium text-muted-foreground">{h}</p>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm font-medium text-foreground">Nenhuma venda encontrada</p>
            <p className="text-xs text-muted-foreground mt-1">
              {period === 'today' ? 'Nenhuma venda hoje ainda.' : 'Tente um período diferente.'}
            </p>
            <Link href="/vendas/nova" className="mt-4">
              <Button size="sm">
                <Plus className="h-3.5 w-3.5" />
                Registrar venda
              </Button>
            </Link>
          </div>
        ) : (
          sales.map(sale => <SaleRow key={sale.id} sale={sale} />)
        )}
      </div>

      {/* Carregar mais */}
      {hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={handleLoadMore} loading={loadingMore}>
            Carregar mais
          </Button>
        </div>
      )}
    </div>
  )
}
