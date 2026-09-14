// =============================================================================
// vendas/nova/page.tsx — PDV / Nova Venda (VEND-004)
// SPO — Sistema Pimenta Ousada
// =============================================================================
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Search, Loader2, X, Plus, Minus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
// removed unused Input
import { Select } from '@/components/ui/Select'
import {
  cn,
  formatCurrency,
  parseCurrencyToCents,
} from '@/lib/utils'
import {
  PAYMENT_METHOD,
  PAYMENT_METHOD_LABELS,
  CARD_PAYMENT_METHODS,
  type PaymentMethod,
} from '@/lib/enums'
import { formatBasisPoints } from '@/lib/utils'
import type {
  ProductListItem,
  ProductResponse,
  VariationResponse,
  CardMachineResponse,
  CardMachineInstallmentResponse,
  SaleResponse,
  ApiResponse,
  ApiSuccess,
} from '@/types'

// ---------------------------------------------------------------------------
// Tipos locais
// ---------------------------------------------------------------------------

interface CartItem {
  variationId: string
  variationSku: string
  productName: string
  size: string
  color: string
  quantity: number
  unitPriceCents: number
  maxStock: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function variationLabel(v: VariationResponse): string {
  const parts = [v.size, v.color].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : v.sku
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function NovaVendaPage() {
  const router = useRouter()

  // ── Busca de produto ──
  const [productSearch, setProductSearch] = useState('')
  const [productSuggestions, setProductSuggestions] = useState<ProductListItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  // ── Produto/variação selecionados para adicionar ──
  const [selectedProduct, setSelectedProduct] = useState<ProductResponse | null>(null)
  const [loadingProduct, setLoadingProduct] = useState(false)
  const [selectedVariationId, setSelectedVariationId] = useState('')
  const [addQty, setAddQty] = useState(1)

  // ── Carrinho ──
  const [cart, setCart] = useState<CartItem[]>([])

  // ── Pagamento ──
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('')
  const [cardMachines, setCardMachines] = useState<CardMachineResponse[]>([])
  const [cardMachineId, setCardMachineId] = useState('')
  const [discountInput, setDiscountInput] = useState('')
  // QA-079: desconto em valor fixo (R$) OU percentual (%) — RN-004.5 / FLUXO-001
  const [discountMode, setDiscountMode] = useState<'BRL' | 'PCT'>('BRL')
  const [installments, setInstallments] = useState(1)
  const [machineInstallments, setMachineInstallments] = useState<CardMachineInstallmentResponse[]>([])

  // ── Submit ──
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // QA-065: trava síncrona contra duplo-clique (não depende do ciclo de render do React)
  const inFlight = useRef(false)

  // ── Carregar maquininhas ──
  useEffect(() => {
    fetch('/api/card-machines')
      .then(r => r.json())
      .then((j: ApiSuccess<CardMachineResponse[]>) => {
        if ('data' in j) setCardMachines(j.data.filter(m => m.isActive))
      })
      .catch(() => {})
  }, [])

  // ── Busca com debounce ──
  useEffect(() => {
    if (!productSearch.trim()) { setProductSuggestions([]); return }
    const t = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const r = await fetch(`/api/products?search=${encodeURIComponent(productSearch.trim())}&pageSize=20&isActive=true`)
        const j: ApiSuccess<ProductListItem[]> = await r.json()
        if ('data' in j) setProductSuggestions(j.data)
      } catch { /* noop */ } finally { setSearchLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [productSearch])

  // ── Selecionar produto ──
  const selectProduct = useCallback(async (item: ProductListItem) => {
    setProductSearch(item.name)
    setShowSuggestions(false)
    setSelectedVariationId('')
    setAddQty(1)
    setLoadingProduct(true)
    try {
      const r = await fetch(`/api/products/${item.id}`)
      const j: ApiResponse<ProductResponse> = await r.json()
      if ('data' in j) {
        setSelectedProduct(j.data)
        const active = j.data.variations.filter(v => v.isActive)
        if (active.length === 1 && active[0]) setSelectedVariationId(active[0].id)
      }
    } catch { /* noop */ } finally { setLoadingProduct(false) }
  }, [])

  // ── Adicionar ao carrinho ──
  function handleAddToCart() {
    if (!selectedProduct || !selectedVariationId) return
    const variation = selectedProduct.variations.find(v => v.id === selectedVariationId)
    if (!variation) return

    const existing = cart.findIndex(c => c.variationId === selectedVariationId)
    if (existing >= 0) {
      const cur = cart[existing]
      if (!cur) return
      const newQty = cur.quantity + addQty
      if (newQty > cur.maxStock) return
      setCart(prev => prev.map((c, i) => i === existing ? { ...c, quantity: newQty } : c))
    } else {
      if (addQty > variation.stockQuantity) return
      setCart(prev => [...prev, {
        variationId: variation.id,
        variationSku: variation.sku,
        productName: selectedProduct.name,
        size: variation.size,
        color: variation.color,
        quantity: addQty,
        unitPriceCents: selectedProduct.priceCents,
        maxStock: variation.stockQuantity,
      }])
    }
    setProductSearch('')
    setSelectedProduct(null)
    setSelectedVariationId('')
    setAddQty(1)
    setSubmitError(null)
  }

  // ── Remover item ──
  function removeItem(variationId: string) {
    setCart(prev => prev.filter(c => c.variationId !== variationId))
  }

  // ── Alterar quantidade ──
  function setItemQty(variationId: string, qty: number) {
    setCart(prev => prev.map(c => {
      if (c.variationId !== variationId) return c
      const clamped = Math.max(1, Math.min(qty, c.maxStock))
      return { ...c, quantity: clamped }
    }))
  }

  // ── Cálculos ──
  const subtotalCents = cart.reduce((s, c) => s + c.unitPriceCents * c.quantity, 0)
  // QA-079: o percentual e convertido para centavos AQUI — a API continua
  // recebendo apenas discountCents absoluto (CHECK total = subtotal − desconto
  // do banco permanece intacto; backend nao muda).
  let discountCents = 0
  if (discountInput.trim()) {
    if (discountMode === 'PCT') {
      const pct = parseFloat(discountInput.replace(',', '.'))
      if (!isNaN(pct) && pct > 0) {
        discountCents = Math.round(subtotalCents * Math.min(pct, 100) / 100)
      }
    } else {
      try { discountCents = Math.max(0, parseCurrencyToCents(discountInput)) } catch { discountCents = 0 }
    }
  }
  const totalCents = Math.max(0, subtotalCents - discountCents)

  const selectedMachine = cardMachines.find(m => m.id === cardMachineId)
  // v2.5: taxa efetiva por método — crédito (à vista/parcelado), débito e PIX via maquininha
  const effectiveFeeBasisPoints =
    paymentMethod === PAYMENT_METHOD.CREDIT
      ? (installments > 1
        ? (machineInstallments.find(i => i.installments === installments)?.feeBasisPoints ?? selectedMachine?.feeBasisPoints ?? 0)
        : (selectedMachine?.feeBasisPoints ?? 0))
      : paymentMethod === PAYMENT_METHOD.DEBIT
        ? (selectedMachine?.debitFeeBasisPoints ?? 0)
        : paymentMethod === PAYMENT_METHOD.PIX
          ? (selectedMachine?.pixFeeBasisPoints ?? 0)
          : 0
  const feeCents = selectedMachine ? Math.round(totalCents * effectiveFeeBasisPoints / 10000) : 0

  async function loadMachineInstallments(machineId: string) {
    try {
      const res = await fetch(`/api/card-machines/${machineId}/installments`)
      const j: ApiSuccess<CardMachineInstallmentResponse[]> = await res.json()
      if ('data' in j) setMachineInstallments(j.data)
    } catch { /* noop */ }
  }

  // ── Finalizar ──
  async function handleSubmit() {
    // QA-065: previne dupla submissão (duplo-clique → venda duplicada + duplo decremento)
    if (inFlight.current) return
    setSubmitError(null)
    if (cart.length === 0) { setSubmitError('Adicione pelo menos um item ao carrinho.'); return }
    if (!paymentMethod) { setSubmitError('Selecione o método de pagamento.'); return }
    if (CARD_PAYMENT_METHODS.includes(paymentMethod as PaymentMethod) && !cardMachineId) {
      setSubmitError('Selecione a maquininha para pagamento com cartão.'); return
    }
    if (discountCents > subtotalCents) { setSubmitError('Desconto não pode ser maior que o subtotal.'); return }

    inFlight.current = true
    setSubmitting(true)
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod,
          cardMachineId: cardMachineId || undefined,
          installments,
          discountCents,
          items: cart.map(c => ({ variationId: c.variationId, quantity: c.quantity })),
        }),
      })
      const json: ApiResponse<SaleResponse> = await res.json()

