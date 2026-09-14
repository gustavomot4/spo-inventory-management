// =============================================================================
// produtos/[id]/page.tsx — Detalhe e edição de produto (PROD-005)
// SPO — Sistema Pimenta Ousada
// =============================================================================
//
// 'use client': carrega produto, edita campos, gerencia variações existentes.
//
// Operações disponíveis:
//   - PATCH /api/products/[id]                           → editar produto
//   - POST  /api/products/[id]/variations                → adicionar variação
//   - PATCH /api/products/[id]/variations/[varId]        → editar minStock
//   - DELETE /api/products/[id]/variations/[varId]       → inativar variação
//   - DELETE /api/products/[id]                          → inativar produto
// =============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import {
  cn,
  formatCurrency,
  formatDate,
  parseCurrencyToCents,
} from '@/lib/utils'
import type {
  ProductResponse,
  VariationResponse,
  CategoryResponse,
  ApiResponse,
} from '@/types'

// ---------------------------------------------------------------------------
// Tipos locais
// ---------------------------------------------------------------------------

interface ProductFormErrors {
  name?: string
  categoryId?: string
  priceCents?: string
  costCents?: string
  general?: string
}

interface NewVariationDraft {
  size: string
  color: string
  sku: string
  minStock: string
  errors: { general?: string }
}

// ---------------------------------------------------------------------------
// Sub-componente: linha de variação existente
// ---------------------------------------------------------------------------

interface VariationRowProps {
  variation: VariationResponse
  productId: string
  onUpdate: (varId: string, minStock: number) => Promise<string | null>
  onDeactivate: (varId: string) => Promise<void>
}

