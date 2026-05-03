# OpenClaw Desktop Build Script (Windows)
param(
  [switch]$SkipInstall,
  [switch]$SkipBundle,
  [switch]$Lite
)

$ErrorActionPreference = "Stop"
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
Set-Location $ProjectRoot

Write-Host "=========================================="
Write-Host "OpenClaw Desktop Build Script (Windows)"
Write-Host "=========================================="
Write-Host ""

# Prerequisites
try { $nodeVer = & node --version; Write-Host "✓ Node.js: $nodeVer" }
catch { Write-Error "Node.js is not installed."; exit 1 }

try { $npmVer = & npm --version; Write-Host "✓ npm: $npmVer" }
catch { Write-Error "npm is not installed."; exit 1 }
Write-Host ""

# npm install
if (-not $SkipInstall) {
  Write-Host "⚠ Installing dependencies..."
  npm install
  Write-Host "✓ Dependencies installed"
  Write-Host ""
}

# Bundle Node.js + openclaw
if (-not $SkipBundle) {
  $openclawMjs = "resources\node-x64\node_modules\openclaw\openclaw.mjs"
  if (-not (Test-Path $openclawMjs)) {
    Write-Host "⚠ Bundling Node.js + openclaw..."
    powershell -ExecutionPolicy Bypass -File scripts\bundle-node.ps1
    Write-Host "✓ Bundle complete"
  } else {
    Write-Host "✓ resources\node-x64\ already exists"
  }
  Write-Host ""
}

# Build
if (Test-Path "dist-electron") { Remove-Item "dist-electron" -Recurse -Force }
if (Test-Path "release") { Remove-Item "release" -Recurse -Force }

$BuildScript = if ($Lite) { "build:win:lite" } else { "build:win" }
$BuildLabel = if ($Lite) { "Windows lite" } else { "Windows" }

Write-Host "⚠ Building for $BuildLabel..."
npm run $BuildScript
Write-Host "✓ $BuildLabel build complete"

Write-Host ""
Write-Host "=========================================="
Write-Host "✓ Build completed!"
Write-Host "=========================================="
Write-Host ""
Write-Host "Output: release\"
