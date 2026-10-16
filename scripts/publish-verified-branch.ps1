param(
  [Parameter(Mandatory = $true)]
  [string[]]$Paths,
  [Parameter(Mandatory = $true)]
  [string]$Message,
  [switch]$Push
)

$ErrorActionPreference = 'Stop'
$root = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not $root) { throw 'Run this script from inside the MayzicAI Git repository.' }
Set-Location $root
$branch = (git branch --show-current).Trim()
if ($branch -eq 'main' -or $branch -notlike 'mayzicai/*') {
  throw "Refusing to publish from branch '$branch'. Use a dedicated mayzicai/* branch; main is never published by this script."
}
if (-not $Message.Trim()) { throw 'Commit message cannot be empty.' }
if ((git diff --cached --name-only).Count -gt 0) {
  throw 'The index already contains staged files. Review/commit or unstage them before running this script.'
}
foreach ($path in $Paths) {
  $full = [IO.Path]::GetFullPath((Join-Path $root $path))
  if (-not $full.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Path escapes repository: $path"
  }
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { throw "File not found: $path" }
  git add -- $path
  if ($LASTEXITCODE -ne 0) { throw "Could not stage: $path" }
}

Write-Host "=== STAGED FILES ($branch) ==="
git diff --cached --name-status
Write-Host '=== STAGED SUMMARY ==='
git diff --cached --stat
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged whitespace check failed.' }

$staged = git diff --cached --no-ext-diff --unified=0
$diffText = $staged -join "`n"
$blockedPatterns = @(
  ('-----BEGIN ' + '(RSA |EC |OPENSSH )?PRIVATE KEY-----'),
  '\bgh[pousr]_[A-Za-z0-9]{30,}\b',
  '\bgithub_pat_[A-Za-z0-9_]{30,}\b',
  '\bsk-[A-Za-z0-9_-]{32,}\b',
  '(?i)AKIA[0-9A-Z]{16}'
)
foreach ($pattern in $blockedPatterns) {
  if ($diffText -match $pattern) { throw "Potential secret detected in staged diff (pattern: $pattern). Nothing committed or pushed." }
}

Write-Host '=== REVIEW REQUIRED ==='
Write-Host 'Inspect the staged diff above before approving publication.'
 git --no-pager diff --cached
$answer = Read-Host "Type COMMIT $branch to create this commit"
if ($answer -cne "COMMIT $branch") { throw 'Review/commit cancelled. Staged files were left in the index for inspection.' }
git commit -m $Message
if ($LASTEXITCODE -ne 0) { throw 'Commit failed; nothing was pushed.' }
if ($Push) {
  $confirmPush = Read-Host "Type PUSH $branch to push this branch to origin (never main)"
  if ($confirmPush -cne "PUSH $branch") { throw 'Push cancelled. Local commit remains on the dedicated branch.' }
  git push --set-upstream origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'Push failed. The local commit is preserved.' }
}
Write-Host "Done. Branch: $branch"
