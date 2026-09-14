// =============================================================================
// configuracoes/page.tsx — Tela de Configurações (MAQU-002)
// SPO — Sistema Pimenta Ousada
// =============================================================================
//
// 'use client': CRUD inline, state local. Integra com /api/card-machines,
// /api/settings e /api/auth/pin/change.
//
// Seções (todas implementadas):
//   - Maquininhas de Cartão  ← CRUD + taxas de parcelamento (CardMachineInstallment)
//   - Dados da Loja          ← nome, endereço e telefone (exibidos na comanda — DT-010/COM-006)
//   - Segurança (PIN)        ← troca de PIN de 4 dígitos (SEC-001) + aviso quando ainda no PIN padrão 1234 (QA-081)
// =============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { CreditCard, Lock, Store, Plus, Pencil, X, Check, ChevronDown, Trash2, Loader2, Tag, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatBasisPoints, parseBasisPoints, cn } from '@/lib/utils'
import type { CardMachineResponse, CardMachineInstallmentResponse, SettingsResponse, CategoryResponse, ApiResponse, ApiSuccess } from '@/types'

// ---------------------------------------------------------------------------
// Tipos locais
// ---------------------------------------------------------------------------

interface FormState {
  name: string
  fee: string      // taxa CRÉDITO à vista digitada, ex: "1,99"
  debitFee: string // taxa DÉBITO — vazio = não configurada (v2.5)
  pixFee: string   // taxa PIX via maquininha — vazio = não configurada (v2.5)
}

interface FormErrors {
  name?: string
  fee?: string
  debitFee?: string
  pixFee?: string
  general?: string
}

// ---------------------------------------------------------------------------
// Sub-componente: Linha de maquininha
// ---------------------------------------------------------------------------

interface CardMachineRowProps {
  machine: CardMachineResponse
  onToggleActive: (id: string, isActive: boolean) => Promise<void>
  onUpdate: (id: string, data: FormState) => Promise<string | null>
}

