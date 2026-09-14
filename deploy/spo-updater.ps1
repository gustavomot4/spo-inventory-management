# =============================================================================
# spo-updater.ps1 - Agente de atualizacao GitOps pull-based (GITOPS-005)
# SPO - Sistema Pimenta Ousada
# =============================================================================
#
# Reconcilia a maquina com o manifesto declarativo do repositorio:
#   deploy/stable.json (canal padrao) em github.com/gustavomot4/SPO_inventory_management
#
# Ciclo (plano GitOps, secao 6):
#   lock -> manifesto (timeout 5s; sem internet = no-op) -> comparar versao ->
#   sync do docker-compose.yml da tag -> BACKUP pre-update -> compose pull ->
#   compose up -d -> healthcheck (120s) -> ok: grava versao | falha: ROLLBACK
#
# Regras de rollback (plano, secao 8):
#   breaking=false -> volta a imagem anterior (migrations sao aditivas)
#   breaking=true  -> restaura o backup pre-update E volta a imagem anterior
#
# Modos:  -Mode boot       (chamado pelo iniciar.bat, silencioso e rapido)
#         -Mode scheduled  (Tarefa Agendada 18h30)
#         -Mode manual     (operador, saida detalhada)
#
# Requisitos na maquina: Docker Desktop, PowerShell 5.1+. Repo/imagem publicos
# (pull anonimo). Logs em deploy\updates.log.
# =============================================================================

param(
  [ValidateSet('boot', 'scheduled', 'manual')]
  [string]$Mode = 'manual'
)

# EAP 'Continue' de proposito: no PowerShell 5.1, comando NATIVO (docker) que
# escreve em stderr com redirecionamento + EAP 'Stop' gera erro terminante
# espurio (NativeCommandError). Falhas sao tratadas explicitamente via
# $LASTEXITCODE e try/catch com -ErrorAction Stop pontual nos cmdlets.
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ----------------------------------------------------------------------------
# Configuracao
# ----------------------------------------------------------------------------
$Repo        = 'gustavomot4/SPO_inventory_management'
$Image       = 'ghcr.io/gustavomot4/spo'
$RawBase     = "https://raw.githubusercontent.com/$Repo"
$HealthUrl   = 'http://localhost:3000/api/health'
$HealthWaitS = 120
$NetTimeoutS = 5

$DeployDir   = $PSScriptRoot
$RootDir     = Split-Path $DeployDir -Parent
$EnvFile     = Join-Path $RootDir '.env'
$LockFile    = Join-Path $DeployDir 'updater.lock'
$LogFile     = Join-Path $DeployDir 'updates.log'
$ChannelFile = Join-Path $DeployDir 'channel'
$BackupsDir  = Join-Path $RootDir 'backups'

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
function Write-Log([string]$Msg, [string]$Level = 'INFO') {
  $line = '[{0}] [{1}] [{2}] {3}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Mode, $Level, $Msg
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  if ($Mode -ne 'boot' -or $Level -ne 'DEBUG') { Write-Host $line }
}

function Resolve-Docker {
  $cmd = Get-Command docker -ErrorAction SilentlyContinue
  if ($cmd) { return 'docker' }
  $candidates = @(
    "$env:ProgramFiles\Docker\Docker\resources\bin\docker.exe",
    "$env:LOCALAPPDATA\Docker\Docker\resources\bin\docker.exe"
  )
  foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
  return $null
}

function Compare-SemVer([string]$A, [string]$B) {
  # retorna -1 (A<B), 0 (A=B), 1 (A>B); versoes "vX.Y.Z"
  $pa = ($A.TrimStart('v') -split '\.') | ForEach-Object { [int]$_ }
  $pb = ($B.TrimStart('v') -split '\.') | ForEach-Object { [int]$_ }
  for ($i = 0; $i -lt 3; $i++) {
    if ($pa[$i] -lt $pb[$i]) { return -1 }
    if ($pa[$i] -gt $pb[$i]) { return 1 }
  }
  return 0
}

function Get-LocalVersion {
  # le SPO_VERSION do .env; retorna so a parte da tag (sem @digest), ou $null
  if (-not (Test-Path $EnvFile)) { return $null }
  $line = (Get-Content $EnvFile) | Where-Object { $_ -match '^\s*SPO_VERSION\s*=' } | Select-Object -First 1
  if (-not $line) { return $null }
  $val = ($line -split '=', 2)[1].Trim().Trim('"')
  if (-not $val) { return $null }
  return ($val -split '@')[0]
}

