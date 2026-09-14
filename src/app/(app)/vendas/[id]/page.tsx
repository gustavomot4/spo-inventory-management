// =============================================================================
// vendas/[id]/page.tsx — Detalhe da Venda + Comanda (VEND-006 + COM-001/002/003/005)
// SPO — Sistema Pimenta Ousada
// =============================================================================
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer, Loader2, AlertTriangle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { SaleResponse, SettingsResponse, ApiResponse } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function variationDesc(size: string, color: string, sku: string): string {
  const parts = [size, color].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : sku
}

// ---------------------------------------------------------------------------
// Componente Comanda (visível na tela + imprimível)
// ---------------------------------------------------------------------------

function Comanda({ sale, settings }: { sale: SaleResponse; settings: SettingsResponse | null }) {
  const saleCode = sale.id.slice(0, 8).toUpperCase()
  const dateStr = formatDateTime(new Date(sale.createdAt))

  return (
    <div className="receipt max-w-[24rem] mx-auto break-words font-mono text-[0.6875rem] leading-relaxed bg-surface rounded-xl border border-border shadow-sm p-5 print-only">
      {/* Cabeçalho da loja */}
      <div className="text-center mb-3">
        <p className="font-bold text-sm uppercase tracking-wide">{settings?.shopName ?? 'Pimenta Ousada'}</p>
        {settings?.address && <p className="text-xs">{settings.address}</p>}
        {settings?.phone && <p className="text-xs">{settings.phone}</p>}
      </div>

      <p className="border-t border-dashed border-input my-2" />

      {/* Identificação da venda */}
      <div className="text-center mb-2">
        <p>Venda: #{saleCode}</p>
        <p>{dateStr}</p>
        {sale.status === 'CANCELLED' && (
          <p className="font-bold mt-1">*** VENDA CANCELADA ***</p>
        )}
      </div>

      <p className="border-t border-dashed border-input my-2" />

      {/* Itens */}
      <div className="space-y-2 mb-2">
        {sale.items.map(item => (
          <div key={item.id} className="receipt-item">
            <p className="font-medium">{item.productName}</p>
            {(item.size || item.color) && (
              <p className="text-muted-foreground">{variationDesc(item.size, item.color, item.variationSku)}</p>
            )}
            <div className="flex justify-between">
              <span>{item.quantity} x {formatCurrency(item.unitPriceCents)}</span>
              <span>{formatCurrency(item.subtotalCents)}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="border-t border-dashed border-input my-2" />

      {/* Totais */}
      <div className="space-y-0.5 mb-2">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatCurrency(sale.subtotalCents)}</span>
        </div>
        {sale.discountCents > 0 && (
          <div className="flex justify-between">
            <span>Desconto</span>
            <span>-{formatCurrency(sale.discountCents)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-[0.8125rem] pt-0.5">
          <span>TOTAL</span>
          <span>{formatCurrency(sale.totalCents)}</span>
        </div>
      </div>

      <p className="border-t border-dashed border-input my-2" />

      {/* Pagamento — maquininha e taxa omitidos intencionalmente (dado interno) */}
      <p className="mb-1">
        Pagamento: {sale.paymentMethodLabel}
        {sale.installments > 1 && ` — ${sale.installments}×`}
      </p>

      <p className="border-t border-dashed border-input my-3" />

      {/* Rodapé */}
      <div className="text-center">
        <p>Obrigada pela preferencia!</p>
        <p>Volte sempre!</p>
      </div>
      <p className="border-t border-dashed border-input my-2" />
      <div className="text-center">
        <p className="font-bold">** DOCUMENTO NAO FISCAL **</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal de cancelamento
// ---------------------------------------------------------------------------

function CancelModal({
  onConfirm,
  onClose,
  loading,
  errorMsg,
}: {
  onConfirm: (reason: string) => void
  onClose: () => void
  loading: boolean
  errorMsg?: string | null
}) {
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-surface shadow-xl p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Cancelar venda?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Esta ação devolve o estoque dos itens. Não pode ser desfeita.
            </p>
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            Motivo (opcional)
          </label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Ex: Desistência do cliente"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
        </div>
        {errorMsg && (
          <p className="mb-3 text-sm text-destructive rounded-lg bg-danger-muted border border-destructive/20 px-3 py-2">
            {errorMsg}
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="destructive" loading={loading} onClick={() => onConfirm(reason)} className="flex-1">
            Sim, cancelar
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={loading} className="flex-1">
            Voltar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function VendaDetalhePage() {
  const params = useParams<{ id: string }>()
  const saleId = params.id

  const [sale, setSale] = useState<SaleResponse | null>(null)
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  const loadSale = useCallback(async () => {
    // Carregar venda — falha aqui mostra "Venda não encontrada"
    try {
      const saleRes = await fetch(`/api/sales/${saleId}`)
      if (saleRes.status === 404) { setNotFound(true); return }
      if (!saleRes.ok) { setNotFound(true); return }
      const saleJson: ApiResponse<SaleResponse> = await saleRes.json()
      if ('data' in saleJson) setSale(saleJson.data)
      else setNotFound(true)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
    // Carregar settings separadamente — falha aqui não afeta a exibição da venda
    try {
      const settingsRes = await fetch('/api/settings')
      if (settingsRes.ok) {
        const settingsJson: ApiResponse<SettingsResponse> = await settingsRes.json()
        if ('data' in settingsJson) setSettings(settingsJson.data)
      }
    } catch { /* silencioso — comanda usa fallback 'Pimenta Ousada' */ }
  }, [saleId])

  useEffect(() => { loadSale() }, [loadSale])

  async function handleCancel(reason: string) {
    setCancelling(true)
    try {
      const res = await fetch(`/api/sales/${saleId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelReason: reason || undefined }),
      })
      const json: ApiResponse<SaleResponse> = await res.json()
      if (!res.ok) {
        const msg = 'error' in json ? (json as { error: string }).error : 'Erro ao cancelar venda'
        setCancelError(msg)
        return
      }
      if ('data' in json) setSale(json.data)
      setShowCancelModal(false)
    } catch {
      setCancelError('Erro de conexão. Tente novamente.')
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-accent-foreground" />
      </div>
    )
  }

  if (notFound || !sale) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-sm font-medium text-foreground">Venda não encontrada</p>
        <Link href="/vendas">
          <Button variant="secondary" className="mt-4">Voltar para Vendas</Button>
        </Link>
      </div>
    )
  }

  const cancelled = sale.status === 'CANCELLED'

  return (
    <>
      {showCancelModal && (
        <CancelModal
          onConfirm={handleCancel}
          onClose={() => { setShowCancelModal(false); setCancelError(null) }}
          loading={cancelling}
          errorMsg={cancelError}
        />
      )}

      <div className="receipt-page px-4 py-7 sm:px-6 lg:px-8 max-w-4xl mx-auto">

        {/* Cabeçalho — no-print */}
        <div className="no-print mb-6">
          <div className="flex flex-wrap items-start gap-3">
            <Link
              href="/vendas"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors mt-0.5"
              aria-label="Voltar às vendas"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Venda #{sale.id.slice(0, 8).toUpperCase()}
                </h1>
                <Badge variant={cancelled ? 'muted' : 'success'}>
                  {cancelled ? 'Cancelada' : 'Ativa'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {formatDateTime(new Date(sale.createdAt))} · {sale.paymentMethodLabel}
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2">
              <Link href="/vendas/nova">
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  Nova Venda
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                Imprimir Comanda
              </Button>
              {!cancelled && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowCancelModal(true)}
                >
                  Cancelar Venda
                </Button>
              )}
            </div>
          </div>

          {/* Banner cancelamento */}
          {cancelled && sale.cancelledAt && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-danger-muted px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">
                Venda cancelada em {formatDateTime(new Date(sale.cancelledAt))}
                {sale.cancelReason && ` · ${sale.cancelReason}`}
              </p>
            </div>
          )}
        </div>

        {/* Tabela de itens — no-print */}
        <div className="no-print bg-surface rounded-xl border border-border shadow-sm overflow-hidden mb-6">
          {/* Header */}
          <div className="hidden sm:grid grid-cols-[1fr_8rem_4rem_7rem_8rem] gap-3 px-5 py-2.5 border-b border-border bg-muted/30">
            {['Produto', 'Tam/Cor', 'Qtd', 'Unit.', 'Subtotal'].map(h => (
              <p key={h} className="text-xs font-medium text-muted-foreground">{h}</p>
            ))}
          </div>
          {sale.items.map(item => (
            <div key={item.id} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_8rem_4rem_7rem_8rem] gap-3 px-5 py-3 border-b border-border last:border-0 items-center">
              <p className="text-sm font-medium text-foreground break-words sm:truncate">{item.productName}</p>
              <p className="text-sm text-muted-foreground text-xs">
                {variationDesc(item.size, item.color, item.variationSku)}
              </p>
              <p className="text-sm text-foreground">{item.quantity}</p>
              <p className="text-sm text-foreground">{formatCurrency(item.unitPriceCents)}</p>
              <p className="text-sm font-medium text-foreground">{formatCurrency(item.subtotalCents)}</p>
            </div>
          ))}
          {/* Totais */}
          <div className="px-5 py-4 border-t border-border bg-muted/20 space-y-1.5">
            <div className="flex justify-end gap-8 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="w-24 text-right">{formatCurrency(sale.subtotalCents)}</span>
            </div>
            {sale.discountCents > 0 && (
              <div className="flex justify-end gap-8 text-sm">
                <span className="text-muted-foreground">Desconto</span>
                <span className="w-24 text-right text-destructive">-{formatCurrency(sale.discountCents)}</span>
              </div>
            )}
            {/* QA-073: feeCents/cardMachineName vêm null SEM sessão PIN (projeção
                pública de GET /api/sales/[id] — QA-064). Esta linha renderiza
                apenas para a dona autenticada (ela chega aqui via /vendas, cuja
                lista exige PIN). No fluxo aberto pós-venda (vendedora), ocultar a
                taxa é intencional — COM-007: dado interno. NÃO é ramo morto. */}
            {sale.feeCents && sale.feeCents > 0 && (
              <div className="flex justify-end gap-8 text-sm">
                <span className="text-muted-foreground">Taxa {sale.cardMachineName}</span>
                <span className="w-24 text-right text-muted-foreground">{formatCurrency(sale.feeCents)}</span>
              </div>
            )}
            <div className="flex justify-end gap-8 text-sm font-semibold border-t border-border pt-1.5">
              <span>Total</span>
              <span className="w-24 text-right text-accent-foreground">{formatCurrency(sale.totalCents)}</span>
            </div>
          </div>
        </div>

        {/* Comanda */}
        <div className="no-print mb-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
            Preview da Comanda
          </p>
        </div>
        <Comanda sale={sale} settings={settings} />
      </div>
    </>
  )
}
