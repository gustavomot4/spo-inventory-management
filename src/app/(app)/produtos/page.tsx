// =============================================================================
// produtos/page.tsx — Listagem de Produtos (PROD-004)
// SPO — Sistema Pimenta Ousada
// =============================================================================
//
// 'use client': filtros dinâmicos, busca com debounce, paginação cursor-based.
// =============================================================================

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Package, Plus, Search, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatCurrency, cn } from '@/lib/utils'
import type { ProductListItem, CategoryResponse, ApiResponse } from '@/types'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type StatusFilter = 'active' | 'inactive' | 'all'

// ---------------------------------------------------------------------------
// Skeleton de linha
// ---------------------------------------------------------------------------

function ProductRowSkeleton() {
  return (
    <div className="border-b border-border last:border-0 px-6 py-4 flex items-center gap-4">
      <div className="flex-1 space-y-2">
        <div className="h-4 w-48 bg-muted animate-pulse rounded" />
        <div className="h-3 w-24 bg-muted animate-pulse rounded" />
      </div>
      <div className="h-4 w-16 bg-muted animate-pulse rounded" />
      <div className="h-4 w-12 bg-muted animate-pulse rounded" />
      <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Linha de produto
// ---------------------------------------------------------------------------

function ProductRow({ product }: { product: ProductListItem }) {
  return (
    <Link
      href={`/produtos/${product.id}`}
      className={cn(
        'border-b border-border last:border-0 px-6 py-4 hover:bg-muted/50 transition-colors group',
        'flex items-center gap-4',
        'md:grid md:grid-cols-[1fr_7rem_5rem_10rem] md:gap-4'
      )}
    >
      {/* Produto */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate group-hover:text-accent-foreground transition-colors">
          {product.name}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {product.categoryName}
          {product.variationCount > 0 && (
            <span className="ml-2">· {product.variationCount} var.</span>
          )}
          {product.variationSkus.length > 0 && (
            <span className="ml-2 font-mono">
              {product.variationSkus.length === 1
                ? product.variationSkus[0]
                : `${product.variationSkus[0]} +${product.variationSkus.length - 1}`}
            </span>
          )}
        </p>
      </div>

      {/* Preço */}
      <p className="text-sm text-foreground hidden md:block">
        {formatCurrency(product.priceCents)}
      </p>

      {/* Estoque */}
      <p className="text-sm text-muted-foreground text-right hidden md:block">
        {product.totalStock} un.
      </p>

      {/* Status — mobile: compact, desktop: alinhado */}
      <div className="flex items-center gap-1.5 shrink-0 ml-auto md:ml-0">
        {product.hasLowStock && product.totalStock > 0 && (
          <Badge variant="warning">Estoque Baixo</Badge>
        )}
        {product.totalStock === 0 && product.isActive && (
          <Badge variant="danger">Zerado</Badge>
        )}
        <Badge variant={product.isActive ? 'success' : 'muted'}>
          {product.isActive ? 'Ativa' : 'Inativa'}
        </Badge>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function ProdutosPage() {
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [categories, setCategories] = useState<CategoryResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef(search)
  searchRef.current = search

  // ── Carregar categorias ──
  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then((json: ApiResponse<CategoryResponse[]>) => {
        if ('data' in json) setCategories(json.data)
      })
      .catch(() => {})
  }, [])

  // ── Fetch de produtos ──
  const fetchProducts = useCallback(async (opts: {
    search: string
    categoryId: string
    status: StatusFilter
    cursorParam?: string
    append?: boolean
  }) => {
    const params = new URLSearchParams()
    if (opts.search) params.set('search', opts.search)
    if (opts.categoryId) params.set('categoryId', opts.categoryId)
    if (opts.status === 'active') params.set('isActive', 'true')
    if (opts.status === 'inactive') {
      params.set('isActive', 'false')
      params.set('includeDeleted', 'true') // inativos têm deletedAt preenchido
    }
    if (opts.status === 'all') {
      params.set('includeDeleted', 'true') // inclui soft-deleted
    }
    if (opts.cursorParam) params.set('cursor', opts.cursorParam)
    params.set('pageSize', '20')

    try {
      const res = await fetch(`/api/products?${params}`, { cache: 'no-store' })
      const json: ApiResponse<ProductListItem[]> = await res.json()
      if (!('data' in json)) return

      // Para "todos": garante ativos primeiro, depois inativos (mesmo nome)
      const sortedData = opts.status === 'all'
        ? [...json.data].sort((a, b) => {
            if (a.isActive === b.isActive) return 0
            return a.isActive ? -1 : 1
          })
        : json.data

      if (opts.append) {
        setProducts(prev => [...prev, ...sortedData])
      } else {
        setProducts(sortedData)
      }
      setHasNextPage(json.meta?.hasNextPage ?? false)
      setCursor(json.meta?.cursor ?? null)
    } catch {
      // silencioso
    }
  }, [])

  // ── Fetch inicial e por mudança de filtros ──
  useEffect(() => {
    setLoading(true)
    fetchProducts({ search, categoryId, status: statusFilter }).finally(() =>
      setLoading(false)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, statusFilter])

  // ── Debounce na busca por texto ──
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      await fetchProducts({ search, categoryId, status: statusFilter })
      setLoading(false)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // ── Carregar mais ──
  async function handleLoadMore() {
    if (!cursor) return
    setLoadingMore(true)
    await fetchProducts({ search, categoryId, status: statusFilter, cursorParam: cursor, append: true })
    setLoadingMore(false)
  }

  return (
    <div className="px-4 py-7 sm:px-6 lg:px-8 max-w-4xl mx-auto">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Produtos
        </h1>
        <Link href="/produtos/novo">
          <Button size="md">
            <Plus className="h-4 w-4" />
            Novo Produto
          </Button>
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        {/* Busca */}
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
            className={cn(
              'w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
          />
        </div>

        {/* Categoria */}
        <div className="relative">
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className={cn(
              'appearance-none rounded-lg border border-input bg-background',
              'pl-3 pr-8 py-2 text-sm w-full sm:w-44',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
          >
            <option value="">Todas as categorias</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>

        {/* Status */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className={cn(
              'appearance-none rounded-lg border border-input bg-background',
              'pl-3 pr-8 py-2 text-sm w-full sm:w-36',
              'focus:outline-none focus:ring-2 focus:ring-ring'
            )}
          >
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="all">Todos</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Lista */}
      <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">

        {/* Header da tabela — só em telas maiores */}
        <div className="hidden md:grid grid-cols-[1fr_7rem_5rem_10rem] gap-4 px-6 py-3 border-b border-border bg-muted/30">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Produto
          </p>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Preço
          </p>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground text-right">
            Estoque
          </p>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Status
          </p>
        </div>

        {loading ? (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <ProductRowSkeleton key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Nenhum produto encontrado"
            description={
              search || categoryId
                ? 'Tente ajustar os filtros de busca.'
                : 'Cadastre o primeiro produto da loja.'
            }
            action={
              !search && !categoryId ? (
                <Link href="/produtos/novo">
                  <Button size="sm">
                    <Plus className="h-3.5 w-3.5" />
                    Cadastrar produto
                  </Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div>
            {products.map(product => (
              <ProductRow key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>

      {/* Paginação */}
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
