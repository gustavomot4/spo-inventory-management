// =============================================================================
// relatorios/page.tsx — Relatórios (REL-003 + REL-004 + REL-005)
// SPO — Sistema Pimenta Ousada
// =============================================================================
'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Printer,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Package,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  ReceiptText,
  BarChart2,
  Banknote,
  Percent,
  DollarSign,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Button } from '@/components/ui/Button'
import { cn, formatCurrency } from '@/lib/utils'
import type {
  StockReportItem,
  StockReportMeta,
  SalesReportData,
  ApiSuccess,
} from '@/types'

// ---------------------------------------------------------------------------
// Tipos locais
// ---------------------------------------------------------------------------

type Tab = 'stock' | 'sales'
type PeriodFilter = 'today' | 'week' | 'month' | 'custom'
type StatusFilter = 'all' | 'ok' | 'low' | 'out'

// ---------------------------------------------------------------------------
// Helpers de data
// ---------------------------------------------------------------------------

function getDateRange(period: PeriodFilter): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const toDate = (d: Date) =>
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  const today = toDate(now)

  if (period === 'today') return { dateFrom: today, dateTo: today }
  if (period === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    return { dateFrom: toDate(start), dateTo: today }
  }
  if (period === 'month') {
    return {
      dateFrom: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-01',
      dateTo: today,
    }
  }
  return { dateFrom: '', dateTo: '' }
}

// ---------------------------------------------------------------------------
// SummaryCard
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
  hint,
}: {
  label: string
  value: string
  icon: React.ElementType
  accent?: boolean
  hint?: string
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface p-4 flex flex-col gap-3',
        accent && 'border-accent-border bg-accent/30'
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <div
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-lg',
            accent ? 'bg-accent' : 'bg-muted'
          )}
        >
          <Icon
            className={cn(
              'h-3.5 w-3.5',
              accent ? 'text-accent-foreground' : 'text-muted-foreground'
            )}
            aria-hidden="true"
          />
        </div>
      </div>
      <div>
        <p
          className={cn(
            'text-2xl font-bold tracking-tight',
            accent ? 'text-accent-foreground' : 'text-foreground'
          )}
        >
          {value}
        </p>
        {hint && (
          <p className="mt-1 text-xs text-muted-foreground leading-tight">{hint}</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StockStatusBadge
// ---------------------------------------------------------------------------

function StockStatusBadge({ status }: { status: 'ok' | 'low' | 'out' }) {
  if (status === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        OK
      </span>
    )
  }
  if (status === 'low') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Alerta
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
      <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Zerado
    </span>
  )
}

// ---------------------------------------------------------------------------
// Aba Estoque
// ---------------------------------------------------------------------------

