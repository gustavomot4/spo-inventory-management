// =============================================================================
// estoque/page.tsx — Módulo de Estoque
// SPO — Sistema Pimenta Ousada | EST-002 + EST-006
// =============================================================================
//
// Duas abas:
//   1. "Estoque Atual" — listagem de produtos com totalStock e status
//   2. "Nova Entrada"  — formulário para registrar entrada via POST /api/stock-entries
// =============================================================================

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Search,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { storeDayStartToUtc } from '@/lib/timezone'
import type {
  ProductListItem,
  ProductResponse,
  VariationResponse,
  StockEntryResponse,
  ApiResponse,
  ApiSuccess,
} from '@/types'

// ===========================================================================
// ABA 1 — ESTOQUE ATUAL (EST-006)
// ===========================================================================

type StockFilter = 'todos' | 'alerta' | 'zerado'

function getProductStatus(item: ProductListItem): 'ok' | 'low' | 'out' {
  if (item.totalStock === 0) return 'out'
  if (item.hasLowStock) return 'low'
  return 'ok'
}

function StatusBadge({ status }: { status: 'ok' | 'low' | 'out' }) {
  if (status === 'out') return <Badge variant="danger">Zerado</Badge>
  if (status === 'low') return <Badge variant="warning">Alerta</Badge>
  return <Badge variant="success">OK</Badge>
}