function CardMachineRow({ machine, onToggleActive, onUpdate }: CardMachineRowProps) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<FormState>({
    name: machine.name,
    fee: (machine.feeBasisPoints / 100).toFixed(2).replace('.', ','),
    debitFee: machine.debitFeeBasisPoints != null ? (machine.debitFeeBasisPoints / 100).toFixed(2).replace('.', ',') : '',
    pixFee: machine.pixFeeBasisPoints != null ? (machine.pixFeeBasisPoints / 100).toFixed(2).replace('.', ',') : '',
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [confirmInactivate, setConfirmInactivate] = useState(false)

  // ── Parcelamentos ──
  const [showInstallments, setShowInstallments] = useState(false)
  const [installments, setInstallments] = useState<CardMachineInstallmentResponse[]>([])
  const [loadingInstallments, setLoadingInstallments] = useState(false)
  const [newInstQty, setNewInstQty] = useState('2')
  const [newInstFee, setNewInstFee] = useState('')
  const [addingInst, setAddingInst] = useState(false)
  const [instError, setInstError] = useState<string | null>(null)
  const [editingInstId, setEditingInstId] = useState<string | null>(null)
  const [editInstFee, setEditInstFee] = useState('')
  const [savingInst, setSavingInst] = useState(false)
  const [deletingInstId, setDeletingInstId] = useState<string | null>(null)
  const [confirmDeleteInstId, setConfirmDeleteInstId] = useState<string | null>(null)

  async function loadInstallments() {
    setLoadingInstallments(true)
    try {
      const res = await fetch(`/api/card-machines/${machine.id}/installments`)
      const json: ApiSuccess<CardMachineInstallmentResponse[]> = await res.json()
      if ('data' in json) setInstallments(json.data)
    } catch { /* noop */ } finally { setLoadingInstallments(false) }
  }

  function toggleInstallments() {
    if (!showInstallments && installments.length === 0) loadInstallments()
    setShowInstallments(p => !p)
  }

  async function handleAddInstallment() {
    setInstError(null)
    const qty = parseInt(newInstQty, 10)
    if (isNaN(qty) || qty < 2 || qty > 12) { setInstError('Parcelas: 2 a 12'); return }
    let bps = 0
    try { bps = parseBasisPoints(newInstFee) } catch { setInstError('Taxa inválida (ex: 2,99)'); return }
    if (bps > 5000) { setInstError('A taxa não pode ser maior que 50%'); return }
    setAddingInst(true)
    try {
      const res = await fetch(`/api/card-machines/${machine.id}/installments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installments: qty, feeBasisPoints: bps }),
      })
      const json: ApiResponse<CardMachineInstallmentResponse> = await res.json()
      if (!res.ok) {
        const code = 'code' in json ? (json as { code?: string }).code : undefined
        setInstError(code === 'INSTALLMENT_EXISTS' ? `${qty}× já cadastrado` : 'error' in json ? json.error : 'Erro ao adicionar')
        return
      }
      if ('data' in json) setInstallments(p => [...p, json.data].sort((a, b) => a.installments - b.installments))
      setNewInstFee('')
      // Reset para a proxima parcela disponivel (nao hardcodar '2')
      const nextAvailable = availableQtys.find(n => n !== qty)
      setNewInstQty(nextAvailable ? String(nextAvailable) : '2')
    } catch { setInstError('Erro de conexão') } finally { setAddingInst(false) }
  }

  async function handleSaveInstallment(id: string) {
    let bps = 0
    try { bps = parseBasisPoints(editInstFee) } catch { setInstError('Taxa inválida (ex: 2,99)'); return }
    if (bps > 5000) { setInstError('A taxa não pode ser maior que 50%'); return }
    setSavingInst(true)
    setInstError(null)
    try {
      const res = await fetch(`/api/card-machines/${machine.id}/installments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feeBasisPoints: bps }),
      })
      const json: ApiResponse<CardMachineInstallmentResponse> = await res.json()
      // QA-042: verificar res.ok antes de fechar o editor
      if (!res.ok) {
        setInstError('error' in json ? json.error : 'Erro ao salvar taxa. Tente novamente.')
        return
      }
      if ('data' in json) setInstallments(p => p.map(i => i.id === id ? json.data : i))
      setEditingInstId(null)
    } catch { setInstError('Erro de conexão. Tente novamente.') } finally { setSavingInst(false) }
  }

  async function handleDeleteInstallment(id: string) {
    setDeletingInstId(id)
    setInstError(null)
    try {
      const res = await fetch(`/api/card-machines/${machine.id}/installments/${id}`, { method: 'DELETE' })
      // QA-043: verificar res.ok antes de remover da UI
      if (!res.ok) {
        setInstError('Erro ao remover parcelamento. Tente novamente.')
        setConfirmDeleteInstId(null)
        return
      }
      setInstallments(p => p.filter(i => i.id !== id))
      setConfirmDeleteInstId(null)
    } catch { setInstError('Erro de conexão. Tente novamente.') } finally { setDeletingInstId(null) }
  }

  // Opções de parcelas ainda não cadastradas (2-12)
  const usedQtys = new Set(installments.map(i => i.installments))
  const availableQtys = Array.from({ length: 11 }, (_, i) => i + 2).filter(n => !usedQtys.has(n))

  function validate(): boolean {
    const errs: FormErrors = {}
    if (!form.name.trim()) errs.name = 'Nome obrigatório'
    if (!form.fee.trim()) {
      errs.fee = 'Taxa obrigatória'
    } else {
      try {
        const bps = parseBasisPoints(form.fee)
        if (bps > 5000) errs.fee = 'A taxa não pode ser maior que 50%'
      } catch {
        errs.fee = 'Taxa inválida (ex: 1,99)'
      }
    }
    // v2.5: débito e PIX são opcionais — vazio = não configurada
    for (const key of ['debitFee', 'pixFee'] as const) {
      const raw = form[key].trim()
      if (!raw) continue
      try {
        const bps = parseBasisPoints(raw)
        if (bps > 5000) errs[key] = 'A taxa não pode ser maior que 50%'
      } catch {
        errs[key] = 'Taxa inválida (ex: 1,99)'
      }
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    const errMsg = await onUpdate(machine.id, form)
    setSaving(false)
    if (errMsg) {
      setErrors({ general: errMsg })
    } else {
      setEditing(false)
      setErrors({})
    }
  }

  async function handleToggle() {
    setToggling(true)
    await onToggleActive(machine.id, machine.isActive)
    setToggling(false)
    setConfirmInactivate(false)
  }

  if (editing) {
    return (
      <div className={cn(
        'border-b border-border last:border-0 px-6 py-4 bg-accent/30',
        !machine.isActive && 'opacity-60'
      )}>
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-end gap-3">
          <div className="flex-1 min-w-0">
            <Input
              label="Nome"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              error={errors.name}
              placeholder="Ex: Cielo"
              autoFocus
            />
          </div>
          <div className="w-full sm:w-28">
            <Input
              label="Crédito (%)"
              value={form.fee}
              onChange={e => setForm(p => ({ ...p, fee: e.target.value }))}
              error={errors.fee}
              placeholder="1,99"
            />
          </div>
          <div className="w-full sm:w-28">
            <Input
              label="Débito (%)"
              value={form.debitFee}
              onChange={e => setForm(p => ({ ...p, debitFee: e.target.value }))}
              error={errors.debitFee}
              placeholder="—"
            />
          </div>
          <div className="w-full sm:w-28">
            <Input
              label="PIX (%)"
              value={form.pixFee}
              onChange={e => setForm(p => ({ ...p, pixFee: e.target.value }))}
              error={errors.pixFee}
              placeholder="—"
            />
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <Button
              size="sm"
              onClick={handleSave}
              loading={saving}
              aria-label="Salvar"
            >
              <Check className="h-3.5 w-3.5" />
              Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setEditing(false); setErrors({}) }}
              aria-label="Cancelar"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {errors.general && (
          <p className="mt-2 text-xs text-destructive">{errors.general}</p>
        )}
      </div>
    )
  }

  return (
    <div className={cn('border-b border-border last:border-0', !machine.isActive && 'opacity-60')}>
      {/* Linha principal */}
      <div className="px-6 py-4 flex items-center gap-4 hover:bg-muted/50 transition-colors">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{machine.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Crédito {formatBasisPoints(machine.feeBasisPoints)}
            {machine.debitFeeBasisPoints != null && <> · Débito {formatBasisPoints(machine.debitFeeBasisPoints)}</>}
            {machine.pixFeeBasisPoints != null && <> · PIX {formatBasisPoints(machine.pixFeeBasisPoints)}</>}
            {' '}por transação
          </p>
        </div>
        <Badge variant={machine.isActive ? 'success' : 'muted'}>
          {machine.isActive ? 'Ativa' : 'Inativa'}
        </Badge>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Editar ${machine.name}`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {machine.isActive ? (
            confirmInactivate ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">Inativar?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  loading={toggling}
                  onClick={handleToggle}
                  className="h-6 px-2 text-[0.625rem]"
                >
                  Sim
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmInactivate(false)}
                  className="h-6 px-1"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                loading={toggling}
                onClick={() => setConfirmInactivate(true)}
                className="text-xs"
              >
                Inativar
              </Button>
            )
          ) : (
            <Button
              size="sm"
              variant="ghost"
              loading={toggling}
              onClick={handleToggle}
              className="text-xs"
            >
              Ativar
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={toggleInstallments} className="text-xs gap-1">
            Parcelas
            <ChevronDown className={cn('h-3 w-3 transition-transform', showInstallments && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {/* Accordion de parcelamentos */}
      {showInstallments && (
        <div className="px-6 pb-4 bg-muted/20 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground mt-3 mb-2">Taxas de Parcelamento (Crédito)</p>

          {loadingInstallments ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
            </div>
          ) : (
            <div className="space-y-1.5 mb-3">
              {/* 1× somente leitura */}
              <div className="flex items-center gap-3 text-xs">
                <span className="w-12 text-muted-foreground font-medium">1× à vista</span>
                <span className="text-foreground">{formatBasisPoints(machine.feeBasisPoints)}</span>
                <span className="text-muted-foreground text-[0.625rem]">(taxa crédito à vista)</span>
              </div>
              {/* Parcelamentos cadastrados */}
              {installments.map(inst => (
                <div key={inst.id} className="flex items-center gap-3 text-xs">
                  <span className="w-12 text-muted-foreground font-medium">{inst.installments}×</span>
                  {editingInstId === inst.id ? (
                    <>
                      <input
                        type="text"
                        value={editInstFee}
                        onChange={e => setEditInstFee(e.target.value)}
                        className="w-20 rounded border border-input bg-background px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="2,99"
                        autoFocus
                      />
                      <Button size="sm" loading={savingInst} onClick={() => handleSaveInstallment(inst.id)} className="h-6 px-2 text-[0.625rem]">OK</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingInstId(null)} className="h-6 px-1">
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : confirmDeleteInstId === inst.id ? (
                    <>
                      <span className="text-destructive">Remover {inst.installments}×?</span>
                      <Button size="sm" variant="destructive" loading={deletingInstId === inst.id} onClick={() => handleDeleteInstallment(inst.id)} className="h-6 px-2 text-[0.625rem]">Sim</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteInstId(null)} className="h-6 px-1 text-[0.625rem]">Não</Button>
                    </>
                  ) : (
                    <>
                      <span className="text-foreground">{formatBasisPoints(inst.feeBasisPoints)}</span>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingInstId(inst.id); setEditInstFee((inst.feeBasisPoints / 100).toFixed(2).replace('.', ',')) }} className="h-6 px-1">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteInstId(inst.id)} className="h-6 px-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Adicionar novo parcelamento */}
          {availableQtys.length > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
              <span className="text-xs text-muted-foreground shrink-0">+ Adicionar:</span>
              <select
                value={newInstQty}
                onChange={e => setNewInstQty(e.target.value)}
                className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none"
              >
                {availableQtys.map(n => <option key={n} value={n}>{n}×</option>)}
              </select>
              <input
                type="text"
                value={newInstFee}
                onChange={e => setNewInstFee(e.target.value)}
                placeholder="Taxa % (ex: 2,99)"
                className="w-28 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button size="sm" loading={addingInst} onClick={handleAddInstallment} className="h-7 px-3 text-xs">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
          )}
          {instError && <p className="mt-1.5 text-xs text-destructive">{instError}</p>}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function ConfiguracoesPage() {
  // ── State: Categorias ──
  const [categories, setCategories] = useState<CategoryResponse[]>([])
  const [loadingCats, setLoadingCats] = useState(true)
  const [catName, setCatName] = useState('')
  const [catNameError, setCatNameError] = useState<string | undefined>()
  const [catAddError, setCatAddError] = useState<string | null>(null)
  const [addingCat, setAddingCat] = useState(false)
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [editCatError, setEditCatError] = useState<string | undefined>()
  const [savingCat, setSavingCat] = useState(false)
  const [togglingCat, setTogglingCat] = useState<string | null>(null)
  const [confirmInactivateCat, setConfirmInactivateCat] = useState<string | null>(null)

  // ── State: Maquininhas ──
  const [machines, setMachines] = useState<CardMachineResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [addForm, setAddForm] = useState<{ name: string; fee: string; debitFee: string; pixFee: string }>({ name: '', fee: '', debitFee: '', pixFee: '' })
  const [addErrors, setAddErrors] = useState<{ name?: string; fee?: string; debitFee?: string; pixFee?: string; general?: string }>({})
  const [adding, setAdding] = useState(false)

  // ── State: Dados da Loja ──
  const [shopName, setShopName] = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [shopPhone, setShopPhone] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)

  // ── Seguranca: troca de PIN ──
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [changingPin, setChangingPin] = useState(false)
  const [pinSaved, setPinSaved] = useState(false)
  // QA-081: false = sistema ainda usa o PIN padrao (1234) — exibir aviso.
  // null = desconhecido (carregando ou resposta sem o campo).
  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null)
  const [pinError, setPinError] = useState<{
    current?: string
    new?: string
    confirm?: string
    general?: string
  } | null>(null)

  // ── Carregar settings ──
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((j: ApiSuccess<SettingsResponse>) => {
        if ('data' in j) {
          setShopName(j.data.shopName)
          setShopAddress(j.data.address ?? '')
          setShopPhone(j.data.phone ?? '')
          // QA-081: campo presente apenas com sessao PIN (esta tela e protegida)
          setPinConfigured(j.data.pinConfigured ?? null)
        }
      })
      .catch(() => {})
  }, [])

  // ── Salvar dados da loja ──
  async function handleSaveSettings() {
    if (!shopName.trim()) { setSettingsError('Nome da loja obrigatório'); return }
    setSavingSettings(true)
    setSettingsError(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName: shopName.trim(),
          address: shopAddress.trim() || null,
          phone: shopPhone.trim() || null,
        }),
      })
      const json: ApiResponse<SettingsResponse> = await res.json()
      if (!res.ok) { setSettingsError('error' in json ? json.error : 'Erro ao salvar'); return }
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 3000)
    } catch { setSettingsError('Erro de conexão. Tente novamente.') }
    finally { setSavingSettings(false) }
  }

  // ── Carregar categorias ──
  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories?includeInactive=true', { cache: 'no-store' })
      const json: ApiResponse<CategoryResponse[]> = await res.json()
      if ('data' in json) setCategories(json.data)
    } catch { /* silencioso */ } finally { setLoadingCats(false) }
  }, [])

  useEffect(() => { loadCategories() }, [loadCategories])

  async function handleAddCategory() {
    if (!catName.trim()) { setCatNameError('Nome obrigatorio'); return }
    if (catName.trim().length > 80) { setCatNameError('Maximo 80 caracteres'); return }
    setCatNameError(undefined)
    setAddingCat(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: catName.trim() }),
      })
      const json: ApiResponse<CategoryResponse> = await res.json()
      if (!res.ok) {
        const code = 'code' in json ? (json as { code?: string }).code : undefined
        setCatAddError(code === 'NAME_TAKEN' ? 'Ja existe uma categoria com este nome' : 'error' in json ? json.error : 'Erro ao adicionar')
        return
      }
      if ('data' in json) setCategories(prev => [...prev, json.data].sort((a, b) => a.name.localeCompare(b.name)))
      setCatName('')
      setCatAddError(null)
    } catch { setCatAddError('Erro de conexao. Tente novamente.') }
    finally { setAddingCat(false) }
  }

  function startEditCat(cat: CategoryResponse) {
    setEditingCatId(cat.id)
    setEditCatName(cat.name)
    setEditCatError(undefined)
  }

  function cancelEditCat() {
    setEditingCatId(null)
    setEditCatName('')
    setEditCatError(undefined)
  }

  async function handleSaveCategory() {
    if (!editCatName.trim()) { setEditCatError('Nome obrigatorio'); return }
    setSavingCat(true)
    try {
      const res = await fetch('/api/categories/' + editingCatId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editCatName.trim() }),
      })
      const json: ApiResponse<CategoryResponse> = await res.json()
      if (!res.ok) {
        const code = 'code' in json ? (json as { code?: string }).code : undefined
        setEditCatError(code === 'NAME_TAKEN' ? 'Ja existe uma categoria com este nome' : 'Erro ao salvar')
        return
      }
      if ('data' in json) setCategories(prev => prev.map(c => c.id === editingCatId ? json.data : c))
      cancelEditCat()
    } catch { setEditCatError('Erro de conexao.') }
    finally { setSavingCat(false) }
  }

  async function handleToggleCategory(id: string, currentlyActive: boolean) {
    setTogglingCat(id)
    try {
      const res = await fetch('/api/categories/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentlyActive }),
      })
      const json: ApiResponse<CategoryResponse> = await res.json()
      if ('data' in json) setCategories(prev => prev.map(c => c.id === id ? json.data : c))
    } catch { loadCategories() }
    finally { setTogglingCat(null); setConfirmInactivateCat(null) }
  }

  // ── Carregar maquininhas ──
  const loadMachines = useCallback(async () => {
    try {
      const res = await fetch('/api/card-machines?includeInactive=true', { cache: 'no-store' })
      const json: ApiResponse<CardMachineResponse[]> = await res.json()
      if ('data' in json) setMachines(json.data)
    } catch { /* silencioso */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadMachines() }, [loadMachines])

  // ── Adicionar maquininha ──
  async function handleAdd() {
    const errs: typeof addErrors = {}
    if (!addForm.name.trim()) errs.name = 'Nome obrigatório'
    if (!addForm.fee.trim()) errs.fee = 'Taxa obrigatória'
    else {
      try {
        const bps = parseBasisPoints(addForm.fee)
        if (bps > 5000) errs.fee = 'A taxa não pode ser maior que 50%'
      } catch { errs.fee = 'Taxa inválida (ex: 1,99)' }
    }
    // v2.5: débito e PIX opcionais
    for (const key of ['debitFee', 'pixFee'] as const) {
      const raw = addForm[key].trim()
      if (!raw) continue
      try {
        const bps = parseBasisPoints(raw)
        if (bps > 5000) errs[key] = 'A taxa não pode ser maior que 50%'
      } catch { errs[key] = 'Taxa inválida (ex: 1,99)' }
    }
    if (Object.keys(errs).length > 0) { setAddErrors(errs); return }
    setAdding(true)
    try {
      const res = await fetch('/api/card-machines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addForm.name.trim(),
          feeBasisPoints: parseBasisPoints(addForm.fee),
          debitFeeBasisPoints: addForm.debitFee.trim() ? parseBasisPoints(addForm.debitFee) : null,
          pixFeeBasisPoints: addForm.pixFee.trim() ? parseBasisPoints(addForm.pixFee) : null,
        }),
      })
      const json: ApiResponse<CardMachineResponse> = await res.json()
      if (!res.ok) { setAddErrors({ general: 'error' in json ? json.error : 'Erro ao adicionar' }); return }
      if ('data' in json) setMachines(prev => [...prev, json.data])
      setAddForm({ name: '', fee: '', debitFee: '', pixFee: '' })
      setAddErrors({})
    } catch { setAddErrors({ general: 'Erro de conexão.' }) }
    finally { setAdding(false) }
  }

  async function handleUpdate(id: string, form: { name: string; fee: string; debitFee: string; pixFee: string }): Promise<string | null> {
    let bps: number
    try { bps = parseBasisPoints(form.fee) } catch { return 'Taxa inválida (ex: 1,99)' }
    if (bps > 5000) return 'A taxa não pode ser maior que 50%'
    // v2.5: débito e PIX opcionais — vazio limpa a taxa (null)
    let debitBps: number | null = null
    let pixBps: number | null = null
    try { debitBps = form.debitFee.trim() ? parseBasisPoints(form.debitFee) : null } catch { return 'Taxa de débito inválida (ex: 1,99)' }
    try { pixBps = form.pixFee.trim() ? parseBasisPoints(form.pixFee) : null } catch { return 'Taxa de PIX inválida (ex: 1,99)' }
    if ((debitBps ?? 0) > 5000 || (pixBps ?? 0) > 5000) return 'A taxa não pode ser maior que 50%'
    try {
      const res = await fetch(`/api/card-machines/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), feeBasisPoints: bps, debitFeeBasisPoints: debitBps, pixFeeBasisPoints: pixBps }),
      })
      const json: ApiResponse<CardMachineResponse> = await res.json()
      if (!res.ok) return 'error' in json ? json.error : 'Erro ao salvar'
      if ('data' in json) setMachines(prev => prev.map(m => m.id === id ? json.data : m))
      return null
    } catch { return 'Erro de conexão.' }
  }

  async function handleChangePIN() {
    setPinError(null)
    setPinSaved(false)

    const errs: NonNullable<typeof pinError> = {}
    if (!currentPin) errs.current = 'PIN atual obrigatorio'
    if (!newPin) errs.new = 'Novo PIN obrigatorio'
    else if (!/^\d{4}$/.test(newPin)) errs.new = 'O PIN deve ter exatamente 4 digitos numericos'
    if (!confirmPin) errs.confirm = 'Confirmacao obrigatoria'
    else if (newPin && confirmPin !== newPin) errs.confirm = 'Os PINs nao coincidem'

    if (Object.keys(errs).length > 0) { setPinError(errs); return }

    setChangingPin(true)
    try {
      const res = await fetch('/api/auth/pin/change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin, newPin, confirmPin }),
      })
      const json = await res.json()

      if (!res.ok) {
        const code = (json as { code?: string }).code
        if (code === 'WRONG_CURRENT_PIN') {
          setPinError({ current: 'PIN atual incorreto' })
        } else if (code === 'PIN_MISMATCH') {
          setPinError({ confirm: 'Os PINs nao coincidem' })
        } else if (code === 'INVALID_NEW_PIN') {
          setPinError({ new: 'O PIN deve ter exatamente 4 digitos numericos' })
        } else {
          setPinError({ general: (json as { error?: string }).error ?? 'Erro ao alterar PIN' })
        }
        return
      }

      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
      setPinSaved(true)
      setPinConfigured(true) // QA-081: PIN proprio definido — remover o aviso
      setTimeout(() => setPinSaved(false), 4000)
    } catch {
      setPinError({ general: 'Erro de conexao. Tente novamente.' })
    } finally {
      setChangingPin(false)
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    try {
      if (isActive) {
        // QA-041: verificar res.ok antes de atualizar UI
        const res = await fetch(`/api/card-machines/${id}`, { method: 'DELETE' })
        if (!res.ok) {
          // Falha silenciosa — recarregar para refletir estado real do banco
          loadMachines()
          return
        }
        setMachines(prev => prev.map(m => m.id === id ? { ...m, isActive: false } : m))
      } else {
        const res = await fetch(`/api/card-machines/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isActive: true }),
        })
        const json: ApiResponse<CardMachineResponse> = await res.json()
        if (!res.ok) { loadMachines(); return }
        if ('data' in json) setMachines(prev => prev.map(m => m.id === id ? json.data : m))
      }
    } catch { loadMachines() }
  }

  return (
    <div className="px-4 py-7 sm:px-6 lg:px-8 max-w-3xl mx-auto">

      {/* Cabeçalho */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie maquininhas e preferências da loja</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning bg-warning-muted border border-warning-border rounded-full px-3 py-1">
          <Lock className="h-3 w-3" strokeWidth={2} />
          Área protegida
        </span>
      </div>

      {/* ── Categorias ── */}
      <section className="mb-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Categorias de Produto
        </p>
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Formulario de adicao */}
          <div className="px-6 py-4 border-b border-border bg-muted/30">
            <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4 text-accent-foreground" />
              Adicionar categoria
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Input
                  label="Nome"
                  value={catName}
                  onChange={e => { setCatName(e.target.value); setCatNameError(undefined) }}
                  error={catNameError}
                  placeholder="Ex: Blusas, Vestidos, Calcas"
                  onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                />
              </div>
              <div className="pb-0.5">
                <Button onClick={handleAddCategory} loading={addingCat} size="md">
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </Button>
              </div>
            </div>
            {catAddError && <p className="mt-2 text-xs text-destructive">{catAddError}</p>}
          </div>

          {/* Lista */}
          {loadingCats ? (
            <div className="divide-y divide-border">
              {[1, 2, 3].map(i => (
                <div key={i} className="px-6 py-4 flex items-center gap-4">
                  <div className="h-4 w-28 bg-muted animate-pulse rounded flex-1" />
                  <div className="h-5 w-14 bg-muted animate-pulse rounded-full" />
                </div>
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Tag className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-foreground">Nenhuma categoria cadastrada</p>
              <p className="mt-1 text-xs text-muted-foreground">Adicione uma categoria acima para comecar.</p>
            </div>
          ) : (
            <div>
              {categories.map(cat => (
                editingCatId === cat.id ? (
                  <div key={cat.id} className="border-b border-border last:border-0 px-6 py-4 bg-accent/30 flex items-end gap-3">
                    <div className="flex-1">
                      <Input
                        label="Nome"
                        value={editCatName}
                        onChange={e => { setEditCatName(e.target.value); setEditCatError(undefined) }}
                        error={editCatError}
                        autoFocus
                      />
                    </div>
                    <div className="flex items-center gap-2 pb-0.5">
                      <Button size="sm" loading={savingCat} onClick={handleSaveCategory}>
                        <Check className="h-3.5 w-3.5" /> Salvar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEditCat}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div key={cat.id} className="border-b border-border last:border-0 px-6 py-4 flex items-center gap-4 hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm font-medium truncate', !cat.isActive && 'text-muted-foreground line-through')}>
                        {cat.name}
                      </p>
                    </div>
                    <Badge variant={cat.isActive ? 'success' : 'muted'}>
                      {cat.isActive ? 'Ativa' : 'Inativa'}
                    </Badge>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => startEditCat(cat)} aria-label={"Editar " + cat.name}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {cat.isActive ? (
                        confirmInactivateCat === cat.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">Inativar?</span>
                            <Button size="sm" variant="destructive" loading={togglingCat === cat.id}
                              onClick={() => handleToggleCategory(cat.id, true)} className="h-6 px-2 text-[0.625rem]">
                              Sim
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmInactivateCat(null)} className="h-6 px-1">
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="secondary" className="text-xs"
                            onClick={() => setConfirmInactivateCat(cat.id)}>
                            Inativar
                          </Button>
                        )
                      ) : (
                        <Button size="sm" variant="ghost" className="text-xs" loading={togglingCat === cat.id}
                          onClick={() => handleToggleCategory(cat.id, false)}>
                          Ativar
                        </Button>
                      )}
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Maquininhas de Cartão ── */}
      <section className="mb-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Maquininhas de Cartão
        </p>
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Formulário de adição */}
          <div className="px-6 py-4 border-b border-border bg-muted/30">
            <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Plus className="h-4 w-4 text-accent-foreground" />
              Adicionar maquininha
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-end gap-3">
              <div className="flex-1 min-w-0">
                <Input
                  label="Nome"
                  value={addForm.name}
                  onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                  error={addErrors.name}
                  placeholder="Ex: Cielo, Stone, PagSeguro"
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div className="w-full sm:w-28">
                <Input
                  label="Crédito à vista (%)"
                  value={addForm.fee}
                  onChange={e => setAddForm(p => ({ ...p, fee: e.target.value }))}
                  error={addErrors.fee}
                  placeholder="1,99"
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div className="w-full sm:w-28">
                <Input
                  label="Débito (%)"
                  value={addForm.debitFee}
                  onChange={e => setAddForm(p => ({ ...p, debitFee: e.target.value }))}
                  error={addErrors.debitFee}
                  placeholder="opcional"
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div className="w-full sm:w-28">
                <Input
                  label="PIX (%)"
                  value={addForm.pixFee}
                  onChange={e => setAddForm(p => ({ ...p, pixFee: e.target.value }))}
                  error={addErrors.pixFee}
                  placeholder="opcional"
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div className="pb-0.5">
                <Button onClick={handleAdd} loading={adding} size="md">
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </Button>
              </div>
            </div>
            {addErrors.general && <p className="mt-2 text-xs text-destructive">{addErrors.general}</p>}
          </div>

          {/* Lista */}
          {loading ? (
            <div className="divide-y divide-border">
              {[1, 2].map(i => (
                <div key={i} className="px-6 py-4 flex items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="h-5 w-14 bg-muted animate-pulse rounded-full" />
                </div>
              ))}
            </div>
          ) : machines.length === 0 ? (
            <EmptyState icon={CreditCard} title="Nenhuma maquininha cadastrada" description="Adicione uma maquininha acima para começar." />
          ) : (
            <div>
              {machines.map(machine => (
                <CardMachineRow
                  key={machine.id}
                  machine={machine}
                  onToggleActive={handleToggleActive}
                  onUpdate={handleUpdate}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Dados da Loja ── */}
      <section className="mb-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Dados da Loja
        </p>
        <div className="bg-surface rounded-xl border border-border shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <Store className="h-4 w-4 text-accent-foreground" />
            <p className="text-sm font-medium text-foreground">Informações exibidas na comanda</p>
          </div>
          <div className="space-y-4">
            <Input
              label="Nome da loja *"
              value={shopName}
              onChange={e => setShopName(e.target.value)}
              placeholder="Ex: Pimenta Ousada"
            />
            <Input
              label="Endereço (opcional)"
              value={shopAddress}
              onChange={e => setShopAddress(e.target.value)}
              placeholder="Ex: Rua das Flores, 123 — Pinheiros, SP"
            />
            <Input
              label="Telefone (opcional)"
              value={shopPhone}
              onChange={e => setShopPhone(e.target.value)}
              placeholder="Ex: (11) 91234-5678"
            />
          </div>
          {settingsError && <p className="mt-3 text-xs text-destructive">{settingsError}</p>}
          {settingsSaved && (
            <p className="mt-3 text-xs text-success font-medium flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Dados salvos com sucesso!
            </p>
          )}
          <div className="mt-4 flex justify-end">
            <Button onClick={handleSaveSettings} loading={savingSettings}>
              Salvar dados da loja
            </Button>
          </div>
        </div>
      </section>

      {/* ── Seguranca ── */}
      <section>
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Seguranca
        </p>
        <div className="bg-surface rounded-xl border border-border shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <Lock className="h-4 w-4 text-accent-foreground" />
            <p className="text-sm font-medium text-foreground">Alterar PIN de acesso</p>
          </div>

          {/* QA-081: aviso enquanto o sistema usa o PIN padrao (APP_PIN/1234).
              Sem PIN proprio, qualquer pessoa que conheca o padrao acessa
              relatorios e configuracoes. */}
          {pinConfigured === false && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-warning-border bg-warning-muted px-4 py-3" role="alert">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-warning leading-relaxed">
                O sistema ainda esta usando o <strong>PIN padrao (1234)</strong>, que e
                publico. Defina um PIN so seu abaixo — no campo &quot;PIN atual&quot;,
                digite <strong>1234</strong>.
              </p>
            </div>
          )}

          <div className="space-y-4 max-w-xs">
            <Input
              label="PIN atual"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={currentPin}
              onChange={e => { setCurrentPin(e.target.value.replace(/\D/g, '')); setPinError(null) }}
              placeholder="Digite o PIN atual"
              error={pinError?.current}
            />
            <Input
              label="Novo PIN (4 digitos)"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={e => { setNewPin(e.target.value.replace(/\D/g, '')); setPinError(null) }}
              placeholder="Digite o novo PIN"
              error={pinError?.new}
            />
            <Input
              label="Confirmar novo PIN"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={e => { setConfirmPin(e.target.value.replace(/\D/g, '')); setPinError(null) }}
              placeholder="Repita o novo PIN"
              error={pinError?.confirm}
            />
          </div>

          {pinError?.general && (
            <p className="mt-3 text-xs text-destructive">{pinError.general}</p>
          )}
          {pinSaved && (
            <p className="mt-3 text-xs text-success font-medium flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> PIN alterado com sucesso!
            </p>
          )}

          <div className="mt-4">
            <Button onClick={handleChangePIN} loading={changingPin}>
              Alterar PIN
            </Button>
          </div>
        </div>
      </section>

    </div>
  )
}