function StockTab() {
  const [items, setItems] = useState<StockReportItem[]>([])
  const [meta, setMeta] = useState<StockReportMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  useEffect(() => {
    if (loaded) return
    setLoading(true)
    setErrorMsg(null)
    fetch('/api/reports/stock')
      .then(r => {
        // QA-024: PIN expirou (8h) → redirecionar para /pin
        if (r.status === 401) { window.location.href = '/pin?redirect=/relatorios'; return null }
        return r.json().then((json: unknown) => ({ ok: r.ok, json }))
      })
      .then((result: { ok: boolean; json: unknown } | null) => {
        if (!result) return
        const { ok, json } = result
        // QA-044: tratar erros HTTP explicitamente em vez de silenciar
        if (!ok || !('data' in (json as object))) {
          setErrorMsg('Erro ao carregar relatório de estoque. Tente novamente.')
          return
        }
        const j = json as ApiSuccess<StockReportItem[]> & { meta?: StockReportMeta }
        setItems(j.data)
        if (j.meta) setMeta(j.meta as StockReportMeta)
      })
      .catch(() => setErrorMsg('Erro de conexão. Verifique a rede e tente novamente.'))
      .finally(() => {
        setLoading(false)
        setLoaded(true)
      })
  }, [loaded])

  const filtered =
    statusFilter === 'all' ? items : items.filter(i => i.status === statusFilter)

  const pillOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todos' + (meta ? ' (' + meta.total + ')' : '') },
    { value: 'ok', label: 'OK' + (meta ? ' (' + meta.okCount + ')' : '') },
    { value: 'low', label: 'Alerta' + (meta ? ' (' + meta.lowCount + ')' : '') },
    { value: 'out', label: 'Zerado' + (meta ? ' (' + meta.outCount + ')' : '') },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-6 w-6 animate-spin rounded-full border-2 border-ring border-t-transparent"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">Carregando estoque...</p>
        </div>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <XCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">{errorMsg}</p>
        <button
          type="button"
          onClick={() => setLoaded(false)}
          className="text-xs text-accent-foreground underline underline-offset-2"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* QA-052: aviso de truncamento se o limite de 2000 variações for atingido */}
      {items.length >= 2000 && (
        <div className="rounded-lg border border-warning-border bg-warning-muted px-4 py-2.5 text-sm text-warning">
          Exibindo os primeiros 2.000 resultados. Filtre por categoria para ver todos os itens.
        </div>
      )}
      {meta && (
        <>
          {/* Cards de status */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Total" value={String(meta.total)} icon={Package} />
            <SummaryCard label="OK" value={String(meta.okCount)} icon={CheckCircle2} />
            <SummaryCard label="Alerta" value={String(meta.lowCount)} icon={AlertTriangle} />
            <SummaryCard label="Zerado" value={String(meta.outCount)} icon={XCircle} />
          </div>

          {/* Cards financeiros */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard
              label="Valor em Estoque"
              value={formatCurrency(meta.totalStockValueCents)}
              icon={Banknote}
              hint="Receita potencial se tudo for vendido"
            />
            <SummaryCard
              label="Custo Investido"
              value={meta.totalStockCostCents !== null ? formatCurrency(meta.totalStockCostCents) : '--'}
              icon={TrendingDown}
              hint={
                meta.totalStockCostCents === null
                  ? 'Cadastre o preco de custo nos produtos'
                  : meta.costCoveragePct !== null && meta.costCoveragePct < 100
                  ? 'Cobre apenas ' + meta.costCoveragePct + '% dos itens'
                  : undefined
              }
            />
            <SummaryCard
              label="Lucro Potencial"
              value={meta.estimatedPotentialProfitCents !== null ? formatCurrency(meta.estimatedPotentialProfitCents) : '--'}
              icon={DollarSign}
              hint={
                meta.estimatedPotentialProfitCents === null
                  ? 'Cadastre o preco de custo nos produtos'
                  : meta.costCoveragePct !== null && meta.costCoveragePct < 100
                  ? 'Superestimado — custo em so ' + meta.costCoveragePct + '% dos itens'
                  : 'Se todo o estoque for vendido'
              }
            />
          </div>
        </>
      )}

      {/* Pills de filtro */}
      <div className="no-print flex flex-wrap gap-2">
        {pillOptions.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={cn(
              'rounded-full px-3.5 py-1 text-xs font-medium transition-colors border',
              statusFilter === opt.value
                ? 'bg-foreground text-background border-foreground'
                : 'bg-surface text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Package className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-foreground">Nenhum item encontrado</p>
          <p className="mt-1 text-xs text-muted-foreground">Tente outro filtro de status.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">Produto</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">Tam / Cor</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">SKU</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest text-muted-foreground">Estoque</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest text-muted-foreground">Min.</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest text-muted-foreground">Preco</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest text-muted-foreground">Val. Estoque</th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr
                  key={item.variationId}
                  className={cn(
                    'border-b border-border last:border-0 transition-colors',
                    item.status === 'out' && 'bg-danger-muted/40',
                    item.status === 'low' && 'bg-warning-muted/30'
                  )}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">{item.categoryName}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {(item.size || item.color)
                      ? [item.size, item.color].filter(Boolean).join(' / ')
                      : <span className="text-muted-foreground/40">--</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted-foreground">{item.variationSku}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn(
                      'text-sm font-semibold',
                      item.status === 'out' && 'text-destructive',
                      item.status === 'low' && 'text-warning',
                      item.status === 'ok' && 'text-foreground'
                    )}>
                      {item.stockQuantity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{item.minStock}</td>
                  <td className="px-4 py-3 text-right text-sm text-muted-foreground">{formatCurrency(item.priceCents)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-foreground">{formatCurrency(item.stockValueCents)}</td>
                  <td className="px-4 py-3 text-center">
                    <StockStatusBadge status={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cores do PieChart
// ---------------------------------------------------------------------------

const PIE_COLORS = [1, 2, 3, 4].map(index => `rgb(var(--chart-${index}))`)
const TOOLTIP_STYLE = { fontSize: '0.75rem', borderRadius: 8, backgroundColor: 'rgb(var(--surface))', borderColor: 'rgb(var(--border))', color: 'rgb(var(--foreground))' }

// ---------------------------------------------------------------------------
// Top 5 Variações com ordenação
// ---------------------------------------------------------------------------

type TopSort = 'qty' | 'revenue' | 'profit'

function TopVariationsSection({ variations }: { variations: import('@/types').TopVariation[] }) {
  const [sort, setSort] = useState<TopSort>('qty')

  const sorted = [...variations]
    .sort((a, b) => {
      if (sort === 'qty') return b.quantitySold - a.quantitySold
      if (sort === 'revenue') return b.revenueCents - a.revenueCents
      // profit: null vai pro fim
      const pa = a.estimatedProfitCents ?? -Infinity
      const pb = b.estimatedProfitCents ?? -Infinity
      return pb - pa
    })
    .slice(0, 5)

  const sortOptions: { value: TopSort; label: string }[] = [
    { value: 'qty', label: 'Quantidade' },
    { value: 'revenue', label: 'Receita' },
    { value: 'profit', label: 'Lucro' },
  ]

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-foreground">Top 5 mais vendidas</h2>
        <div className="no-print flex gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
          {sortOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSort(opt.value)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-all',
                sort === opt.value
                  ? 'bg-surface text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="w-8 px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">#</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">Produto</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">Tam / Cor</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest text-muted-foreground">Qtd</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest text-muted-foreground">Receita</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest text-muted-foreground">Lucro Est.</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((v, idx) => (
              <tr key={v.variationId} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <span className={cn(
                    'text-xs font-bold',
                    idx === 0 && 'text-warning',
                    idx === 1 && 'text-zinc-400',
                    idx === 2 && 'text-warning',
                    idx > 2 && 'text-muted-foreground'
                  )}>
                    {idx + 1}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{v.productName}</p>
                  <p className="font-mono text-xs text-muted-foreground">{v.variationSku}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {(v.size || v.color)
                    ? [v.size, v.color].filter(Boolean).join(' / ')
                    : <span className="text-muted-foreground/40">--</span>
                  }
                </td>
                <td className="px-4 py-3 text-right font-semibold text-foreground">{v.quantitySold}</td>
                <td className="px-4 py-3 text-right font-medium text-foreground">{formatCurrency(v.revenueCents)}</td>
                <td className="px-4 py-3 text-right text-sm">
                  {v.estimatedProfitCents !== null ? (
                    <span className={v.estimatedProfitCents >= 0 ? 'font-medium text-success' : 'font-medium text-destructive'}>
                      {formatCurrency(v.estimatedProfitCents)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">--</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Aba Vendas
// ---------------------------------------------------------------------------

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  today: 'Hoje',
  week: 'Esta semana',
  month: 'Este mes',
  custom: 'Personalizado',
}

function SalesTab() {
  const [data, setData] = useState<SalesReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [period, setPeriod] = useState<PeriodFilter>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const loadSales = useCallback((dateFrom: string, dateTo: string) => {
    if (!dateFrom || !dateTo) return
    setLoading(true)
    setErrorMsg(null)
    setData(null)
    fetch('/api/reports/sales?dateFrom=' + dateFrom + '&dateTo=' + dateTo)
      .then(r => {
        // QA-024: PIN expirou → redirecionar para /pin
        if (r.status === 401) { window.location.href = '/pin?redirect=/relatorios'; return null }
        return r.json().then((json: unknown) => ({ ok: r.ok, json }))
      })
      .then((result: { ok: boolean; json: unknown } | null) => {
        if (!result) return
        const { ok, json } = result
        // QA-044: tratar erros HTTP explicitamente — inclui 400 DATE_RANGE_TOO_LARGE (fix QA-033)
        if (!ok) {
          const code = (json as { code?: string })?.code
          const msg = code === 'DATE_RANGE_TOO_LARGE'
            ? 'Período muito longo. O máximo permitido é 12 meses.'
            : 'error' in (json as object)
            ? (json as { error: string }).error
            : 'Erro ao carregar relatório. Tente novamente.'
          setErrorMsg(msg)
          return
        }
        if ('data' in (json as object)) setData((json as ApiSuccess<SalesReportData>).data)
      })
      .catch(() => setErrorMsg('Erro de conexão. Verifique a rede e tente novamente.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (period === 'custom') return
    const range = getDateRange(period)
    loadSales(range.dateFrom, range.dateTo)
  }, [period, loadSales])

  const handleCustomApply = () => {
    if (customFrom && customTo) loadSales(customFrom, customTo)
  }

  const summary = data?.summary

  return (
    <div className="space-y-6">
      <div className="no-print space-y-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PERIOD_LABELS) as PeriodFilter[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-full px-3.5 py-1 text-xs font-medium transition-colors border',
                period === p
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-surface text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground'
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">De</label>
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Ate</label>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button size="sm" onClick={handleCustomApply} disabled={!customFrom || !customTo}>
              Aplicar
            </Button>
          </div>
        )}
      </div>

      {/* QA-044: banner de erro explicito em vez de tela vazia */}
      {!loading && errorMsg && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <XCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">{errorMsg}</p>
          <button
            type="button"
            onClick={() => { const range = period !== 'custom' ? getDateRange(period) : { dateFrom: customFrom, dateTo: customTo }; if (range.dateFrom && range.dateTo) loadSales(range.dateFrom, range.dateTo) }}
            className="text-xs text-accent-foreground underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-6 w-6 animate-spin rounded-full border-2 border-ring border-t-transparent"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">Carregando relatorio...</p>
          </div>
        </div>
      )}

      {!loading && data && (
        <div className="space-y-8">
          {/* QA-053: aviso de truncamento — relatorio calculado sobre amostra parcial */}
          {summary!.truncated && (
            <div className="rounded-lg border border-warning-border bg-warning-muted px-4 py-2.5 text-sm text-warning" role="alert">
              Este periodo tem {summary!.totalSalesInPeriod.toLocaleString('pt-BR')} vendas, acima do limite de 5.000.
              Os totais abaixo consideram apenas parte das vendas e estao subestimados.
              Reduza o intervalo de datas para ver numeros completos.
            </div>
          )}
          {/* Cards principais */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="Vendas" value={String(summary!.totalSales)} icon={ShoppingBag} />
            <SummaryCard label="Receita" value={formatCurrency(summary!.totalRevenue)} icon={TrendingUp} />
            <SummaryCard label="Canceladas" value={String(summary!.cancelledCount)} icon={XCircle} />
          </div>

          {/* Taxas + Lucro + Margem na mesma linha.
              QA-078: Taxas Pagas NAO depende de custo cadastrado (taxa e dado real
              gravado na venda — REL-006); lucro/margem dependem do custo. */}
          {(summary!.totalFeeCents > 0 || summary!.estimatedProfitCents !== null) && (
            <div className="grid grid-cols-3 gap-3">
              {summary!.totalFeeCents > 0 && (
                <SummaryCard
                  label="Taxas Pagas"
                  value={formatCurrency(summary!.totalFeeCents)}
                  icon={TrendingDown}
                  hint="Descontado do lucro estimado"
                />
              )}
              {summary!.estimatedProfitCents !== null && (
                <>
                  <SummaryCard
                    label="Lucro Estimado"
                    value={formatCurrency(summary!.estimatedProfitCents ?? 0)}
                    icon={DollarSign}
                    hint={
                      summary!.costCoveragePct !== null && summary!.costCoveragePct < 100
                        ? 'Base de custo parcial (' + summary!.costCoveragePct + '% dos itens)'
                        : 'Receita menos custo e taxas'
                    }
                  />
                  <SummaryCard
                    label="Margem"
                    value={summary!.estimatedMarginPct !== null ? summary!.estimatedMarginPct + '%' : '--'}
                    icon={Percent}
                    hint={
                      summary!.costCoveragePct !== null && summary!.costCoveragePct < 100
                        ? 'Estimativa parcial — veja o aviso abaixo'
                        : 'Percentual de lucro sobre a receita'
                    }
                  />
                </>
              )}
            </div>
          )}
          {summary!.estimatedProfitCents === null && (
            <div className="rounded-xl border border-dashed border-border bg-surface/50 px-4 py-3 text-xs text-muted-foreground">
              Cadastre o <strong>preco de custo</strong> nos produtos em{' '}
              <strong>Cadastro de Produtos</strong> para ver lucro e margem estimados.
            </div>
          )}
          {/* QA-078: aviso de cobertura parcial — sem isto, lucro/margem aparecem
              inflados (receita de TODOS os itens menos custo de SO ALGUNS). */}
          {summary!.estimatedProfitCents !== null &&
            summary!.costCoveragePct !== null &&
            summary!.costCoveragePct < 100 && (
            <div className="rounded-lg border border-warning-border bg-warning-muted px-4 py-2.5 text-sm text-warning" role="alert">
              Apenas {summary!.costCoveragePct}% dos itens vendidos tem preco de custo cadastrado.
              O lucro e a margem acima estao <strong>superestimados</strong> — cadastre o custo
              nos demais produtos para ver numeros completos.
            </div>
          )}

          {summary!.totalSales === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <BarChart2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-foreground">Nenhuma venda no periodo</p>
              <p className="mt-1 text-xs text-muted-foreground">Escolha outro periodo para ver os dados.</p>
            </div>
          )}

          {summary!.totalSales > 0 && (
            <>
              {/* Por metodo de pagamento — PieChart + tabela */}
              {data.byPaymentMethod.length > 0 && (
                <section>
                  <h2 className="mb-3 text-sm font-semibold text-foreground">Por metodo de pagamento</h2>
                  <div className="rounded-xl border border-border bg-surface p-4">
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                      <div className="w-full sm:w-48 shrink-0">
                        <ResponsiveContainer width="100%" height={180}>
                          <PieChart>
                            <Pie
                              data={data.byPaymentMethod.map(r => ({ name: r.paymentMethodLabel, value: r.totalCents / 100 }))}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={80}
                              paddingAngle={3}
                              stroke="rgb(var(--surface))"
                              dataKey="value"
                            >
                              {data.byPaymentMethod.map((_, idx) => (
                                <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(v) => 'R$ ' + Number(v).toFixed(2)}
                              contentStyle={TOOLTIP_STYLE}
                              itemStyle={{ color: 'rgb(var(--foreground))' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex-1 w-full min-w-0 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="pb-2 text-left text-xs font-medium uppercase tracking-widest text-muted-foreground">Metodo</th>
                              <th className="pb-2 text-right text-xs font-medium uppercase tracking-widest text-muted-foreground">Vendas</th>
                              <th className="pb-2 text-right text-xs font-medium uppercase tracking-widest text-muted-foreground">Total</th>
                              <th className="pb-2 text-right text-xs font-medium uppercase tracking-widest text-muted-foreground">Taxas</th>
                              <th className="pb-2 text-right text-xs font-medium uppercase tracking-widest text-muted-foreground">Líquido</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.byPaymentMethod.map((row, idx) => (
                              <tr key={row.paymentMethod} className="border-b border-border/50 last:border-0">
                                <td className="py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                                      style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                                    />
                                    {row.paymentMethodLabel}
                                  </div>
                                </td>
                                <td className="py-2.5 text-right text-muted-foreground">{row.count}</td>
                                <td className="py-2.5 text-right font-medium text-foreground">{formatCurrency(row.totalCents)}</td>
                                <td className="py-2.5 text-right text-muted-foreground">{row.feeCents > 0 ? formatCurrency(row.feeCents) : '—'}</td>
                                <td className="py-2.5 text-right font-medium text-foreground">{formatCurrency(row.netCents)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Top 10 variações */}
              {data.topVariations.length > 0 && (
                <TopVariationsSection variations={data.topVariations} />
              )}

              {/* Receita por dia — BarChart Recharts */}
              {data.byDay.length > 0 && (
                <section>
                  <h2 className="mb-3 text-sm font-semibold text-foreground no-print">Receita por dia</h2>
                  <div className="rounded-xl border border-border bg-surface p-4">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={data.byDay.map(d => ({
                          date: new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
                          receita: d.revenueCents / 100,
                          vendas: d.count,
                        }))}
                        margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: '0.6875rem', fill: 'rgb(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                        <YAxis
                          tick={{ fontSize: '0.6875rem', fill: 'rgb(var(--muted-foreground))' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: number) => 'R$' + v.toFixed(0)}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgb(var(--muted))' }}
                          formatter={(value) => ['R$ ' + Number(value).toFixed(2), 'Receita']}
                          labelStyle={{ fontSize: '0.75rem', color: 'rgb(var(--foreground))' }}
                          contentStyle={TOOLTIP_STYLE}
                              itemStyle={{ color: 'rgb(var(--foreground))' }}
                        />
                        <Bar dataKey="receita" fill="rgb(var(--chart-1))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {!loading && !data && period === 'custom' && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <ReceiptText className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-foreground">Selecione o periodo</p>
          <p className="mt-1 text-xs text-muted-foreground">Informe as datas e clique em Aplicar.</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pagina principal
// ---------------------------------------------------------------------------

export default function RelatoriosPage() {
  const [activeTab, setActiveTab] = useState<Tab>('stock')

  return (
    <div className="px-4 py-7 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Relatorios</h1>
          <p className="mt-1 text-sm text-muted-foreground">Analises e relatorios do sistema</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="no-print shrink-0"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          Imprimir
        </Button>
      </div>

      <div className="no-print mb-6 flex gap-1 rounded-xl border border-border bg-muted/40 p-1 w-fit">
        <button
          onClick={() => setActiveTab('stock')}
          className={cn(
            'rounded-lg px-4 py-1.5 text-sm font-medium transition-all',
            activeTab === 'stock'
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Estoque
        </button>
        <button
          onClick={() => setActiveTab('sales')}
          className={cn(
            'rounded-lg px-4 py-1.5 text-sm font-medium transition-all',
                     activeTab === 'sales'
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Vendas
        </button>
      </div>

      {/* Conteúdo da aba */}
      {activeTab === 'stock' ? <StockTab /> : <SalesTab />}

    </div>
  )
}
