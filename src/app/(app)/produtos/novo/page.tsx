// =============================================================================
// produtos/novo/page.tsx — Formulário de criação de produto (PROD-005)
// SPO — Sistema Pimenta Ousada
// =============================================================================

'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Plus, X } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { parseCurrencyToCents, formatCurrency } from '@/lib/utils'
import type { CategoryResponse, ProductResponse, ApiResponse } from '@/types'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface VariationDraft {
  id: string // id local (não do banco)
  size: string
  color: string
  sku: string
  minStock: string
  stockQuantity: string
  errors: { size?: string; color?: string; sku?: string }
}

interface ProductFormErrors {
  name?: string
  categoryId?: string
  priceCents?: string
  costCents?: string
  variations?: string
  general?: string
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

let draftCounter = 0

export default function NovoProdutoPage() {
  const [categories, setCategories] = useState<CategoryResponse[]>([])
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priceInput, setPriceInput] = useState('')
  const [costInput, setCostInput] = useState('')
  const [savedProductId, setSavedProductId] = useState<string | null>(null)
  const [variations, setVariations] = useState<VariationDraft[]>([
    newDraft(),
  ])
  const [errors, setErrors] = useState<ProductFormErrors>({})
  const [saving, setSaving] = useState(false)
  // QA-065: trava síncrona contra duplo-clique (evita produtos duplicados)
  const inFlight = useRef(false)

  function newDraft(): VariationDraft {
    return {
      id: `draft-${++draftCounter}`,
      size: '',
      color: '',
      sku: '',
      minStock: '2',
      stockQuantity: '0',
      errors: {},
    }
  }

  // Carregar categorias
  // QA-072: GET /api/categories exige PIN (middleware intercepta o caminho base).
  // Sem sessao, esta pagina de cadastro (operacao protegida — QA-034) era um beco
  // sem saida: dropdown de categoria vazio e 401 tecnico ao salvar. Redirecionar
  // para /pin no 401, como vendas e estoque ja fazem (padrao QA-049).
  useEffect(() => {
    fetch('/api/categories')
      .then(r => {
        if (r.status === 401) {
          window.location.href = '/pin?redirect=/produtos/novo'
          return null
        }
        return r.json()
      })
      .then((json: ApiResponse<CategoryResponse[]> | null) => {
        if (json && 'data' in json) setCategories(json.data)
      })
      .catch(() => {})
  }, [])

  // Atualizar campo de uma variação
  function updateVariation(id: string, field: keyof VariationDraft, value: string) {
    setVariations(prev =>
      prev.map(v =>
        v.id === id ? { ...v, [field]: value, errors: { ...v.errors, [field]: undefined } } : v
      )
    )
    setErrors(e => ({ ...e, variations: undefined }))
  }

  // Remover variação
  function removeVariation(id: string) {
    setVariations(prev => prev.filter(v => v.id !== id))
  }

  // Adicionar variação
  function addVariation() {
    setVariations(prev => [...prev, newDraft()])
  }