function EstoqueAtualTab() {
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StockFilter>('todos')

  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    fetch('/api/products?pageSize=100')
      .then(r => r.json())
      .then((json: ApiSuccess<ProductListItem[]>) => {
        if ('data' in json) {
          setProducts(json.data)
          // QA-023: avisar se a lista foi truncada (loja com mais de 100 SKUs)
          if (json.meta?.hasNextPage) setHasMore(true)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = products.filter(p => {
    if (!p.isActive) return false
    const status = getProductStatus(p)
    if (filter === 'alerta') return status === 'low' || status === 'out'
    if (filter === 'zerado') return status === 'out'
    return true
  })

  const outCount = products.filter(p => p.isActive && getProductStatus(p) === 'out').length
  const lowCount = products.filter(p => p.isActive && getProductStatus(p) === 'low').length

  const filterButtons: Array<{ key: StockFilter; label: string }> = [
    { key: 'todos', label: 'Todos' },
    { key: 'alerta', label: outCount + lowCount > 0 ? `Alerta (${outCount + lowCount})` : 'Alerta' },
    { key: 'zerado', label: outCount > 0 ? `Zerado (${outCount})` : 'Zerado' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div>
      {/* Filtros */}
      <div className="flex items-center gap-2 mb-4">
        {filterButtons.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
              filter === key
                ? 'bg-foreground text-background'
                : 'bg-surface border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* QA-023: aviso de lista truncada em lojas com mais de 100 SKUs */}
      {hasMore && (
        <div className="mb-3 rounded-lg border border-warning-border bg-warning-muted px-4 py-2.5 text-sm text-warning">
          Exibindo os primeiros 100 produtos cadastrados. Filtre por categoria para ver todos.
        </div>
      )}

      {/* Tabela */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-success mb-3" strokeWidth={1.5} />
          <p className="text-sm font-medium text-foreground">
            {filter === 'todos' ? 'Nenhum produto ativo' : 'Nenhum produto nesta categoria'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {filter === 'todos' ? 'Cadastre produtos em /produtos/novo' : 'Todos os produtos estão OK'}
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Cabeçalho — desktop */}
          <div className="hidden sm:grid grid-cols-[1fr_8rem_6rem_7rem_7rem] gap-3 px-5 py-2.5 border-b border-border bg-muted/30">
            {['Produto', 'Categoria', 'Variações', 'Estoque', 'Status'].map(h => (
              <p key={h} className="text-xs font-medium text-muted-foreground">{h}</p>
            ))}
          </div>

          <ul className="divide-y divide-border">
            {filtered.map(p => {
              const status = getProductStatus(p)
              return (
                <li key={p.id}>
                  <Link
                    href={`/produtos/${p.id}`}
                    className="flex sm:grid sm:grid-cols-[1fr_8rem_6rem_7rem_7rem] gap-3 px-5 py-3.5 items-center hover:bg-muted/30 transition-colors"
                  >
                    {/* Nome */}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground sm:hidden">{p.categoryName}</p>
                    </div>
                    {/* Categoria */}
                    <p className="hidden sm:block text-sm text-muted-foreground truncate">{p.categoryName}</p>
                    {/* Variações */}
                    <p className="hidden sm:block text-sm text-foreground">
                      {p.variationCount} var.
                    </p>
                    {/* Estoque */}
                    <p className="hidden sm:block text-sm font-medium text-foreground">
                      {p.totalStock} un.
                    </p>
                    {/* Status */}
                    <div className="hidden sm:flex">
                      <StatusBadge status={status} />
                    </div>
                    {/* Mobile: estoque + status inline */}
                    <div className="sm:hidden flex items-center gap-2 ml-auto shrink-0">
                      <p className="text-sm font-medium text-foreground">{p.totalStock} un.</p>
                      <StatusBadge status={status} />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// ABA 2 — NOVA ENTRADA (EST-002)
// ===========================================================================

interface EntradaFormErrors {
  productId?: string
  variationId?: string
  quantity?: string
  general?: string
}

interface EntradaSuccess {
  message: string
  stockAfter: number
}

function NovaEntradaTab() {
  // Busca de produto
  const [productSearch, setProductSearch] = useState('')
  const [productSuggestions, setProductSuggestions] = useState<ProductListItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  // Produto e variação selecionados
  const [selectedProduct, setSelectedProduct] = useState<ProductListItem | null>(null)
  const [variations, setVariations] = useState<VariationResponse[]>([])
  const [variationId, setVariationId] = useState('')
  const [variationsLoading, setVariationsLoading] = useState(false)

  // Campos do formulário
  const [quantity, setQuantity] = useState('')
  const [notes, setNotes] = useState('')
  const [receivedAt, setReceivedAt] = useState('')

  // Estado de submit
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<EntradaFormErrors>({})
  const [success, setSuccess] = useState<EntradaSuccess | null>(null)
  // QA-065: trava síncrona contra duplo-clique
  const inFlight = useRef(false)

  // Buscar produtos conforme digita
  useEffect(() => {
    if (!productSearch.trim()) {
      setProductSuggestions([])
      return
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(productSearch.trim())}&pageSize=20`)
        const json: ApiSuccess<ProductListItem[]> = await res.json()
        if ('data' in json) setProductSuggestions(json.data.filter(p => p.isActive))
      } catch {
        // silencioso
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [productSearch])

  // Carregar variações quando produto é selecionado
  const loadVariations = useCallback(async (productId: string) => {
    setVariationsLoading(true)
    setVariations([])
    setVariationId('')
    try {
      const res = await fetch(`/api/products/${productId}`)
      const json: ApiResponse<ProductResponse> = await res.json()
      if ('data' in json) {
        const active = json.data.variations.filter(v => v.isActive)
        setVariations(active)
        if (active.length === 1 && active[0]) setVariationId(active[0].id)
      }
    } catch {
      // silencioso
    } finally {
      setVariationsLoading(false)
    }
  }, [])

  function selectProduct(p: ProductListItem) {
    setSelectedProduct(p)
    setProductSearch(p.name)
    setShowSuggestions(false)
    setErrors(e => ({ ...e, productId: undefined }))
    loadVariations(p.id)
  }

  function clearProduct() {
    setSelectedProduct(null)
    setProductSearch('')
    setVariations([])
    setVariationId('')
  }

  function validate(): boolean {
    const errs: EntradaFormErrors = {}
    if (!selectedProduct) errs.productId = 'Selecione um produto'
    if (!variationId) errs.variationId = 'Selecione uma variação'
    const qty = parseInt(quantity, 10)
    if (!quantity || isNaN(qty) || qty <= 0) errs.quantity = 'Quantidade deve ser inteiro > 0'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit() {
    if (inFlight.current) return
    if (!validate()) return
    inFlight.current = true
    setSubmitting(true)
    setSuccess(null)

    const payload: Record<string, unknown> = {
      variationId,
      quantity: parseInt(quantity, 10),
    }
    if (notes.trim()) payload.notes = notes.trim()
    // QA-084: o input type="date" retorna "YYYY-MM-DD" e new Date("YYYY-MM-DD")
    // interpreta como MEIA-NOITE UTC = 21h do dia ANTERIOR no fuso da loja
    // (UTC−3) → toda entrada com data escolhida caia no dia comercial errado.
    // storeDayStartToUtc converte para o instante UTC do início do dia NO FUSO
    // DA LOJA (mesma solução do QA-055 para filtros de venda).
    if (receivedAt) payload.receivedAt = storeDayStartToUtc(receivedAt)

    try {
      const res = await fetch('/api/stock-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json: ApiResponse<StockEntryResponse> = await res.json()

      if (!res.ok) {
        const code = 'code' in json ? (json as { code?: string }).code : undefined
        // QA-049: sessao expirada — redirecionar para reautenticar
        if (code === 'UNAUTHORIZED') { window.location.href = '/pin?redirect=/estoque'; return }
        const errMsg =
          code === 'VARIATION_INACTIVE' ? 'Variação inativa' :
          code === 'VARIATION_NOT_FOUND' ? 'Variação não encontrada' :
          code === 'INVALID_QUANTITY' ? 'Quantidade inválida' :
          'error' in json ? json.error : 'Erro ao registrar entrada'
        setErrors({ general: errMsg })
        return
      }

      if ('data' in json) {
        setSuccess({
          message: `Entrada registrada com sucesso.`,
          stockAfter: json.data.stockAfter,
        })
        // Limpar campos mas manter produto/variação
        setQuantity('')
        setNotes('')
        setReceivedAt('')
        setErrors({})
        // Recarregar variações para refletir novo estoque
        if (selectedProduct) loadVariations(selectedProduct.id)
      }
    } catch {
      setErrors({ general: 'Erro de conexão. Tente novamente.' })
    } finally {
      setSubmitting(false)
      inFlight.current = false
    }
  }

  const selectedVariation = variations.find(v => v.id === variationId)

  return (
    <div className="max-w-xl">
      {/* Feedback de sucesso */}
      {success && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-success-border bg-success-muted px-4 py-3.5">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-success">{success.message}</p>
            <p className="text-sm text-success mt-0.5">
              Novo estoque: <strong>{success.stockAfter} unidades</strong>
            </p>
          </div>
        </div>
      )}

      {/* 1. Produto */}
      <div className="bg-surface rounded-xl border border-border shadow-sm mb-4">
        <div className="px-5 py-3.5 border-b border-border">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Produto e Variação
          </p>
        </div>
        <div className="px-5 py-4 space-y-4">
          {/* Campo de busca de produto */}
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <input
                type="text"
                value={productSearch}
                onChange={e => {
                  setProductSearch(e.target.value)
                  setShowSuggestions(true)
                  if (selectedProduct && e.target.value !== selectedProduct.name) clearProduct()
                  setErrors(er => ({ ...er, productId: undefined }))
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Buscar produto por nome..."
                className={cn(
                  'w-full rounded-lg border bg-background pl-9 pr-4 py-2 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-ring/50',
                  errors.productId ? 'border-destructive' : 'border-input',
                  selectedProduct ? 'text-foreground font-medium' : 'text-foreground'
                )}
              />
              {searchLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {errors.productId && (
              <p className="mt-1 text-xs text-destructive">{errors.productId}</p>
            )}

            {/* Sugestões */}
            {showSuggestions && productSuggestions.length > 0 && !selectedProduct && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg overflow-hidden">
                {productSuggestions.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={() => selectProduct(p)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.categoryName} · {p.variationCount} var. · {p.totalStock} un.</p>
                    </div>
                    <ChevronDown className="h-4 w-4 text-muted-foreground rotate-[-90deg] shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Select de variação */}
          {selectedProduct && (
            <div>
              {variationsLoading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando variações...
                </div>
              ) : variations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Nenhuma variação ativa</p>
              ) : (
                <Select
                  label="Variação"
                  value={variationId}
                  onChange={e => {
                    setVariationId(e.target.value)
                    setErrors(er => ({ ...er, variationId: undefined }))
                    setSuccess(null)
                  }}
                  error={errors.variationId}
                  placeholder="Selecione..."
                  options={variations.map(v => {
                    const label = [v.sku, [v.size, v.color].filter(Boolean).join(' ') || '—']
                      .join(' — ')
                    return {
                      value: v.id,
                      label: `${label} (Estoque: ${v.stockQuantity} un.)`,
                    }
                  })}
                />
              )}
            </div>
          )}

          {/* Info da variação selecionada */}
          {selectedVariation && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Estoque atual:&nbsp;
                <span className={cn(
                  'font-semibold',
                  selectedVariation.stockQuantity === 0 ? 'text-destructive' : 'text-foreground'
                )}>
                  {selectedVariation.stockQuantity} un.
                </span>
                &nbsp;· Mínimo: {selectedVariation.minStock} un.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 2. Detalhes da entrada */}
      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden mb-5">
        <div className="px-5 py-3.5 border-b border-border">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Detalhes da Entrada
          </p>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Quantidade *"
              type="number"
              min={1}
              value={quantity}
              onChange={e => { setQuantity(e.target.value); setErrors(er => ({ ...er, quantity: undefined })); setSuccess(null) }}
              error={errors.quantity}
              placeholder="Ex: 10"
            />

          </div>
          <Input
            label="Observações"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ex: Nota fiscal 1234"
          />
          <Input
            label="Data de recebimento"
            type="date"
            value={receivedAt}
            onChange={e => setReceivedAt(e.target.value)}
            hint="Opcional — padrão: hoje"
          />
        </div>
      </div>

      {/* Erro geral */}
      {errors.general && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-danger-muted px-4 py-3">
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{errors.general}</p>
        </div>
      )}

      {/* Botão */}
      <Button onClick={handleSubmit} loading={submitting} className="w-full sm:w-auto">
        Registrar Entrada
      </Button>
    </div>
  )
}

// ===========================================================================
// PÁGINA PRINCIPAL
// ===========================================================================

type Tab = 'estoque' | 'entrada'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'estoque', label: 'Estoque Atual' },
  { key: 'entrada', label: 'Nova Entrada' },
]

function renderEstoque() { return <EstoqueAtualTab /> }
function renderEntrada() { return <NovaEntradaTab /> }

export default function EstoquePage() {
  const [activeTab, setActiveTab] = useState<Tab>('estoque')

  return (
    <div className="px-4 py-7 sm:px-6 lg:px-8 max-w-4xl mx-auto">
      {/* Cabeçalho */}
      <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">Estoque</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Consulte o estoque atual e registre novas entradas de mercadoria
      </p>

      {/* Abas */}
      <div className="flex items-center gap-1 mb-6 border-b border-border">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === key
                ? 'border-ring text-accent-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      {activeTab === 'estoque' && renderEstoque()}
      {activeTab === 'entrada' && renderEntrada()}
    </div>
  )
}
