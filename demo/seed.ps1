<#
.SYNOPSIS
  Creates the Acme Bank demo teams and repositories in a GitHub org.

.DESCRIPTION
  Reads demo/repos, replaces __ORG__ with the org name, and for each repo:
  creates it (private) if it doesn't exist, pushes the content to main, and
  gives the owning team write access. Creates the four demo teams first.

  Without -Apply it only prints what it would do. Run again at any time: it
  skips what exists and only pushes a commit when the content changed.

  Needs the GitHub CLI signed in with access to the org:
  - repo scope to create and push repositories
  - admin:org scope to create teams (gh auth refresh --scopes admin:org),
    or create the teams by hand in the org's Teams page first.

.EXAMPLE
  .\demo\seed.ps1 -Org demoncartel            # dry run
  .\demo\seed.ps1 -Org demoncartel -Apply     # create teams and repos
#>
param(
  [Parameter(Mandatory = $true)][string]$Org,
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) { $gh = 'C:\Program Files\GitHub CLI\gh.exe' }
if (-not (Test-Path $gh)) { throw 'GitHub CLI (gh) not found. Install it with: winget install --id GitHub.cli --exact' }

$reposRoot = Join-Path $PSScriptRoot 'repos'
$teams = [ordered]@{
  'team-customer' = 'Acme Bank: customer experience, onboarding and KYC'
  'team-accounts' = 'Acme Bank: accounts, ledger and statements'
  'team-payments' = 'Acme Bank: payments, cards and fraud'
  'team-platform' = 'Acme Bank: platform, infrastructure and API gateway'
}

# Runs gh with its output hidden and returns whether it succeeded. Windows
# PowerShell 5.1 turns a native command's stderr into terminating errors when
# it is redirected under ErrorActionPreference=Stop, so relax it locally.
function Test-Gh {
  $ErrorActionPreference = 'Continue'
  & $gh @args *> $null
  return ($LASTEXITCODE -eq 0)
}

function Invoke-Native {
  param([string]$Exe, [string[]]$Arguments)
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Exe $($Arguments -join ' ') failed with exit code $LASTEXITCODE" }
}

# Reads a field from the Component named after the repo (a catalog file can
# hold several entities, e.g. Systems before the Component).
function Get-CatalogField {
  param([string]$CatalogFile, [string]$RepoName, [string]$Field)
  $docs = ([IO.File]::ReadAllText($CatalogFile)) -split '(?m)^---\s*$'
  $doc = $docs | Where-Object { $_ -match '(?m)^kind:\s*Component\s*$' -and $_ -match "(?m)^\s+name:\s*$([regex]::Escape($RepoName))\s*$" } | Select-Object -First 1
  if (-not $doc) { throw "No Component named $RepoName in $CatalogFile" }
  $line = $doc -split "`r?`n" | Where-Object { $_ -match "^\s+${Field}:\s" } | Select-Object -First 1
  $value = ($line -replace "^\s+${Field}:\s+", '').Trim()
  if ($value.StartsWith('"')) { $value = $value | ConvertFrom-Json }
  return $value
}

$mode = if ($Apply) { 'APPLY' } else { 'DRY RUN (add -Apply to make changes)' }
Write-Host "Acme Bank demo seed for github.com/$Org - $mode" -ForegroundColor Cyan

if (-not (Test-Gh api "orgs/$Org")) {
  throw "Can't read org '$Org'. Check the name and that 'gh auth status' shows an account with access to it."
}

# Teams
$teamsOk = $true
foreach ($slug in $teams.Keys) {
  if (Test-Gh api "orgs/$Org/teams/$slug") {
    Write-Host "  team  $slug  exists"
    continue
  }
  Write-Host "  team  $slug  create" -ForegroundColor Yellow
  if ($Apply) {
    if (-not (Test-Gh api -X POST "orgs/$Org/teams" -f "name=$slug" -f "description=$($teams[$slug])" -f 'privacy=closed')) {
      $teamsOk = $false
      Write-Warning "Couldn't create team $slug. Your gh login probably lacks the admin:org scope. Run 'gh auth refresh --scopes admin:org', or create the team in the org's Teams page, then run this again."
    }
  }
}

# Repositories
$utf8 = New-Object System.Text.UTF8Encoding $false
foreach ($dir in Get-ChildItem $reposRoot -Directory | Sort-Object Name) {
  $name = $dir.Name
  $catalogFile = Join-Path $dir.FullName 'catalog-info.yaml'
  $team = (Get-CatalogField $catalogFile $name 'owner') -replace '^group:', ''
  $description = Get-CatalogField $catalogFile $name 'description'
  $exists = Test-Gh repo view "$Org/$name"
  $action = if ($exists) { 'update' } else { 'create' }
  Write-Host "  repo  $name  $action, owner $team" -ForegroundColor $(if ($exists) { 'Gray' } else { 'Yellow' })
  if (-not $Apply) { continue }

  if (-not $exists) {
    Invoke-Native $gh @('repo', 'create', "$Org/$name", '--private', '--description', $description)
  }

  $work = Join-Path ([IO.Path]::GetTempPath()) "acme-seed-$name"
  if (Test-Path $work) { Remove-Item $work -Recurse -Force }
  Invoke-Native 'git' @('clone', '--quiet', "https://github.com/$Org/$name.git", $work)
  Get-ChildItem $work -Force | Where-Object { $_.Name -ne '.git' } | Remove-Item -Recurse -Force
  Copy-Item (Join-Path $dir.FullName '*') $work -Recurse -Force
  Get-ChildItem $work -Recurse -File | Where-Object { $_.FullName -notmatch '[\\/]\.git[\\/]' } | ForEach-Object {
    $text = [IO.File]::ReadAllText($_.FullName)
    if ($text.Contains('__ORG__')) { [IO.File]::WriteAllText($_.FullName, $text.Replace('__ORG__', $Org), $utf8) }
  }

  Invoke-Native 'git' @('-C', $work, 'checkout', '--quiet', '-B', 'main')
  Invoke-Native 'git' @('-C', $work, 'add', '-A')
  $changes = & git -C $work status --porcelain
  if ($changes) {
    Invoke-Native 'git' @('-C', $work, 'commit', '--quiet', '-m', 'Acme Bank demo content')
    Invoke-Native 'git' @('-C', $work, 'push', '--quiet', 'origin', 'main')
    Write-Host "        pushed" -ForegroundColor Green
  } else {
    Write-Host "        no changes"
  }
  Remove-Item $work -Recurse -Force

  if (Test-Gh api "orgs/$Org/teams/$team") {
    if (-not (Test-Gh api -X PUT "orgs/$Org/teams/$team/repos/$Org/$name" -f 'permission=push')) {
      Write-Warning "Couldn't give $team access to $name."
    }
  }
}

if ($Apply) {
  Write-Host ''
  Write-Host 'Done. Restart Backstage (or wait for the next discovery and org import runs) to see the content.' -ForegroundColor Cyan
  if (-not $teamsOk) { Write-Host 'Some teams are missing, so ownership links will point at groups that do not exist yet.' -ForegroundColor Yellow }
}