function VariationRow({ variation, onUpdate, onDeactivate }: VariationRowProps) {
  const [editingMin, setEditingMin] = useState(false)
  const [minValue, setMinValue] = useState(String(variation.minStock))
  const [saving, setSaving] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSaveMin() {
    const val = parseInt(minValue, 10)
    if (isNaN(val) || val < 0) { setError('Valor inválido'); return }
    setSaving(true)
    const err = await onUpdate(variation.id, val)
    setSaving(false)
    if (err) { setError(err); return }
    setEditingMin(false)
    setError(null)
  }

  async function handleDeactivate() {
    setDeactivating(true)
    await onDeactivate(variation.id)
    setDeactivating(false)
    setConfirmDeactivate(false)
  }

  const stockBadge = variation.stockQuantity === 0
    ? <Badge variant="danger">Zerado</Badge>
    : variation.isLowStock
    ? <Badge variant="warning">Baixo</Badge>
    : <Badge variant="success">OK</Badge>

  return (
    <div className={cn(
      'border-b border-border last:border-0 px-6 py-3',
      'flex flex-wrap items-center gap-3 text-sm',
      !variation.isActive && 'opacity-50'
    )}>
      {/* SKU + Tamanho + Cor */}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs text-muted-foreground">{variation.sku}</p>
        <p className="text-sm font-medium text-foreground mt-0.5">
          {variation.size} · {variation.color}
        </p>
      </div>

      {/* Estoque */}
      <div className="text-right shrink-0 w-20">
        <p className="text-sm text-foreground">{variation.stockQuantity} un.</p>
        {stockBadge}
      </div>

      {/* Est. mínimo — editável */}
      <div className="flex items-center gap-1.5 shrink-0">
        {editingMin ? (
          <>
            <input
              type="number"
              value={minValue}
              onChange={e => setMinValue(e.target.value)}
              className={cn(
                'w-16 rounded border border-input bg-background px-2 py-1 text-sm',
                'focus:outline-none focus:ring-1 focus:ring-ring',
                error && 'border-destructive'
              )}
              min={0}
              autoFocus
            />
            <Button size="sm" loading={saving} onClick={handleSaveMin}>
              OK
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setEditingMin(false); setMinValue(String(variation.minStock)); setError(null) }}
            >
              ✕
            </Button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => variation.isActive && setEditingMin(true)}
            disabled={!variation.isActive}
            className={cn(
              'text-xs text-muted-foreground border border-dashed border-border rounded px-2 py-1',
              variation.isActive && 'hover:border-accent-border hover:text-accent-foreground transition-colors cursor-pointer'
            )}
            title="Editar estoque mínimo"
          >
            Mín: {variation.minStock}
          </button>
        )}
      </div>

      {/* Status + Inativar */}
      <div className="flex items-center gap-2 shrink-0">
        {!variation.isActive && (
          <Badge variant="muted">Inativa</Badge>
        )}
        {variation.isActive && (
          confirmDeactivate ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Inativar?</span>
              <Button
                size="sm"
                variant="destructive"
                loading={deactivating}
                onClick={handleDeactivate}
                className="h-6 px-2 text-[0.625rem]"
              >
                Sim
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDeactivate(false)}
                className="h-6 px-1"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              loading={deactivating}
              onClick={() => setConfirmDeactivate(true)}
              className="text-muted-foreground hover:text-destructive"
              aria-label={'Inativar variação ' + variation.sku}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )
        )}
      </div>
      {error && (
        <p className="w-full text-xs text-destructive -mt-1">{error}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function ProdutoDetalhePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const productId = params.id

  const [product, setProduct] = useState<ProductResponse | null>(null)
  const [categories, setCategories] = useState<CategoryResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [networkError, setNetworkError] = useState(false)

  // Campos editáveis do produto
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priceInput, setPriceInput] = useState('')
  const [costInput, setCostInput] = useState('')
  const [formErrors, setFormErrors] = useState<ProductFormErrors>({})
  const [savingProduct, setSavingProduct] = useState(false)
  const [savedProduct, setSavedProduct] = useState(false)

  // Nova variação
  const [showAddVar, setShowAddVar] = useState(false)
  const [newVar, setNewVar] = useState<NewVariationDraft>({
    size: '', color: '', sku: '', minStock: '2', errors: {},
  })
  const [addingVar, setAddingVar] = useState(false)

  // Inativar / Reativar produto
  const [deletingProduct, setDeletingProduct] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [reactivating, setReactivating] = useState(false)
  const [reactivateError, setReactivateError] = useState<string | null>(null)

  // ── Carregar produto e categorias ──
  const loadProduct = useCallback(async () => {
    try {
      const [prodRes, catRes] = await Promise.all([
        fetch(`/api/products/${productId}`, { cache: 'no-store' }),
        fetch('/api/categories'),
      ])

      if (prodRes.status === 404) { setNotFound(true); return }

      const [prodJson, catJson]: [ApiResponse<ProductResponse>, ApiResponse<CategoryResponse[]>] =
        await Promise.all([prodRes.json(), catRes.json()])

      if ('data' in prodJson) {
        const p = prodJson.data
        setProduct(p)
        setName(p.name)
        setCategoryId(p.categoryId)
        setPriceInput((p.priceCents / 100).toFixed(2).replace('.', ','))
        setCostInput(p.costCents !== null ? (p.costCents / 100).toFixed(2).replace('.', ',') : '')
      }
      if ('data' in catJson) setCategories(catJson.data)
    } catch {
      setNetworkError(true)
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => { loadProduct() }, [loadProduct])

  // ── Salvar produto ──
  async function handleSaveProduct() {
    const errs: ProductFormErrors = {}
    if (!name.trim()) errs.name = 'Nome obrigatório'
    if (name.trim().length > 120) errs.name = 'Máximo 120 caracteres'
    if (!categoryId) errs.categoryId = 'Selecione uma categoria'
    if (!priceInput.trim()) {
      errs.priceCents = 'Preço obrigatório'
    } else {
      try { parseCurrencyToCents(priceInput) }
      catch { errs.priceCents = 'Preço inválido (ex: 59,90)' }
    }
    if (costInput.trim()) {
      try {
        const c = parseCurrencyToCents(costInput)
        if (c < 0) errs.costCents = 'Custo deve ser ≥ 0'
      } catch {
        errs.costCents = 'Custo inválido (ex: 25,90)'
      }
    }
    setFormErrors(errs)
    if (Object.keys(errs).length > 0) return

    // Calcular costCents para o PATCH
    let costCentsValue: number | null | undefined
    if (costInput.trim() === '') {
      // Campo vazio = limpar (null)
      costCentsValue = null
    } else {
      try { costCentsValue = parseCurrencyToCents(costInput) } catch { /* validated */ }
    }

    setSavingProduct(true)
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          categoryId,
          priceCents: parseCurrencyToCents(priceInput),
          costCents: costCentsValue,
        }),
      })
      const json: ApiResponse<ProductResponse> = await res.json()

      if (!res.ok) {
        const code = 'code' in json ? (json as { code?: string }).code : undefined
        // QA-049: sessao expirada
        if (code === 'UNAUTHORIZED') { window.location.href = '/pin?redirect=/produtos/' + productId; return }
        if (code === 'NAME_TAKEN') setFormErrors({ name: 'Já existe um produto com este nome' })
        else if (code === 'CATEGORY_NOT_FOUND') setFormErrors({ categoryId: 'Categoria não encontrada' })
        else setFormErrors({ general: 'error' in json ? json.error : 'Erro ao salvar' })
        return
      }
      if ('data' in json) setProduct(json.data)
      setSavedProduct(true)
      setTimeout(() => setSavedProduct(false), 2500)
    } catch {
      setFormErrors({ general: 'Erro de conexão. Tente novamente.' })
    } finally {
      setSavingProduct(false)
    }
  }

  // ── Atualizar minStock de variação ──
  async function handleUpdateVariation(varId: string, minStock: number): Promise<string | null> {
    try {
      const res = await fetch(`/api/products/${productId}/variations/${varId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minStock }),
      })
      const json: ApiResponse<VariationResponse> = await res.json()
      if (!res.ok) {
        // QA-072: sessao expirada — reautenticar (padrao QA-049)
        if (res.status === 401) {
          window.location.href = '/pin?redirect=/produtos/' + productId
          return null
        }
        return 'error' in json ? json.error : 'Erro ao salvar'
      }
      if ('data' in json) {
        setProduct(prev =>
          prev
            ? { ...prev, variations: prev.variations.map(v => v.id === varId ? json.data : v) }
            : prev
        )
      }
      return null
    } catch {
      return 'Erro de conexão.'
    }
  }

  // ── Inativar variação ──
  async function handleDeactivateVariation(varId: string) {
    try {
      const res = await fetch(`/api/products/${productId}/variations/${varId}`, { method: 'DELETE' })
      if (!res.ok) {
        // QA-072: sessao expirada — reautenticar (padrao QA-049)
        if (res.status === 401) { window.location.href = '/pin?redirect=/produtos/' + productId }
        return // QA-028: não atualizar UI se API falhou
      }
      setProduct(prev =>
        prev
          ? { ...prev, variations: prev.variations.map(v => v.id === varId ? { ...v, isActive: false } : v) }
          : prev
      )
    } catch { /* silencioso */ }
  }

  // ── Adicionar variação ──
  async function handleAddVariation() {
    const errs: NewVariationDraft['errors'] = {}
    // DT-008: size e color são opcionais — sem validação de obrigatório
    setNewVar(p => ({ ...p, errors: errs }))
    if (Object.keys(errs).length > 0) return

    setAddingVar(true)
    try {
      const res = await fetch(`/api/products/${productId}/variations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          size: newVar.size.trim(),
          color: newVar.color.trim(),
          ...(newVar.sku.trim() ? { sku: newVar.sku.trim() } : {}),
          minStock: parseInt(newVar.minStock || '2', 10),
        }),
      })
      const json: ApiResponse<VariationResponse> = await res.json()
      if (!res.ok) {
        const code = 'code' in json ? (json as { code?: string }).code : undefined
        // QA-072: sessao expirada — reautenticar (padrao QA-049)
        if (code === 'UNAUTHORIZED') {
          window.location.href = '/pin?redirect=/produtos/' + productId
          return
        }
        const msg = code === 'DUPLICATE_VARIATION'
          ? 'Já existe uma variação com este tamanho e cor'
          : code === 'SKU_TAKEN'
          ? 'Este SKU já está em uso'
          : 'error' in json ? json.error : 'Erro ao adicionar'
        setNewVar(p => ({ ...p, errors: { general: msg } }))
        return
      }
      if ('data' in json) {
        setProduct(prev =>
          prev ? { ...prev, variations: [...prev.variations, json.data] } : prev
        )
        setNewVar({ size: '', color: '', sku: '', minStock: '2', errors: {} })
        setShowAddVar(false)
      }
    } catch {
      setNewVar(p => ({ ...p, errors: { general: 'Erro de conexão.' } }))
    } finally {
      setAddingVar(false)
    }
  }

  // ── Inativar produto ──
  async function handleDeleteProduct() {
    setDeletingProduct(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' })
      if (!res.ok) {
        // QA-049: sessao expirada
        if (res.status === 401) { window.location.href = '/pin?redirect=/produtos/' + productId; return }
        const json = await res.json().catch(() => ({}))
        setDeleteError('error' in json ? (json as { error: string }).error : 'Erro ao inativar produto. Tente novamente.')
        setDeletingProduct(false)
        return
      }
      router.replace('/produtos')
    } catch {
      setDeleteError('Erro de conexao. Tente novamente.')
      setDeletingProduct(false)
    }
  }

  // ── Reativar produto ──
  async function handleReactivate() {
    setReactivating(true)
    setReactivateError(null)
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })
      const json: ApiResponse<ProductResponse> = await res.json()
      if (!res.ok) {
        const code = 'code' in json ? (json as { code?: string }).code : undefined
        // QA-049: sessao expirada
        if (code === 'UNAUTHORIZED') { window.location.href = '/pin?redirect=/produtos/' + productId; return }
        // QA-029: feedback de erro ao usuário
        setReactivateError('error' in json ? json.error : 'Erro ao reativar produto')
        return
      }
      if ('data' in json) setProduct(json.data)
    } catch {
      setReactivateError('Erro de conexão. Tente novamente.')
    } finally {
      setReactivating(false)
    }
  }

  // ── Loading / Not Found ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 text-accent-foreground animate-spin" />
      </div>
    )
  }

  if (networkError) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-sm font-medium text-foreground">Nao foi possivel carregar o produto</p>
        <p className="text-sm text-muted-foreground mt-1">Verifique sua conexao e tente novamente.</p>
        <div className="flex items-center justify-center gap-3 mt-4">
          <Button onClick={() => { setNetworkError(false); setLoading(true); loadProduct() }}>
            Tentar novamente
          </Button>
          <Link href="/produtos">
            <Button variant="secondary">Voltar para Produtos</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (notFound || !product) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-sm font-medium text-foreground">Produto nao encontrado</p>
        <Link href="/produtos">
          <Button variant="secondary" className="mt-4">Voltar para Produtos</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="px-4 py-7 sm:px-6 lg:px-8 max-w-3xl mx-auto">

      {/* Cabeçalho */}
      <div className="flex items-start gap-3 mb-8">
        <Link
          href="/produtos"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors mt-0.5"
          aria-label="Voltar para produtos"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">
              {product.name}
            </h1>
            <Badge variant={product.isActive ? 'success' : 'muted'}>
              {product.isActive ? 'Ativa' : 'Inativa'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastrado em {formatDate(new Date(product.createdAt))}
          </p>
        </div>
      </div>

      {/* ── Dados do produto ── */}
      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden mb-5">
        <div className="px-6 py-4 border-b border-border">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Dados do Produto
          </p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <Input
            label="Nome do produto"
            value={name}
            onChange={e => { setName(e.target.value); setFormErrors(p => ({ ...p, name: undefined })) }}
            error={formErrors.name}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Categoria"
              value={categoryId}
              onChange={e => { setCategoryId(e.target.value); setFormErrors(p => ({ ...p, categoryId: undefined })) }}
              error={formErrors.categoryId}
              // QA-072: sem PIN, GET /api/categories responde 401 e a lista vem
              // vazia — o select ficava em branco (nem a categoria atual aparecia).
              // Fallback: exibir a categoria atual do produto (vem no GET publico
              // do produto). Trocar de categoria de fato exige PIN — o PATCH ja
              // redireciona para /pin no 401 (QA-049).
              options={categories.length > 0
                ? categories.map(c => ({ value: c.id, label: c.name }))
                : [{ value: product.categoryId, label: product.categoryName }]}
            />
            <Input
              label="Preço de venda (R$)"
              value={priceInput}
              onChange={e => { setPriceInput(e.target.value); setFormErrors(p => ({ ...p, priceCents: undefined })) }}
              error={formErrors.priceCents}
              hint={(() => {
                try { return formatCurrency(parseCurrencyToCents(priceInput)) } catch { return '' }
              })()}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Preço de custo (opcional)"
              value={costInput}
              onChange={e => { setCostInput(e.target.value); setFormErrors(p => ({ ...p, costCents: undefined })) }}
              error={formErrors.costCents}
              placeholder="Ex: 25,00"
              hint={costInput
                ? (() => { try { return formatCurrency(parseCurrencyToCents(costInput)) } catch { return '' } })()
                : product.costCents !== null ? formatCurrency(product.costCents) : 'Para calcular margem'}
            />
          </div>

          {formErrors.general && (
            <p className="text-sm text-destructive">{formErrors.general}</p>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSaveProduct}
              loading={savingProduct}
            >
              Salvar alterações
            </Button>
            {savedProduct && (
              <span className="text-xs text-success font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Salvo!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Variações ── */}
      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden mb-5">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Variações ({product.variations.filter(v => v.isActive).length} ativas)
          </p>
          {!showAddVar && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowAddVar(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </Button>
          )}
        </div>

        {/* Formulário nova variação */}
        {showAddVar && (
          <div className="px-6 py-4 border-b border-border bg-accent/30">
            <p className="text-xs font-medium text-foreground mb-3">Nova variação</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Input
                placeholder="Tamanho (opcional)"
                value={newVar.size}
                onChange={e => setNewVar(p => ({ ...p, size: e.target.value }))}
                autoFocus
              />
              <Input
                placeholder="Cor (opcional)"
                value={newVar.color}
                onChange={e => setNewVar(p => ({ ...p, color: e.target.value }))}
              />
              <Input
                placeholder="SKU (auto)"
                value={newVar.sku}
                onChange={e => setNewVar(p => ({ ...p, sku: e.target.value }))}
              />
              <Input
                type="number"
                placeholder="Mín."
                value={newVar.minStock}
                onChange={e => setNewVar(p => ({ ...p, minStock: e.target.value }))}
                min={0}
              />
            </div>
            {newVar.errors.general && (
              <p className="mt-2 text-xs text-destructive">{newVar.errors.general}</p>
            )}
            <div className="flex items-center gap-2 mt-3">
              <Button size="sm" onClick={handleAddVariation} loading={addingVar}>
                Adicionar variação
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowAddVar(false); setNewVar({ size: '', color: '', sku: '', minStock: '2', errors: {} }) }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Lista de variações */}
        {product.variations.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma variação cadastrada.</p>
          </div>
        ) : (
          <>
            {/* Cabeçalho */}
            <div className="hidden sm:flex items-center gap-3 px-6 py-2 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
              <span className="flex-1">SKU / Tamanho · Cor</span>
              <span className="w-20 text-right">Estoque</span>
              <span className="w-24">Est. mínimo</span>
              <span className="w-20"></span>
            </div>
            {product.variations.map(v => (
              <VariationRow
                key={v.id}
                variation={v}
                productId={productId}
                onUpdate={handleUpdateVariation}
                onDeactivate={handleDeactivateVariation}
              />
            ))}
          </>
        )}
      </div>

      {/* ── Reativar produto (quando inativo) ── */}
      {!product.isActive && (
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden mb-5">
          <div className="px-6 py-4 border-b border-border">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Produto Inativo
            </p>
          </div>
          <div className="px-6 py-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Reativar produto</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                O produto e suas variações voltarão a aparecer no catálogo.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={reactivating}
              onClick={handleReactivate}
            >
              Reativar
            </Button>
            {reactivateError && (
              <p className="mt-2 text-xs text-destructive">{reactivateError}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Zona de perigo ── */}
      {product.isActive && (
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Zona de Perigo
            </p>
          </div>
          <div className="px-6 py-5">
            {!confirmDelete ? (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Inativar produto</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    O produto e todas as suas variações serão ocultados do catálogo.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  Inativar
                </Button>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Tem certeza? Esta ação oculta o produto do catálogo.
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      variant="destructive"
                      size="sm"
                      loading={deletingProduct}
                      onClick={handleDeleteProduct}
                    >
                      Sim, inativar
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setConfirmDelete(false); setDeleteError(null) }}
                    >
                      Cancelar
                    </Button>
                  </div>
                  {deleteError && (
                    <p className="mt-2 text-xs text-destructive">{deleteError}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