function Set-LocalVersion([string]$Ref) {
  # grava/atualiza SPO_VERSION=<Ref> no .env (Ref pode conter @sha256:...)
  $newLine = 'SPO_VERSION="{0}"' -f $Ref
  if (Test-Path $EnvFile) {
    $content = Get-Content $EnvFile
    if ($content -match '^\s*SPO_VERSION\s*=') {
      $content = $content | ForEach-Object {
        if ($_ -match '^\s*SPO_VERSION\s*=') { $newLine } else { $_ }
      }
    } else {
      $content = @($content) + @('', '# Gerenciado pelo spo-updater (GITOPS-003)', $newLine)
    }
    Set-Content -Path $EnvFile -Value $content -Encoding Ascii
  } else {
    Set-Content -Path $EnvFile -Value @(
      '# Arquivo gerado pelo spo-updater - versao da imagem em execucao (GITOPS-003)',
      $newLine
    ) -Encoding Ascii
  }
}

function Get-Manifest {
  $channel = 'stable'
  if (Test-Path $ChannelFile) {
    $c = (Get-Content $ChannelFile -First 1).Trim()
    if ($c -in @('stable', 'edge')) { $channel = $c }
  }
  $url = "$RawBase/main/deploy/$channel.json"
  try {
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $NetTimeoutS -ErrorAction Stop
    $m = $resp.Content | ConvertFrom-Json
    $m | Add-Member -NotePropertyName channel -NotePropertyValue $channel -Force
    return $m
  } catch {
    return $null   # sem internet / GitHub fora: no-op (RT-001)
  }
}

function Sync-ComposeFromTag([string]$Tag) {
  # GitOps: o compose tambem e estado declarativo - sincroniza da release
  try {
    $url = "$RawBase/$Tag/docker-compose.yml"
    $tmp = Join-Path $DeployDir 'docker-compose.yml.new'
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $NetTimeoutS -OutFile $tmp -ErrorAction Stop
    $target = Join-Path $RootDir 'docker-compose.yml'
    Copy-Item $target "$target.bak" -Force -ErrorAction SilentlyContinue
    Move-Item $tmp $target -Force -ErrorAction Stop
    Write-Log "docker-compose.yml sincronizado da tag $Tag"
  } catch {
    Write-Log "Nao foi possivel sincronizar docker-compose.yml da tag $Tag - usando o local. ($($_.Exception.Message))" 'WARN'
  }
}

function Sync-SelfFromTag([string]$Tag) {
  # auto-atualizacao do proprio updater (aplicada na PROXIMA execucao)
  try {
    $url = "$RawBase/$Tag/deploy/spo-updater.ps1"
    $tmp = Join-Path $DeployDir 'spo-updater.ps1.new'
    Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec $NetTimeoutS -OutFile $tmp -ErrorAction Stop
    Move-Item $tmp (Join-Path $DeployDir 'spo-updater.ps1') -Force -ErrorAction Stop
    Write-Log "spo-updater.ps1 sincronizado da tag $Tag"
  } catch {
    Write-Log "Nao foi possivel sincronizar o updater da tag $Tag. ($($_.Exception.Message))" 'WARN'
  }
}

function Invoke-PreUpdateBackup([string]$Docker, [string]$TargetVersion) {
  # Backup pre-update e INEGOCIAVEL quando ha banco (plano, secao 8.1).
  # Caminho 1: container spo-backup rodando -> Online Backup API (QA-075).
  # Caminho 2: containers parados (boot) -> copia at-rest (sem escritor ativo).
  $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
  $name = 'spo_preupdate_{0}_{1}.db' -f ($TargetVersion -replace '[^A-Za-z0-9\.\-]', '_'), $stamp
  if (-not (Test-Path $BackupsDir)) { New-Item -ItemType Directory -Path $BackupsDir | Out-Null }

  $running = & $Docker ps -q -f 'name=spo-backup' -f 'status=running' 2>$null
  if ($running) {
    # aspas: $name e sanitizado (sem espacos) -> .backup sem aspas internas,
    # evitando o problema de escaping de aspas aninhadas do PS 5.1 em args nativos
    & $Docker exec spo-backup sh -c "sqlite3 /data/spo.db '.backup /backups/$name'" 2>$null
    if ($LASTEXITCODE -eq 0) { Write-Log "Backup pre-update (Backup API): $name"; return $true }
    Write-Log 'Backup via container spo-backup falhou - tentando copia at-rest.' 'WARN'
  }

  # at-rest: app parada (ou exec falhou) - copiar db + wal + shm juntos
  & $Docker run --rm -v 'spo-pimenta-ousada-data:/data' -v "${BackupsDir}:/backups" alpine:3.19 sh -c "if [ ! -f /data/spo.db ]; then echo NODB; exit 42; fi; cp /data/spo.db /backups/$name && (cp /data/spo.db-wal /backups/$name-wal 2>/dev/null; cp /data/spo.db-shm /backups/$name-shm 2>/dev/null; true)"
  if ($LASTEXITCODE -eq 0) { Write-Log "Backup pre-update (copia at-rest): $name"; return $true }
  if ($LASTEXITCODE -eq 42) { Write-Log 'Banco ainda nao existe (primeira instalacao) - backup dispensado.'; return $true }
  Write-Log 'FALHA no backup pre-update - atualizacao ABORTADA (backup e pre-condicao).' 'ERROR'
  return $false
}

