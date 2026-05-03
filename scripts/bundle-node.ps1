# Bundle Node.js + openclaw into resources\node-ARCH\ for Windows.
#
# Builds x64 bundle by default (Windows arm64 not currently targeted).
#
# After running this script:
#   resources\node-x64\
#     node.exe                                    <- Node.js x64 binary
#     node_modules\openclaw\openclaw.mjs          <- OpenClaw entry point (x64 native deps)
#
# Run before packaging on Windows:
#   npm run bundle:node:win
#
# Override versions:
#   $env:NODE_VERSION="22.16.0"; npm run bundle:node:win
#
# Use mirrors:
#   $env:NODE_DIST_MIRROR="https://npmmirror.com/mirrors/node"; $env:NPM_REGISTRY_MIRROR="https://registry.npmmirror.com"; npm run bundle:node:win
#
# Build a specific arch:
#   $env:ARCH_OVERRIDE="arm64"; npm run bundle:node:win

param(
  [string]$NodeVersion,
  [string]$OpenclawVersion,
  [string]$ArchOverride,
  [switch]$ForceRefresh,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$PackageJsonPath = Join-Path $ProjectRoot "package.json"

function Get-BundleDefaults {
  param([string]$PackageJsonFile)

  $defaults = @{
    NodeVersion = "22.16.0"
    OpenclawVersion = "latest"
  }

  if (-not (Test-Path $PackageJsonFile)) { return $defaults }

  try {
    $pkg = Get-Content $PackageJsonFile -Raw | ConvertFrom-Json
    if ($pkg.openclawDesktopBundleDefaults) {
      if ($pkg.openclawDesktopBundleDefaults.nodeVersion -and $pkg.openclawDesktopBundleDefaults.nodeVersion.Trim() -ne "") {
        $defaults.NodeVersion = $pkg.openclawDesktopBundleDefaults.nodeVersion.Trim()
      }
      if ($pkg.openclawDesktopBundleDefaults.openclawVersion -and $pkg.openclawDesktopBundleDefaults.openclawVersion.Trim() -ne "") {
        $defaults.OpenclawVersion = $pkg.openclawDesktopBundleDefaults.openclawVersion.Trim()
      }
    }
  } catch {
    # Keep fallback defaults when package.json cannot be parsed.
  }

  return $defaults
}

$BundleDefaults = Get-BundleDefaults -PackageJsonFile $PackageJsonPath

if ($Help) {
  Write-Host "Usage:"
  Write-Host "  npm run bundle:node:win"
  Write-Host '  powershell -ExecutionPolicy Bypass -File scripts\bundle-node.ps1 -ForceRefresh'
  Write-Host '  $env:NODE_VERSION="22.16.0"; $env:OPENCLAW_VERSION="latest"; npm run bundle:node:win'
  Write-Host '  $env:ARCH_OVERRIDE="x64"; npm run bundle:node:win'
  Write-Host ""
  Write-Host "Options:"
  Write-Host "  -ForceRefresh   Force rebuild runtime dirs"
  Write-Host "  -Help           Show this help"
  Write-Host ""
  Write-Host "Environment variables:"
  Write-Host "  NODE_VERSION      Node.js version to bundle (default from package.json openclawDesktopBundleDefaults.nodeVersion)"
  Write-Host "  OPENCLAW_VERSION  OpenClaw version to install (default from package.json openclawDesktopBundleDefaults.openclawVersion)"
  Write-Host "  ARCH_OVERRIDE     Build only one arch (x64 or arm64)"
  Write-Host "  NODE_DIST_MIRROR  Node.js dist mirror base URL (default: https://nodejs.org/dist)"
  Write-Host "  NPM_REGISTRY_MIRROR  npm registry URL for view/install (default: npm default)"
  Write-Host ""
  Write-Host "Reuse policy:"
  Write-Host "  - Reuse existing runtime by default when installed Node/OpenClaw satisfy requested versions."
  Write-Host "  - OPENCLAW_VERSION=latest also reuses installed runtime when present."
  Write-Host "  - Rebuild only when FORCE_REFRESH is set or requested pinned version differs."
  exit 0
}

# Fallback to env vars / defaults
if (-not $NodeVersion -or $NodeVersion.Trim() -eq "") {
  $NodeVersion = if ($env:NODE_VERSION) { $env:NODE_VERSION } else { $BundleDefaults.NodeVersion }
}
if (-not $OpenclawVersion -or $OpenclawVersion.Trim() -eq "") {
  $OpenclawVersion = if ($env:OPENCLAW_VERSION) { $env:OPENCLAW_VERSION } else { $BundleDefaults.OpenclawVersion }
}
if (-not $ArchOverride -or $ArchOverride.Trim() -eq "") {
  $ArchOverride = if ($env:ARCH_OVERRIDE) { $env:ARCH_OVERRIDE } else { "" }
}
if ($env:NODE_DIST_MIRROR -and $env:NODE_DIST_MIRROR.Trim() -ne "") {
  $NodeDistMirror = $env:NODE_DIST_MIRROR.Trim().TrimEnd('/')
} else {
  $NodeDistMirror = 'https://nodejs.org/dist'
}
if ($env:NPM_REGISTRY_MIRROR -and $env:NPM_REGISTRY_MIRROR.Trim() -ne "") {
  $NpmRegistryMirror = $env:NPM_REGISTRY_MIRROR.Trim().TrimEnd('/')
} else {
  $NpmRegistryMirror = $null
}
if (-not $ForceRefresh -and $env:FORCE_REFRESH) {
  $normalized = $env:FORCE_REFRESH.ToString().Trim().ToLowerInvariant()
  if ($normalized -in @('1', 'true', 'yes')) {
    $ForceRefresh = $true
  }
}

function Normalize-OpenclawVersion {
  param([string]$Version)
  if ([string]::IsNullOrWhiteSpace($Version)) { return "latest" }
  $trimmed = $Version.Trim()
  if ($trimmed -eq "latest") { return "latest" }
  if ($trimmed.StartsWith("v")) { return $trimmed.Substring(1) }
  return $trimmed
}

function Resolve-LatestOpenclawVersion {
  param([string]$Registry)

  try {
    $npmArgs = @('view', 'openclaw', 'version', '--json')
    if (-not [string]::IsNullOrWhiteSpace($Registry)) {
      $npmArgs += @('--registry', $Registry)
    }
    $result = (& npm @npmArgs 2>$null)
    if (-not $result) { return $null }
    $text = ($result | Out-String).Trim()
    if ($text.StartsWith('"') -and $text.EndsWith('"')) {
      return $text.Trim('"')
    }
    return $text
  } catch {
    return $null
  }
}

function Get-HostNpmCommand {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($npm) { return $npm.Source }

  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if ($npm) { return $npm.Source }

  throw 'npm was not found in PATH. Run this script from an environment with npm installed.'
}

function Get-HostNpmVersion {
  param([string]$NpmCommand)

  if (-not $NpmCommand) { return '10.9.2' }

  try {
    $version = (& $NpmCommand --version).Trim()
    if ($version) { return $version }
  } catch {
    # fall through to default
  }

  return '10.9.2'
}

$OpenclawVersionRequested = Normalize-OpenclawVersion $OpenclawVersion
$TargetOpenclawVersion = $OpenclawVersionRequested
$InstallOpenclawSpec = $OpenclawVersionRequested
if ($OpenclawVersionRequested -eq "latest") {
  $resolvedLatest = Resolve-LatestOpenclawVersion -Registry $NpmRegistryMirror
  if (-not [string]::IsNullOrWhiteSpace($resolvedLatest)) {
    $TargetOpenclawVersion = $resolvedLatest
    $InstallOpenclawSpec = $resolvedLatest
  } else {
    Write-Host "⚠ Failed to resolve openclaw@latest; falling back to npm tag at install time."
    $TargetOpenclawVersion = "latest"
    $InstallOpenclawSpec = "latest"
  }
}

function Test-ReusableRuntime {
  param(
    [string]$NodeDir,
    [string]$NodeVersionRequested,
    [string]$OpenclawVersionRequested
  )

  if ($ForceRefresh) { return $false }

  $nodeExe = Join-Path $NodeDir 'node.exe'
  $openclawPkg = Join-Path $NodeDir 'node_modules\openclaw\package.json'
  if (-not (Test-Path $nodeExe)) { return $false }
  if (-not (Test-Path $openclawPkg)) { return $false }

  try {
    $installedNodeVersion = (& $nodeExe --version).Trim().TrimStart('v')
  } catch {
    return $false
  }
  if ($installedNodeVersion -ne $NodeVersionRequested) { return $false }

  try {
    $installedOpenclawVersion = (Get-Content $openclawPkg -Raw | ConvertFrom-Json).version
  } catch {
    return $false
  }
  if ($installedOpenclawVersion -ne $OpenclawVersionRequested) { return $false }

  return $true
}

function Test-UsableBundledNpm {
  param([string]$NodeDir)

  $npmCmd = Join-Path $NodeDir 'npm.cmd'
  $npxCmd = Join-Path $NodeDir 'npx.cmd'
  $npmCli = Join-Path $NodeDir 'node_modules\npm\bin\npm-cli.js'
  $npxCli = Join-Path $NodeDir 'node_modules\npm\bin\npx-cli.js'
  $npmPrefix = Join-Path $NodeDir 'node_modules\npm\bin\npm-prefix.js'

  return (Test-Path $npmCmd) -and (Test-Path $npxCmd) -and (Test-Path $npmCli) -and (Test-Path $npxCli) -and (Test-Path $npmPrefix)
}

function Restore-BundledNpmRuntime {
  param(
    [string]$NodeDir,
    [string]$NpmDirBackup,
    [string]$ShimBackupDir
  )

  if ($NpmDirBackup -and (Test-Path $NpmDirBackup)) {
    $NodeModulesDir = Join-Path $NodeDir 'node_modules'
    if (-not (Test-Path $NodeModulesDir)) {
      New-Item -ItemType Directory -Path $NodeModulesDir | Out-Null
    }
    $TargetNpmDir = Join-Path $NodeModulesDir 'npm'
    if (Test-Path $TargetNpmDir) {
      Remove-Item $TargetNpmDir -Recurse -Force
    }
    Copy-Item $NpmDirBackup $TargetNpmDir -Recurse
  }

  if ($ShimBackupDir -and (Test-Path $ShimBackupDir)) {
    foreach ($shim in @('npm.cmd', 'npx.cmd', 'npm', 'npx', 'npm.ps1', 'npx.ps1', 'npm.exe', 'npx.exe')) {
      $src = Join-Path $ShimBackupDir $shim
      if (-not (Test-Path $src)) { continue }
      Copy-Item $src (Join-Path $NodeDir $shim) -Force
    }
  }
}

function Assert-BundledNpmRuntime {
  param(
    [string]$NodeDir,
    [string]$NpmDirBackup,
    [string]$ShimBackupDir
  )

  if (Test-UsableBundledNpm -NodeDir $NodeDir) { return }

  Write-Host "  Restoring bundled npm runtime after openclaw install..."
  Restore-BundledNpmRuntime -NodeDir $NodeDir -NpmDirBackup $NpmDirBackup -ShimBackupDir $ShimBackupDir

  if (-not (Test-UsableBundledNpm -NodeDir $NodeDir)) {
    throw "Bundled npm runtime is missing after install for ${NodeDir}; expected npm.cmd/npx.cmd + node_modules\\npm\\bin\\{npm-cli.js,npx-cli.js,npm-prefix.js}"
  }
}

function Test-ReusableNodeRuntime {
  param(
    [string]$NodeDir,
    [string]$NodeVersionRequested
  )

  if ($ForceRefresh) { return $false }

  $nodeExe = Join-Path $NodeDir 'node.exe'
  if (-not (Test-Path $nodeExe)) { return $false }

  try {
    $installedNodeVersion = (& $nodeExe --version).Trim().TrimStart('v')
  } catch {
    return $false
  }
  if ($installedNodeVersion -ne $NodeVersionRequested) { return $false }

  if (-not (Test-UsableBundledNpm -NodeDir $NodeDir)) { return $false }

  return $true
}

# Determine which arches to build
if ($ArchOverride) {
  $BuildArches = @($ArchOverride)
} else {
  $BuildArches = @("x64")
}

Write-Host '=== Bundle Node.js + OpenClaw ==='
Write-Host "Node.js:  v$NodeVersion"
Write-Host "Mirror:   $NodeDistMirror"
if ($NpmRegistryMirror) {
  Write-Host "Registry: $NpmRegistryMirror"
} else {
  Write-Host "Registry: npm default"
}
if ($OpenclawVersionRequested -eq 'latest' -and $TargetOpenclawVersion -ne 'latest') {
  Write-Host "OpenClaw: latest (resolved to $TargetOpenclawVersion)"
} else {
  Write-Host "OpenClaw: $TargetOpenclawVersion"
}
Write-Host ('Arches:   ' + ($BuildArches -join ', '))
if ($ForceRefresh) {
  Write-Host 'Refresh:  forced'
}
Write-Host ''

$TempDir = Join-Path $env:TEMP ('openclaw-bundle-' + (Get-Random))
New-Item -ItemType Directory -Path $TempDir | Out-Null
$HostNpmCmd = $null
$HostNpmVersion = $null

try {
  foreach ($TargetArch in $BuildArches) {
    $NodeDir      = Join-Path $ProjectRoot "resources\node-$TargetArch"
    $NodeFilename = "node-v${NodeVersion}-win-${TargetArch}"
    $NodeUrl      = "${NodeDistMirror}/v${NodeVersion}/${NodeFilename}.zip"
    $ZipPath      = Join-Path $TempDir "node-${TargetArch}.zip"
    $ExtractDir   = Join-Path $TempDir "extract-${TargetArch}"

    Write-Host ('--- ' + $TargetArch + ' ---')
    if (Test-ReusableRuntime -NodeDir $NodeDir -NodeVersionRequested $NodeVersion -OpenclawVersionRequested $TargetOpenclawVersion) {
      Write-Host "Reusing existing runtime for $TargetArch (version unchanged)."
      $stats = Get-ChildItem $NodeDir -Recurse -File | Measure-Object -Property Length -Sum
      Write-Host ("  Files: {0:N0}" -f $stats.Count)
      Write-Host ("  Size:  {0:N0} MB" -f (($stats.Sum) / 1MB))
      Write-Host ''
      continue
    }

    if ($ForceRefresh -and (Test-Path $NodeDir)) {
      Write-Host "Force refresh enabled: removing existing runtime for $TargetArch"
      Remove-Item $NodeDir -Recurse -Force
    }

    if (Test-ReusableNodeRuntime -NodeDir $NodeDir -NodeVersionRequested $NodeVersion) {
      Write-Host "Reusing existing Node.js runtime for $TargetArch (v$NodeVersion)."
    } else {
      Write-Host "Downloading Node.js $NodeVersion for $TargetArch ..."
      Invoke-WebRequest -Uri $NodeUrl -OutFile $ZipPath -UseBasicParsing

      Write-Host 'Extracting...'
      New-Item -ItemType Directory -Path $ExtractDir | Out-Null
      Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force

      if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
      Copy-Item (Join-Path $ExtractDir $NodeFilename) $NodeDir -Recurse
    }

    $NodeExe = Join-Path $NodeDir 'node.exe'
    if (-not (Test-Path $NodeExe)) { throw "node.exe not found for $TargetArch" }

    # Detect host arch: x64 cannot execute arm64 binaries on Windows.
    $HostArch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
    $IsNativeArch = ($TargetArch -eq $HostArch)

    if ($IsNativeArch) {
      $nodeVer = & $NodeExe --version
      Write-Host "  Node.js: $nodeVer"
    } else {
      Write-Host "  Node.js: v$NodeVersion - cross-arch, not executed on this host"
    }

    # Install openclaw with arch-specific native binaries.
    Write-Host ''
    Write-Host "Installing openclaw@$InstallOpenclawSpec for arch=$TargetArch ..."

    if ($IsNativeArch) {
      $NpmCmd = Join-Path $NodeDir 'npm.cmd'
    } else {
      # Use the already-built native-arch node's npm as the executor.
      $NativeNodeDir = Join-Path $ProjectRoot "resources\node-$HostArch"
      $NpmCmd = Join-Path $NativeNodeDir 'npm.cmd'
      if (-not (Test-Path $NpmCmd)) {
        throw "Native npm not found at $NpmCmd - build $HostArch arch first"
      }
    }

    if (-not $HostNpmCmd) {
      $HostNpmCmd = Get-HostNpmCommand
    }
    if (-not $HostNpmVersion) {
      $HostNpmVersion = Get-HostNpmVersion -NpmCommand $HostNpmCmd
      Write-Host "  Host npm version detected: $HostNpmVersion"
    }
    $BundledNpmDependencySpec = "npm@$HostNpmVersion"
    $npmArgs = @('install', '--prefix', $NodeDir, '--no-audit', '--no-fund', '--save-exact', "openclaw@$InstallOpenclawSpec", $BundledNpmDependencySpec)
    if ($NpmRegistryMirror) {
      $npmArgs += @('--registry', $NpmRegistryMirror)
    }
    $bundledNpmDirBackup = $null
    $bundledNpmShimBackupDir = Join-Path $TempDir "npm-shims-$TargetArch"
    if (Test-Path $bundledNpmShimBackupDir) {
      Remove-Item $bundledNpmShimBackupDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $bundledNpmShimBackupDir | Out-Null
    foreach ($shim in @('npm.cmd', 'npx.cmd', 'npm', 'npx', 'npm.ps1', 'npx.ps1', 'npm.exe', 'npx.exe')) {
      $src = Join-Path $NodeDir $shim
      if (Test-Path $src) {
        Copy-Item $src (Join-Path $bundledNpmShimBackupDir $shim) -Force
      }
    }
    $bundledNpmDir = Join-Path $NodeDir 'node_modules\npm'
    if (Test-Path $bundledNpmDir) {
      $bundledNpmDirBackup = Join-Path $TempDir "npm-runtime-$TargetArch"
      if (Test-Path $bundledNpmDirBackup) {
        Remove-Item $bundledNpmDirBackup -Recurse -Force
      }
      Copy-Item $bundledNpmDir $bundledNpmDirBackup -Recurse
    }

    $env:npm_config_arch        = $TargetArch
    $env:npm_config_target_arch = $TargetArch
    & $NpmCmd @npmArgs
    Remove-Item Env:\npm_config_arch        -ErrorAction SilentlyContinue
    Remove-Item Env:\npm_config_target_arch -ErrorAction SilentlyContinue

    Assert-BundledNpmRuntime -NodeDir $NodeDir -NpmDirBackup $bundledNpmDirBackup -ShimBackupDir $bundledNpmShimBackupDir

    $OpenclawMjs = Join-Path $NodeDir 'node_modules\openclaw\openclaw.mjs'
    if (-not (Test-Path $OpenclawMjs)) {
      $PackageDir = Join-Path $NodeDir 'node_modules\openclaw'
      if (Test-Path $PackageDir) {
        Write-Host 'Package contents:'
        Get-ChildItem $PackageDir | Format-Table Name
      }
      throw "openclaw.mjs not found at: $OpenclawMjs"
    }
    try {
      $installedOpenclawVersion = (Get-Content (Join-Path $NodeDir 'node_modules\openclaw\package.json') -Raw | ConvertFrom-Json).version
    } catch {
      throw "Unable to read installed OpenClaw version from package.json"
    }
    if ($installedOpenclawVersion -ne $TargetOpenclawVersion) {
      throw "OpenClaw version mismatch for ${TargetArch}: requested $TargetOpenclawVersion, installed $installedOpenclawVersion"
    }
    Write-Host "  OpenClaw installed: v$installedOpenclawVersion"

    # Runtime dependency fallback installs can trigger npm reification of the prefix project.
    # Keep a hard guard so OpenClaw version cannot silently drift.
    try {
      $installedOpenclawVersionAfterFallback = (Get-Content (Join-Path $NodeDir 'node_modules\openclaw\package.json') -Raw | ConvertFrom-Json).version
    } catch {
      throw "Unable to read OpenClaw version after runtime dependency installation"
    }
    if ($installedOpenclawVersionAfterFallback -ne $TargetOpenclawVersion) {
      throw "OpenClaw drift detected after runtime deps install for ${TargetArch}: expected $TargetOpenclawVersion, got $installedOpenclawVersionAfterFallback"
    }

    # Slim down
    Write-Host "Slimming down $TargetArch bundle..."
    $NpmCache = Join-Path $NodeDir '.npm'
    if (Test-Path $NpmCache) { Remove-Item $NpmCache -Recurse -Force }
    Get-ChildItem $NodeDir -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object {
        $_.Name -like '*.d.ts' -or
        $_.Name -like '*.d.mts' -or
        $_.Name -like '*.d.cts' -or
        $_.Name -like '*.map'
      } |
      ForEach-Object {
        Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
      }

    $SizeMB = (Get-ChildItem $NodeDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host ('  Size: {0:N0} MB' -f $SizeMB)
    Write-Host ''
  }

  Write-Host '=== Done ==='
  Write-Host ''
  Write-Host 'Next: npm run build:win'

} finally {
  if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue }
}