  // Validar
  function validate(): boolean {
    const errs: ProductFormErrors = {}
    if (!name.trim()) errs.name = 'Nome obrigatório'
    if (name.trim().length > 120) errs.name = 'Máximo 120 caracteres'
    if (!categoryId) errs.categoryId = 'Selecione uma categoria'
    if (!priceInput.trim()) {
      errs.priceCents = 'Preço obrigatório'
    } else {
      try {
        const cents = parseCurrencyToCents(priceInput)
        if (cents < 0) errs.priceCents = 'Preço deve ser ≥ 0'
      } catch {
        errs.priceCents = 'Preço inválido (ex: 59,90)'
      }
    }
    if (variations.length === 0) {
      errs.variations = 'Adicione pelo menos uma variação'
    } else {
      // QA-045: validar campos numericos das variacoes
      for (const v of variations) {
        const min = parseInt(v.minStock || '0', 10)
        const qty = parseInt(v.stockQuantity || '0', 10)
        if (isNaN(min) || min < 0) { errs.variations = 'Estoque mínimo deve ser um número ≥ 0'; break }
        if (isNaN(qty) || qty < 0) { errs.variations = 'Quantidade inicial deve ser um número ≥ 0'; break }
      }
    }

    // Validar custo (opcional)
    if (costInput.trim()) {
      try {
        const c = parseCurrencyToCents(costInput)
        if (c < 0) errs.costCents = 'Custo deve ser ≥ 0'
      } catch {
        errs.costCents = 'Custo inválido (ex: 25,90)'
      }
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // Submeter
  async function handleSubmit() {
    if (inFlight.current) return
    if (!validate()) return
    inFlight.current = true
    setSaving(true)

    let priceCents = 0
    try { priceCents = parseCurrencyToCents(priceInput) } catch { /* validated */ }

    let costCents: number | undefined
    if (costInput.trim()) {
      try { costCents = parseCurrencyToCents(costInput) } catch { /* validated */ }
    }

    const payload = {
      name: name.trim(),
      categoryId,
      priceCents,
      ...(costCents !== undefined ? { costCents } : {}),
      variations: variations.map(v => ({
        size: v.size.trim(),
        color: v.color.trim(),
        ...(v.sku.trim() ? { sku: v.sku.trim() } : {}),
        minStock: parseInt(v.minStock || '2', 10),
        stockQuantity: parseInt(v.stockQuantity || '0', 10),
      })),
    }

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json: ApiResponse<ProductResponse> = await res.json()

      if (!res.ok) {
        const apiError = 'error' in json ? json : null
        // QA-072: sessao expirou entre o load e o submit — reautenticar (padrao QA-049)
        if (apiError?.code === 'UNAUTHORIZED') {
          window.location.href = '/pin?redirect=/produtos/novo'
          return
        }
        if (apiError?.code === 'NAME_TAKEN') {
          setErrors({ name: 'Já existe um produto com este nome' })
        } else if (apiError?.code === 'CATEGORY_NOT_FOUND') {
          setErrors({ categoryId: 'Categoria não encontrada' })
        } else if (apiError?.code === 'DUPLICATE_VARIATION') {
          setErrors({ variations: 'Existe uma variação duplicada (mesmo tamanho e cor)' })
        } else {
          setErrors({ general: apiError?.error ?? 'Erro ao salvar produto' })
        }
        return
      }

      if ('data' in json) {
        setSavedProductId(json.data.id)
      }
    } catch {
      setErrors({ general: 'Erro de conexão. Tente novamente.' })
    } finally {
      setSaving(false)
      inFlight.current = false
    }
  }

  return (
    <div className="px-4 py-7 sm:px-6 lg:px-8 max-w-3xl mx-auto">

      {/* Cabeçalho */}
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/produtos"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          aria-label="Voltar para produtos"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Novo Produto
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Preencha os dados e adicione as variações
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
            onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: undefined })) }}
            error={errors.name}
            placeholder="Ex: Blusa Floral Rosa"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Categoria"
              value={categoryId}
              onChange={e => { setCategoryId(e.target.value); setErrors(p => ({ ...p, categoryId: undefined })) }}
              error={errors.categoryId}
              placeholder="Selecione..."
              options={categories.map(c => ({ value: c.id, label: c.name }))}
            />
            <Input
              label="Preço de venda (R$) *"
              value={priceInput}
              onChange={e => { setPriceInput(e.target.value); setErrors(p => ({ ...p, priceCents: undefined })) }}
              error={errors.priceCents}
              placeholder="Ex: 89,90"
              hint={priceInput ? (() => { try { return formatCurrency(parseCurrencyToCents(priceInput)) } catch { return '' } })() : ''}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Preço de custo (opcional)"
              value={costInput}
              onChange={e => { setCostInput(e.target.value); setErrors(p => ({ ...p, costCents: undefined })) }}
              error={errors.costCents}
              placeholder="Ex: 25,00"
              hint={costInput ? (() => { try { return formatCurrency(parseCurrencyToCents(costInput)) } catch { return '' } })() : 'Para calcular margem'}
            />
          </div>
        </div>
      </div>

      {/* ── Variações ── */}
      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden mb-5">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Variações
          </p>
          <Button size="sm" variant="secondary" onClick={addVariation}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </Button>
        </div>

        {/* Header */}
        <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_6rem_6rem_2rem] gap-2 px-6 py-2 border-b border-border bg-muted/30">
          {['Tamanho (opcional)', 'Cor (opcional)', 'SKU (opcional)', 'Est. Mín.', 'Est. Inicial', ''].map(h => (
            <p key={h} className="text-xs font-medium text-muted-foreground">{h}</p>
          ))}
        </div>

        {variations.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhuma variação. Clique em &quot;Adicionar&quot; para começar.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {variations.map((v, idx) => (
              <div key={v.id} className="px-6 py-3">
                {/* Mobile: stacked */}
                <div className="sm:hidden space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Variação {idx + 1}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Ex: P, M, G, GG (ou deixar em branco)"
                      value={v.size}
                      onChange={e => updateVariation(v.id, 'size', e.target.value)}
                    />
                    <Input
                      placeholder="Ex: Preto, Rosa (ou deixar em branco)"
                      value={v.color}
                      onChange={e => updateVariation(v.id, 'color', e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      placeholder="SKU (auto)"
                      value={v.sku}
                      onChange={e => updateVariation(v.id, 'sku', e.target.value)}
                      error={v.errors.sku}
                    />
                    <Input
                      type="number"
                      placeholder="Mín."
                      value={v.minStock}
                      onChange={e => updateVariation(v.id, 'minStock', e.target.value)}
                      min={0}
                    />
                    <Input
                      type="number"
                      placeholder="Inicial"
                      value={v.stockQuantity}
                      onChange={e => updateVariation(v.id, 'stockQuantity', e.target.value)}
                      min={0}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeVariation(v.id)}
                      className="text-xs text-destructive hover:text-destructive/80 transition-colors"
                    >
                      Remover
                    </button>
                  </div>
                </div>

                {/* Desktop: grid */}
                <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_6rem_6rem_2rem] gap-2 items-start">
                  <Input
                    placeholder="Ex: P, M, G (opcional)"
                    value={v.size}
                    onChange={e => updateVariation(v.id, 'size', e.target.value)}
                  />
                  <Input
                    placeholder="Ex: Rosa, Azul (opcional)"
                    value={v.color}
                    onChange={e => updateVariation(v.id, 'color', e.target.value)}
                  />
                  <Input
                    placeholder="Auto"
                    value={v.sku}
                    onChange={e => updateVariation(v.id, 'sku', e.target.value)}
                    error={v.errors.sku}
                  />
                  <Input
                    type="number"
                    value={v.minStock}
                    onChange={e => updateVariation(v.id, 'minStock', e.target.value)}
                    min={0}
                  />
                  <Input
                    type="number"
                    value={v.stockQuantity}
                    onChange={e => updateVariation(v.id, 'stockQuantity', e.target.value)}
                    min={0}
                  />
                  <button
                    type="button"
                    onClick={() => removeVariation(v.id)}
                    className={cn(
                      'flex h-9 w-8 items-center justify-center rounded-lg mt-0.5',
                      'text-muted-foreground hover:text-destructive hover:bg-danger-muted transition-colors'
                    )}
                    aria-label={`Remover variação ${idx + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {errors.variations && (
          <div className="px-6 pb-4">
            <p className="text-xs text-destructive">{errors.variations}</p>
          </div>
        )}
      </div>

      {/* Erro geral */}
      {errors.general && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-danger-muted px-4 py-3">
          <p className="text-sm text-destructive">{errors.general}</p>
        </div>
      )}

      {/* Sucesso */}
      {savedProductId && (
        <div className="mb-4 rounded-xl border border-success-border bg-success-muted px-5 py-4">
          <p className="text-sm font-semibold text-success mb-3">
            Produto cadastrado com sucesso!
          </p>
          <div className="flex items-center gap-2">
            <Link href={`/produtos/${savedProductId}`}>
              <Button size="sm" variant="secondary">Ver produto</Button>
            </Link>
            <Button
              size="sm"
              onClick={() => {
                setSavedProductId(null)
                setName('')
                setCategoryId('')
                setPriceInput('')
                setCostInput('')
                setVariations([newDraft()])
                setErrors({})
              }}
            >
              Cadastrar outro produto
            </Button>
          </div>
        </div>
      )}

      {/* Ações */}
      {!savedProductId && (
      <div className="flex items-center justify-end gap-3">
        <Link href="/produtos">
          <Button variant="secondary">Cancelar</Button>
        </Link>
        <Button onClick={handleSubmit} loading={saving}>
          Salvar Produto
        </Button>
      </div>
      )}

    </div>
  )
}