function Restore-PreUpdateBackup([string]$Docker) {
  # usado apenas em rollback de release breaking - restaura o backup mais recente
  $last = Get-ChildItem -Path $BackupsDir -Filter 'spo_preupdate_*.db' -ErrorAction SilentlyContinue |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $last) { Write-Log 'Nenhum backup pre-update encontrado para restaurar!' 'ERROR'; return $false }
  & $Docker compose stop spo 2>$null | Out-Null
  & $Docker run --rm -v 'spo-pimenta-ousada-data:/data' -v "${BackupsDir}:/backups" alpine:3.19 sh -c "cp '/backups/$($last.Name)' /data/spo.db && rm -f /data/spo.db-wal /data/spo.db-shm"
  if ($LASTEXITCODE -eq 0) { Write-Log "Banco restaurado de $($last.Name)" 'WARN'; return $true }
  Write-Log "FALHA ao restaurar $($last.Name) - intervencao manual necessaria (RUNBOOK)." 'ERROR'
  return $false
}

function Test-Health([string]$ExpectedVersion) {
  $deadline = (Get-Date).AddSeconds($HealthWaitS)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
      $j = $resp.Content | ConvertFrom-Json
      if ($j.ok -eq $true) {
        if ($ExpectedVersion -and $j.version -and $j.version -ne 'dev' -and $j.version -ne $ExpectedVersion) {
          Write-Log "Health OK mas versao reportada ($($j.version)) difere da esperada ($ExpectedVersion)." 'WARN'
        }
        return $true
      }
    } catch { }
    Start-Sleep -Seconds 5
  }
  return $false
}

function Remove-ForeignContainers([string]$Docker) {
  # Os servicos usam container_name fixo. Se ja existir um container com esse
  # nome criado por OUTRO projeto compose (ex.: pasta renomeada), o "up -d"
  # falha com "name already in use". Os dados ficam no volume nomeado, entao
  # remover o container antigo e seguro.
  try {
    $cfg = (& $Docker compose config --format json 2>$null) -join "`n" | ConvertFrom-Json
    $project = [string]$cfg.name
    foreach ($svc in $cfg.services.PSObject.Properties) {
      $cname = [string]$svc.Value.container_name
      if (-not $cname) { continue }
      $owner = & $Docker inspect $cname --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>$null
      if ($LASTEXITCODE -ne 0) { continue }
      if ([string]$owner -ne $project) {
        Write-Log "Container '$cname' pertence a outro projeto compose ('$owner' != '$project') - removendo para evitar conflito de nome." 'WARN'
        & $Docker rm -f $cname 2>$null | Out-Null
      }
    }
  } catch { Write-Log "Verificacao de containers conflitantes falhou (nao critico): $($_.Exception.Message)" 'WARN' }
}

function Invoke-Retention([string]$Docker, [string[]]$Keep) {
  # mantem apenas a imagem atual e a anterior (rollback offline) - GITOPS-008
  try {
    $tags = & $Docker images $Image --format '{{.Tag}}' 2>$null | Where-Object { $_ -and $_ -ne '<none>' }
    foreach ($t in $tags) {
      if ($Keep -notcontains $t) {
        & $Docker rmi "${Image}:$t" 2>$null | Out-Null
        Write-Log "Retencao: imagem ${Image}:$t removida" 'DEBUG'
      }
    }
  } catch { Write-Log "Retencao de imagens falhou (nao critico): $($_.Exception.Message)" 'WARN' }
}

# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
Set-Location $RootDir

