'use client'

// =============================================================================
// SidebarContent.tsx — Navegação lateral do app
// SPO — Sistema Pimenta Ousada
// =============================================================================
//
// 'use client': necessário pois usa usePathname() para destacar item ativo.
// Lucide React icons — zero emojis.
// shopName: carregado de GET /api/settings para refletir o nome configurado pela dona.
// =============================================================================

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  Package,
  Layers,
  ShoppingBag,
  BarChart2,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AccessibilityControls } from '@/components/accessibility/AccessibilityControls'
import type { ApiSuccess, SettingsResponse } from '@/types'

const NAV_ITEMS = [
  { href: '/',              label: 'Painel',        icon: LayoutDashboard },
  { href: '/produtos',      label: 'Produtos',      icon: Package },
  { href: '/estoque',       label: 'Estoque',       icon: Layers },
  { href: '/vendas',        label: 'Vendas',        icon: ShoppingBag },
  { href: '/relatorios',    label: 'Relatórios',    icon: BarChart2 },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
] as const

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: typeof Package
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon
        className={cn('h-4 w-4 shrink-0', active ? 'text-accent-foreground' : 'text-muted-foreground')}
        strokeWidth={active ? 2.5 : 1.75}
        aria-hidden="true"
      />
      {label}
    </Link>
  )
}

export function SidebarContent() {
  const pathname = usePathname()
  const [shopName, setShopName] = useState('Pimenta Ousada')

  // Carregar nome da loja de /api/settings (público — sem PIN necessário)
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((json: ApiSuccess<SettingsResponse>) => {
        if ('data' in json && json.data.shopName) {
          setShopName(json.data.shopName)
        }
      })
      .catch(() => { /* mantém o fallback */ })
  }, [])

  const navItemsWithActive = NAV_ITEMS.map(item => ({
    href: item.href,
    label: item.label,
    icon: item.icon,
    active: item.href === '/'
      ? pathname === '/'
      : pathname === item.href || pathname.startsWith(item.href + '/'),
  }))

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Logo / marca */}
      <div className="flex h-14 items-center border-b border-border px-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <span className="text-xs font-bold text-white">PO</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground leading-none">
              {shopName}
            </p>
            <p className="text-[0.625rem] text-muted-foreground mt-0.5">Gestão de Estoque</p>
          </div>
        </div>
      </div>

      {/* Navegação */}
      <nav aria-label="Navegação principal" className="flex-1 p-3 space-y-0.5">
        {navItemsWithActive.map(item => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={item.active}
          />
        ))}
      </nav>

      {/* Rodapé da sidebar */}
      <div className="shrink-0 border-t border-border p-3 space-y-3">
        <AccessibilityControls />
        <p className="text-[0.625rem] text-muted-foreground text-center">
          SPO v1.1.0
        </p>
      </div>
    </div>
  )
}