      if (!res.ok) {
        const code = 'code' in json ? (json as { code?: string }).code : undefined
        // QA-051: sessao expirada — redirecionar para reautenticar
        if (code === 'UNAUTHORIZED') {
          window.location.href = '/pin?redirect=/vendas/nova'
          return
        }
        if (code === 'INSUFFICIENT_STOCK' && 'details' in json) {
          const details = (json as { details?: unknown }).details
          setSubmitError(
            typeof details === 'string'
              ? details
              : 'Estoque insuficiente para um ou mais itens.'
          )
        } else {
          setSubmitError('error' in json ? json.error : 'Erro ao registrar venda.')
        }
        return
      }
      if ('data' in json) router.push(`/vendas/${json.data.id}`)
    } catch {
      setSubmitError('Erro de conexão. Tente novamente.')
    } finally {
      setSubmitting(false)
      inFlight.current = false
    }
  }

  const selectedVariation = selectedProduct?.variations.find(v => v.id === selectedVariationId)
  const activeVariations = selectedProduct?.variations.filter(v => v.isActive) ?? []

  return (
    <div className="px-4 py-7 sm:px-6 lg:px-8 max-w-5xl mx-auto">

      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/vendas"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Nova Venda</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Registre os itens e finalize o pagamento</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-6">

        {/* ── COLUNA ESQUERDA: Busca + Carrinho ── */}
        <div className="space-y-4">

          {/* Busca de produto */}
          <div className="bg-surface rounded-xl border border-border shadow-sm p-5">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
              Adicionar Item
            </p>

            {/* Campo de busca */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={productSearch}
                onChange={e => {
                  setProductSearch(e.target.value)
                  setShowSuggestions(true)
                  if (selectedProduct) { setSelectedProduct(null); setSelectedVariationId('') }
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Buscar produto por nome..."
                className="w-full rounded-lg border border-input bg-background pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
              />
              {searchLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}

              {/* Dropdown de sugestões */}
              {showSuggestions && productSuggestions.length > 0 && !selectedProduct && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg overflow-hidden">
                  {productSuggestions.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={() => selectProduct(p)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.categoryName} · {formatCurrency(p.priceCents)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Seleção de variação + qtd */}
            {loadingProduct && (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando variações...
              </div>
            )}

            {selectedProduct && !loadingProduct && (
              <div className="space-y-3">
                {/* Variações como chips */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Variação</p>
                  <div className="flex flex-wrap gap-2">
                    {activeVariations.map(v => {
                      const outOfStock = v.stockQuantity === 0
                      const selected = v.id === selectedVariationId
                      return (
                        <button
                          key={v.id}
                          type="button"
                          disabled={outOfStock}
                          onClick={() => setSelectedVariationId(v.id)}
                          className={cn(
                            'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                            outOfStock
                              ? 'border-border text-muted-foreground/50 bg-muted/30 cursor-not-allowed line-through'
                              : selected
                              ? 'border-ring bg-accent text-accent-foreground'
                              : 'border-border text-foreground hover:border-accent-border'
                          )}
                        >
                          {variationLabel(v)}
                          {!outOfStock && (
                            <span className="ml-1 text-muted-foreground">({v.stockQuantity})</span>
                          )}
                          {outOfStock && <span className="ml-1 text-xs">sem estoque</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Quantidade + botão Adicionar */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 rounded-lg border border-input bg-background">
                    <button
                      type="button"
                      onClick={() => setAddQty(q => Math.max(1, q - 1))}
                      className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium">{addQty}</span>
                    <button
                      type="button"
                      onClick={() => setAddQty(q => Math.min(q + 1, selectedVariation?.stockQuantity ?? 99))}
                      className="flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Button
                    onClick={handleAddToCart}
                    disabled={!selectedVariationId}
                    size="sm"
                  >
                    Adicionar ao carrinho
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Carrinho */}
          <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Carrinho {cart.length > 0 && `(${cart.length} ${cart.length === 1 ? 'item' : 'itens'})`}
              </p>
            </div>

            {cart.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-muted-foreground">Nenhum item adicionado.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {cart.map(item => (
                  <li key={item.variationId} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {[item.size, item.color].filter(Boolean).join(' / ') || item.variationSku}
                        {' · '}{formatCurrency(item.unitPriceCents)} un.
                      </p>
                    </div>
                    {/* Controle de quantidade */}
                    <div className="flex items-center gap-1 rounded-lg border border-input bg-background shrink-0">
                      <button
                        type="button"
                        onClick={() => item.quantity <= 1 ? removeItem(item.variationId) : setItemQty(item.variationId, item.quantity - 1)}
                        className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-7 text-center text-xs font-medium">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => setItemQty(item.variationId, item.quantity + 1)}
                        disabled={item.quantity >= item.maxStock}
                        className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    {/* Subtotal */}
                    <p className="text-sm font-medium text-foreground w-20 text-right shrink-0">
                      {formatCurrency(item.unitPriceCents * item.quantity)}
                    </p>
                    {/* Remover */}
                    <button
                      type="button"
                      onClick={() => removeItem(item.variationId)}
                      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-danger-muted transition-colors shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── COLUNA DIREITA: Resumo + Pagamento ── */}
        <div className="space-y-4">

          {/* Totais */}
          <div className="bg-surface rounded-xl border border-border shadow-sm p-5">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
              Resumo
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotalCents)}</span>
              </div>
              {/* Desconto — QA-079: valor fixo (R$) ou percentual (%) — RN-004.5 */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Desconto</span>
                <div className="flex items-center gap-1.5">
                  <div className="flex rounded-md border border-input overflow-hidden shrink-0">
                    <button
                      type="button"
                      onClick={() => { setDiscountMode('BRL'); setDiscountInput('') }}
                      aria-label="Desconto em reais"
                      className={cn(
                        'px-2 py-1 text-xs font-medium transition-colors',
                        discountMode === 'BRL'
                          ? 'bg-foreground text-background'
                          : 'bg-background text-muted-foreground hover:text-foreground'
                      )}
                    >
                      R$
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDiscountMode('PCT'); setDiscountInput('') }}
                      aria-label="Desconto percentual"
                      className={cn(
                        'px-2 py-1 text-xs font-medium transition-colors border-l border-input',
                        discountMode === 'PCT'
                          ? 'bg-foreground text-background'
                          : 'bg-background text-muted-foreground hover:text-foreground'
                      )}
                    >
                      %
                    </button>
                  </div>
                  <div className="w-24">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={discountInput}
                      onChange={e => setDiscountInput(e.target.value)}
                      placeholder={discountMode === 'PCT' ? 'Ex: 10' : 'R$ 0,00'}
                      aria-label={discountMode === 'PCT' ? 'Desconto em percentual' : 'Desconto em reais'}
                      className="w-full rounded border border-input bg-background px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>
              {/* QA-079/QA-080: valor efetivo do desconto sempre visivel — confirma
                  a conversao de % e expoe erros de digitacao de milhar (ex: "1.500") */}
              {discountCents > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    Desconto aplicado{discountMode === 'PCT' && discountInput.trim() ? ` (${discountInput.trim()}%)` : ''}
                  </span>
                  <span>-{formatCurrency(discountCents)}</span>
                </div>
              )}
              <div className="border-t border-border pt-2 flex justify-between font-semibold">
                <span>Total</span>
                <span className="text-accent-foreground text-base">{formatCurrency(totalCents)}</span>
              </div>
            </div>
          </div>

          {/* Método de pagamento */}
          <div className="bg-surface rounded-xl border border-border shadow-sm p-5">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
              Pagamento
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(Object.keys(PAYMENT_METHOD) as PaymentMethod[]).map(method => (
                <button
                  key={method}
                  type="button"
                  onClick={() => { setPaymentMethod(method); setCardMachineId(''); setInstallments(1); setMachineInstallments([]) }}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                    paymentMethod === method
                      ? 'border-ring bg-accent text-accent-foreground'
                      : 'border-border text-foreground hover:border-accent-border'
                  )}
                >
                  {PAYMENT_METHOD_LABELS[method]}
                </button>
              ))}
            </div>

            {/* Maquininha — obrigatória p/ DEBIT/CREDIT; opcional p/ PIX via maquininha (v2.5) */}
            {paymentMethod && (CARD_PAYMENT_METHODS.includes(paymentMethod as PaymentMethod) || paymentMethod === PAYMENT_METHOD.PIX) && (
              <div className="space-y-3">
                <Select
                  label={paymentMethod === PAYMENT_METHOD.PIX ? 'Maquininha (opcional)' : 'Maquininha *'}
                  value={cardMachineId}
                  onChange={e => {
                    setCardMachineId(e.target.value)
                    setInstallments(1)
                    setMachineInstallments([])
                    if (e.target.value && paymentMethod === 'CREDIT') loadMachineInstallments(e.target.value)
                  }}
                  placeholder={paymentMethod === PAYMENT_METHOD.PIX ? undefined : 'Selecione...'}
                  options={
                    paymentMethod === PAYMENT_METHOD.PIX
                      ? [{ value: '', label: 'PIX direto (sem taxa)' }, ...cardMachines.map(m => ({ value: m.id, label: m.name + ' — PIX via maquininha' }))]
                      : cardMachines.map(m => ({ value: m.id, label: m.name }))
                  }
                />
                {paymentMethod === 'CREDIT' && cardMachineId && machineInstallments.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Parcelas</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setInstallments(1)}
                        className={cn(
                          'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                          installments === 1
                            ? 'border-ring bg-accent text-accent-foreground'
                            : 'border-border text-foreground hover:border-accent-border'
                        )}
                      >
                        1× à vista ({selectedMachine ? formatBasisPoints(selectedMachine.feeBasisPoints) : ''})
                      </button>
                      {machineInstallments.map(inst => (
                        <button
                          key={inst.installments}
                          type="button"
                          onClick={() => setInstallments(inst.installments)}
                          className={cn(
                            'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                            installments === inst.installments
                              ? 'border-ring bg-accent text-accent-foreground'
                              : 'border-border text-foreground hover:border-accent-border'
                          )}
                        >
                          {inst.installments}× ({formatBasisPoints(inst.feeBasisPoints)})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {selectedMachine && (
                  <div className="flex justify-between text-xs text-muted-foreground rounded-lg bg-muted/30 px-3 py-2">
                    <span>Taxa estimada {installments > 1 ? `${installments}× ` : ''}({formatBasisPoints(effectiveFeeBasisPoints)})</span>
                    <span className="font-medium text-foreground">{formatCurrency(feeCents)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Erro + Botão Finalizar */}
          {submitError && (
            <div className="rounded-lg border border-destructive/30 bg-danger-muted px-4 py-3">
              <p className="text-sm text-destructive">{submitError}</p>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            loading={submitting}
            className="w-full"
            disabled={cart.length === 0}
          >
            Finalizar Venda
          </Button>

          <Link href="/vendas" className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancelar
          </Link>
        </div>
      </div>
    </div>
  )
}