# Lock (anti reentrada; lock obsoleto > 30 min e descartado)
if (Test-Path $LockFile) {
  $age = (Get-Date) - (Get-Item $LockFile).LastWriteTime
  if ($age.TotalMinutes -lt 30) { Write-Log 'Outra execucao em andamento (lock) - saindo.' 'DEBUG'; exit 0 }
  Write-Log 'Lock obsoleto descartado.' 'WARN'
}
Set-Content -Path $LockFile -Value $PID

try {
  $docker = Resolve-Docker
  if (-not $docker) { Write-Log 'Docker nao encontrado - saindo.' 'ERROR'; exit 1 }
  & $docker info 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Log 'Docker nao esta em execucao - saindo (o iniciar.bat cuida disso no boot).' 'DEBUG'; exit 0 }

  $manifest = Get-Manifest
  if (-not $manifest) { Write-Log 'Sem acesso ao manifesto (offline?) - mantendo versao atual.' 'DEBUG'; exit 0 }

  $target  = [string]$manifest.version
  $digest  = [string]$manifest.digest
  $breaking = [bool]$manifest.breaking
  $current = Get-LocalVersion

  if ($current -and (Compare-SemVer $current $target) -eq 0) {
    Write-Log "Convergido em $current (canal $($manifest.channel))." 'DEBUG'
    exit 0
  }
  if ($current -and (Compare-SemVer $current $target) -gt 0) {
    Write-Log "Versao local ($current) e MAIS NOVA que o canal ($target) - nada a fazer (downgrade so manual, ver RUNBOOK)." 'WARN'
    exit 0
  }
  if ($current -and $manifest.minSupported -and (Compare-SemVer $current ([string]$manifest.minSupported)) -lt 0) {
    Write-Log "Versao local ($current) abaixo do minimo suportado ($($manifest.minSupported)) - atualizacao automatica BLOQUEADA. Siga o RUNBOOK (atualizacao assistida)." 'ERROR'
    exit 1
  }

  $refTarget = if ($digest -and $digest -ne 'null') { "$target@$digest" } else { $target }
  Write-Log "Atualizacao disponivel: $(if ($current) { $current } else { '(bootstrap)' }) -> $target (canal $($manifest.channel), breaking=$breaking)"

  # 1. sincronizar estado declarativo da release (compose)
  Sync-ComposeFromTag $target

  # 2. backup pre-update (pre-condicao dura)
  if (-not (Invoke-PreUpdateBackup $docker $target)) { exit 1 }

  # 3. apontar nova versao e puxar imagem
  $rollbackRef = $null
  if ($current) {
    $rollbackRef = $current  # tag anterior (imagem retida localmente)
  }
  Set-LocalVersion $refTarget

  & $docker compose pull spo
  if ($LASTEXITCODE -ne 0) {
    Write-Log 'compose pull falhou (registry inacessivel?) - revertendo ponteiro de versao, sistema segue na atual.' 'ERROR'
    if ($rollbackRef) { Set-LocalVersion $rollbackRef }
    exit 1
  }

  # 4. aplicar
  Remove-ForeignContainers $docker
  & $docker compose up -d
  if ($LASTEXITCODE -ne 0) { Write-Log 'compose up falhou - iniciando rollback.' 'ERROR' }

  # 5. portao de qualidade
  if (($LASTEXITCODE -eq 0) -and (Test-Health $target)) {
    Write-Log "ATUALIZADO com sucesso para $target."
    Sync-SelfFromTag $target
    $keep = @(($refTarget -split '@')[0]); if ($rollbackRef) { $keep += $rollbackRef }
    Invoke-Retention $docker $keep
    exit 0
  }

  # 6. rollback
  Write-Log "Health da versao $target FALHOU - executando rollback." 'ERROR'
  if (-not $rollbackRef) {
    Write-Log 'Bootstrap sem versao anterior - nada para onde voltar. Intervencao manual (RUNBOOK).' 'ERROR'
    exit 1
  }
  if ($breaking) {
    Write-Log 'Release marcada como BREAKING - restaurando banco do backup pre-update antes de voltar a imagem.' 'WARN'
    Restore-PreUpdateBackup $docker | Out-Null
  }
  Set-LocalVersion $rollbackRef
  Remove-ForeignContainers $docker
  & $docker compose up -d
  if (Test-Health $rollbackRef) {
    Write-Log "Rollback concluido - sistema operando em $rollbackRef. Investigar a release $target antes de promover de novo." 'WARN'
    exit 0
  }
  Write-Log "ROLLBACK TAMBEM FALHOU - sistema pode estar fora do ar. Seguir RUNBOOK (restore manual)." 'ERROR'
  exit 1
}
finally {
  Remove-Item $LockFile -ErrorAction SilentlyContinue
}
