#!/usr/bin/env bash
# OpenClaw Desktop Build Script (macOS / Linux)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; }

echo "=========================================="
echo "OpenClaw Desktop Build Script"
echo "=========================================="
echo ""

# ── Prerequisites ──────────────────────────────────────────────────────────────
command -v node &>/dev/null || { err "Node.js is not installed."; exit 1; }
ok "Node.js: $(node --version)"

command -v npm &>/dev/null || { err "npm is not installed."; exit 1; }
ok "npm: $(npm --version)"
echo ""

# ── Options ────────────────────────────────────────────────────────────────────
BUILD_TARGET="auto"
SKIP_INSTALL=false
SKIP_BUNDLE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --mac)          BUILD_TARGET="mac";   shift ;;
    --linux)        BUILD_TARGET="linux"; shift ;;
    --skip-install) SKIP_INSTALL=true;    shift ;;
    --skip-bundle)  SKIP_BUNDLE=true;     shift ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo "  --mac           Build for macOS only"
      echo "  --linux         Build for Linux only"
      echo "  --skip-install  Skip npm install"
      echo "  --skip-bundle   Skip bundle:node (use existing resources/node-ARCH/)"
      exit 0 ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

# Resolve build target early so bundle checks can be target-aware.
if [ "$BUILD_TARGET" = "auto" ]; then
  [[ "$OSTYPE" == darwin* ]] && BUILD_TARGET="mac" || BUILD_TARGET="linux"
fi

# ── npm install ─────────────────────────────────────────────────────────────────
if [ "$SKIP_INSTALL" = false ]; then
  warn "Installing dependencies..."
  npm install
  ok "Dependencies installed"
  echo ""
fi

# ── Bundle Node.js + openclaw ───────────────────────────────────────────────────
if [ "$SKIP_BUNDLE" = false ]; then
  if [ "$BUILD_TARGET" = "mac" ]; then
    REQUIRED_BUNDLES=(
      "resources/node-x64/node_modules/openclaw/openclaw.mjs"
      "resources/node-arm64/node_modules/openclaw/openclaw.mjs"
    )
  else
    HOST_ARCH=$(uname -m)
    case "$HOST_ARCH" in
      arm64|aarch64) HOST_ARCH="arm64" ;;
      x86_64)        HOST_ARCH="x64" ;;
      *) err "Unsupported architecture: $HOST_ARCH"; exit 1 ;;
    esac
    REQUIRED_BUNDLES=("resources/node-${HOST_ARCH}/node_modules/openclaw/openclaw.mjs")
  fi

  MISSING_BUNDLE=false
  for bundle in "${REQUIRED_BUNDLES[@]}"; do
    if [ ! -f "$bundle" ]; then
      MISSING_BUNDLE=true
      break
    fi
  done

  if [ "$MISSING_BUNDLE" = true ]; then
    warn "Bundling Node.js + openclaw..."
    bash scripts/bundle-node.sh
    ok "Bundle complete"
  else
    ok "Required runtime bundles already exist (use --skip-bundle to reuse)"
  fi
  echo ""
fi

# ── TypeScript compile ─────────────────────────────────────────────────────────
warn "Compiling TypeScript..."
rm -rf dist/electron dist/installers
npm run build:electron
ok "TypeScript compiled"
echo ""

case $BUILD_TARGET in
  mac)
    warn "Building for macOS..."
    npm run build:mac
    ok "macOS build complete" ;;
  linux)
    warn "Building for Linux..."
    npm run build:linux
    ok "Linux build complete" ;;
esac

echo ""
echo "=========================================="
ok "Build completed!"
echo "=========================================="
echo ""
echo "Output: dist/installers/"
echo ""
echo "For Windows: run scripts/build.ps1 on a Windows machine (or via GitHub Actions)"
