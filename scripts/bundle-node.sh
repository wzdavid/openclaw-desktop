#!/usr/bin/env bash
# Bundle a self-contained Node.js runtime + openclaw into resources/node-ARCH/.
#
# On macOS: builds both x64 and arm64 bundles (resources/node-x64, resources/node-arm64).
# On Linux: builds for the current host architecture only.
#
# After running this script, the directory structure is:
#   resources/node-x64/
#     bin/node                                    ← Node.js x64 binary
#     node_modules/openclaw/openclaw.mjs          ← OpenClaw entry point (x64 native deps)
#   resources/node-arm64/
#     bin/node                                    ← Node.js arm64 binary
#     node_modules/openclaw/openclaw.mjs          ← OpenClaw entry point (arm64 native deps)
#
# Run before packaging:
#   npm run bundle:node
#
# Override versions:
#   NODE_VERSION=22.16.0 OPENCLAW_VERSION=latest npm run bundle:node
#
# Use mirrors:
#   NODE_DIST_MIRROR=https://npmmirror.com/mirrors/node NPM_REGISTRY_MIRROR=https://registry.npmmirror.com npm run bundle:node
#
# Build one arch only (local dev):
#   ARCH_OVERRIDE=arm64 npm run bundle:node
#
# Intel Mac (x64) users — arm64 binaries cannot run on x64 macOS; build x64 only:
#   ARCH_OVERRIDE=x64 npm run bundle:node

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HOST_NPM_CMD="npm"
PACKAGE_JSON_PATH="$PROJECT_ROOT/package.json"

print_latest_npm_debug_log_tail() {
  local log_file
  log_file="$(ls -t "${HOME}/.npm/_logs/"*-debug-0.log 2>/dev/null | head -n 1 || true)"
  if [ -z "$log_file" ]; then
    echo "No npm debug log found under ${HOME}/.npm/_logs"
    return 0
  fi
  echo "---- npm debug log (path: ${log_file}) ----"
  echo "---- npm debug key lines ----"
  grep -niE '(^[0-9]+\s+error)|ERR!|verbose stack|verbose code|E[A-Z]{2,}|unsupported engine|not found|permission|timed out|network' "$log_file" | tail -n 80 || true
  echo "---- npm debug head ----"
  sed -n '1,80p' "$log_file" || true
  echo "---- npm debug tail ----"
  tail -n 120 "$log_file" || true
  echo "---- end npm debug log ----"
}

run_npm_with_retry() {
  local label="$1"
  shift
  local attempt=1
  local max_attempts=3
  while [ "$attempt" -le "$max_attempts" ]; do
    if "$HOST_NPM_CMD" "$@"; then
      return 0
    fi
    echo "✗ ${label} failed (attempt ${attempt}/${max_attempts})"
    print_latest_npm_debug_log_tail
    if [ "$attempt" -lt "$max_attempts" ]; then
      local backoff=$((attempt * 2))
      echo "Retrying in ${backoff}s..."
      sleep "$backoff"
    fi
    attempt=$((attempt + 1))
  done
  return 1
}

read_bundle_default() {
  local key="$1"
  local fallback="$2"
  local value=""
  if command -v node >/dev/null 2>&1 && [ -f "$PACKAGE_JSON_PATH" ]; then
    value="$(node -e 'const fs=require("fs");const pkg=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const defaults=pkg.openclawDesktopBundleDefaults||{};const v=defaults[process.argv[2]];if(typeof v==="string"&&v.trim())process.stdout.write(v.trim());' "$PACKAGE_JSON_PATH" "$key" 2>/dev/null || true)"
  fi
  if [ -n "$value" ]; then
    echo "$value"
  else
    echo "$fallback"
  fi
}

DEFAULT_NODE_VERSION="$(read_bundle_default nodeVersion "22.16.0")"
DEFAULT_OPENCLAW_VERSION="$(read_bundle_default openclawVersion "latest")"

NODE_VERSION="${NODE_VERSION:-$DEFAULT_NODE_VERSION}"
OPENCLAW_VERSION="${OPENCLAW_VERSION:-$DEFAULT_OPENCLAW_VERSION}"
NODE_DIST_MIRROR="${NODE_DIST_MIRROR:-https://nodejs.org/dist}"
NPM_REGISTRY_MIRROR="${NPM_REGISTRY_MIRROR:-}"

# Normalize mirror URL by stripping trailing slash.
NODE_DIST_MIRROR="${NODE_DIST_MIRROR%/}"
NPM_REGISTRY_MIRROR="${NPM_REGISTRY_MIRROR%/}"

normalize_openclaw_version() {
  local raw="${1:-}"
  if [ -z "$raw" ]; then
    echo "latest"
    return
  fi
  if [ "$raw" = "latest" ]; then
    echo "latest"
    return
  fi
  # Accept both "2026.4.21" and "v2026.4.21"
  echo "${raw#v}"
}

REQUESTED_OPENCLAW_VERSION="$(normalize_openclaw_version "$OPENCLAW_VERSION")"
TARGET_OPENCLAW_VERSION="$REQUESTED_OPENCLAW_VERSION"
INSTALL_OPENCLAW_SPEC="$REQUESTED_OPENCLAW_VERSION"

resolve_latest_openclaw_version() {
  if ! command -v "$HOST_NPM_CMD" >/dev/null 2>&1; then
    return 1
  fi
  local resolved
  if [ -n "$NPM_REGISTRY_MIRROR" ]; then
    resolved="$("$HOST_NPM_CMD" view openclaw version --json --registry "$NPM_REGISTRY_MIRROR" 2>/dev/null | tr -d '"' | tr -d '\r\n' || true)"
  else
    resolved="$("$HOST_NPM_CMD" view openclaw version --json 2>/dev/null | tr -d '"' | tr -d '\r\n' || true)"
  fi
  [ -n "$resolved" ] || return 1
  echo "$resolved"
  return 0
}

if [ "$REQUESTED_OPENCLAW_VERSION" = "latest" ]; then
  if resolved_latest="$(resolve_latest_openclaw_version)"; then
    TARGET_OPENCLAW_VERSION="$resolved_latest"
    INSTALL_OPENCLAW_SPEC="$resolved_latest"
  else
    echo "⚠ Failed to resolve openclaw@latest. Falling back to npm tag at install time."
    TARGET_OPENCLAW_VERSION="latest"
    INSTALL_OPENCLAW_SPEC="latest"
  fi
fi

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Usage:
  npm run bundle:node
  FORCE_REFRESH=1 npm run bundle:node
  NODE_VERSION=22.16.0 OPENCLAW_VERSION=latest npm run bundle:node
  ARCH_OVERRIDE=arm64 npm run bundle:node

Environment variables:
  NODE_VERSION       Node.js version to bundle (default from package.json openclawDesktopBundleDefaults.nodeVersion)
  OPENCLAW_VERSION   OpenClaw version to install (default from package.json openclawDesktopBundleDefaults.openclawVersion)
  ARCH_OVERRIDE      Build only one arch (x64 or arm64)
  NODE_DIST_MIRROR   Node.js dist mirror base URL (default: https://nodejs.org/dist)
  NPM_REGISTRY_MIRROR npm registry URL for view/install (default: npm default)
  FORCE_REFRESH      Force rebuild runtime dirs (1/true/yes)

Reuse policy:
  - Reuse existing runtime by default when installed Node/OpenClaw satisfy requested versions.
  - OPENCLAW_VERSION=latest also reuses installed runtime when present.
  - Rebuild only when FORCE_REFRESH is set or requested pinned version differs.
EOF
  exit 0
fi

case "${FORCE_REFRESH:-}" in
  1|true|TRUE|yes|YES)
    FORCE_REFRESH=true
    ;;
  *)
    FORCE_REFRESH=false
    ;;
esac

should_reuse_runtime() {
  local node_dir="$1"
  local target_arch="$2"
  local node_bin="$node_dir/bin/node"
  local openclaw_pkg="$node_dir/node_modules/openclaw/package.json"
  local is_cross_arch=false

  [ "$FORCE_REFRESH" = "false" ] || return 1
  [ -f "$node_bin" ] || return 1
  [ -f "$openclaw_pkg" ] || return 1

  if [ "$HOST_ARCH" = "x64" ] && [ "$target_arch" = "arm64" ] && [ "$OS" = "darwin" ]; then
    is_cross_arch=true
  fi

  local installed_node_version
  if [ "$is_cross_arch" = "true" ]; then
    # Cannot execute arm64 node on x64 macOS host.
    installed_node_version="$NODE_VERSION"
  else
    installed_node_version="$("$node_bin" --version 2>/dev/null | sed 's/^v//')"
  fi
  [ -n "$installed_node_version" ] || return 1
  [ "$installed_node_version" = "$NODE_VERSION" ] || return 1

  local installed_openclaw_version
  if [ "$is_cross_arch" = "true" ]; then
    local helper_node_bin="$PROJECT_ROOT/resources/node-${HOST_ARCH}/bin/node"
    [ -f "$helper_node_bin" ] || return 1
    installed_openclaw_version="$("$helper_node_bin" -e "console.log(require(process.argv[1]).version)" "$openclaw_pkg" 2>/dev/null || true)"
  else
    installed_openclaw_version="$("$node_bin" -e "console.log(require(process.argv[1]).version)" "$openclaw_pkg" 2>/dev/null || true)"
  fi
  [ -n "$installed_openclaw_version" ] || return 1

  [ "$installed_openclaw_version" = "$TARGET_OPENCLAW_VERSION" ] || return 1

  echo "Reusing existing runtime for ${target_arch} (node v${installed_node_version}, openclaw v${installed_openclaw_version})"
  return 0
}

should_reuse_node_runtime() {
  local node_dir="$1"
  local target_arch="$2"
  local node_bin="$node_dir/bin/node"
  local is_cross_arch=false

  [ "$FORCE_REFRESH" = "false" ] || return 1
  [ -f "$node_bin" ] || return 1

  if [ "$HOST_ARCH" = "x64" ] && [ "$target_arch" = "arm64" ] && [ "$OS" = "darwin" ]; then
    is_cross_arch=true
  fi

  local installed_node_version
  if [ "$is_cross_arch" = "true" ]; then
    # Cannot execute arm64 node on x64 macOS host.
    installed_node_version="$NODE_VERSION"
  else
    installed_node_version="$("$node_bin" --version 2>/dev/null | sed 's/^v//')"
  fi
  [ -n "$installed_node_version" ] || return 1
  [ "$installed_node_version" = "$NODE_VERSION" ] || return 1
  has_usable_bundled_npm_runtime "$node_dir" || return 1
  return 0
}

has_usable_bundled_npm_runtime() {
  local node_dir="$1"
  [ -x "$node_dir/bin/npm" ] || return 1
  [ -f "$node_dir/lib/node_modules/npm/bin/npm-cli.js" ] || return 1
  [ -f "$node_dir/lib/node_modules/npm/bin/npm-prefix.js" ] || return 1
}

assert_bundled_npm_runtime() {
  local node_dir="$1"
  if has_usable_bundled_npm_runtime "$node_dir"; then
    return 0
  fi
  echo "✗ Bundled npm runtime is incomplete in $node_dir"
  echo "  Expected: bin/npm and lib/node_modules/npm/bin/{npm-cli.js,npm-prefix.js}"
  exit 1
}

get_missing_runtime_deps() {
  local node_dir="$1"
  local helper_node_bin="$2"
  "$helper_node_bin" "$PROJECT_ROOT/scripts/find-openclaw-missing-runtime-deps.mjs" --node-dir "$node_dir"
}

repair_feishu_protobufjs_runtime() {
  local node_dir="$1"
  local bundled_protobuf_dir="$node_dir/node_modules/openclaw/dist/extensions/feishu/node_modules/protobufjs"
  local root_protobuf_dir="$node_dir/node_modules/protobufjs"

  [ -d "$bundled_protobuf_dir" ] || return 0
  [ -f "$bundled_protobuf_dir/minimal.js" ] || return 0

  # Some OpenClaw package variants ship a trimmed feishu-local protobufjs copy where
  # minimal.js points to ./src/index-minimal but src/index-minimal.js is missing.
  if [ -f "$bundled_protobuf_dir/src/index-minimal.js" ]; then
    return 0
  fi

  if [ ! -d "$root_protobuf_dir" ] || [ ! -f "$root_protobuf_dir/src/index-minimal.js" ]; then
    echo "✗ Broken feishu protobufjs runtime detected but no healthy root protobufjs found."
    echo "  Missing: $bundled_protobuf_dir/src/index-minimal.js"
    echo "  Expected donor: $root_protobuf_dir"
    exit 1
  fi

  echo "Repairing feishu protobufjs runtime from root dependency copy..."
  rm -rf "$bundled_protobuf_dir"
  cp -a "$root_protobuf_dir" "$bundled_protobuf_dir"
}

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
HOST_ARCH=$(uname -m)
case "$HOST_ARCH" in
  arm64|aarch64) HOST_ARCH="arm64" ;;
  x86_64)        HOST_ARCH="x64"   ;;
  *) echo "✗ Unsupported architecture: $HOST_ARCH"; exit 1 ;;
esac

case "$OS" in
  darwin) NODE_OS="darwin" ;;
  linux)  NODE_OS="linux"  ;;
  *) echo "✗ Unsupported OS: $OS. Use bundle-node.ps1 for Windows."; exit 1 ;;
esac

# On macOS build both arches; on Linux build native arch only.
# ARCH_OVERRIDE lets local dev target a single arch.
# NOTE: On macOS, arm64 hosts (Apple Silicon) can run x64 via Rosetta 2, so both
# arches work fine. On x64 hosts (Intel Mac), arm64 binaries cannot execute —
# use ARCH_OVERRIDE=x64 to build only the native arch locally.
if [ -n "$ARCH_OVERRIDE" ]; then
  BUILD_ARCHES=("$ARCH_OVERRIDE")
elif [ "$OS" = "darwin" ]; then
  BUILD_ARCHES=("x64" "arm64")
else
  BUILD_ARCHES=("$HOST_ARCH")
fi

echo "=== Bundle Node.js + OpenClaw ==="
echo "Node.js:  v${NODE_VERSION}"
echo "Mirror:   ${NODE_DIST_MIRROR}"
if [ -n "$NPM_REGISTRY_MIRROR" ]; then
  echo "Registry: ${NPM_REGISTRY_MIRROR}"
else
  echo "Registry: npm default"
fi
if [ "$REQUESTED_OPENCLAW_VERSION" = "latest" ] && [ "$TARGET_OPENCLAW_VERSION" != "latest" ]; then
  echo "OpenClaw: latest (resolved to ${TARGET_OPENCLAW_VERSION})"
else
  echo "OpenClaw: ${TARGET_OPENCLAW_VERSION}"
fi
echo "OS:       ${NODE_OS}"
echo "Arches:   ${BUILD_ARCHES[*]}"
if [ "$FORCE_REFRESH" = "true" ]; then
  echo "Refresh:  forced"
fi
echo ""

if ! command -v "$HOST_NPM_CMD" >/dev/null 2>&1; then
  echo "✗ npm was not found in PATH. Run this script from an environment with npm installed."
  exit 1
fi
NPM_REGISTRY_ARGS=()
if [ -n "$NPM_REGISTRY_MIRROR" ]; then
  NPM_REGISTRY_ARGS=(--registry "$NPM_REGISTRY_MIRROR")
fi
HOST_NPM_VERSION="$("$HOST_NPM_CMD" --version 2>/dev/null || true)"
if [ -n "$HOST_NPM_VERSION" ]; then
  echo "Host npm: v${HOST_NPM_VERSION}"
fi

# ── Shared temp dir for Node.js tarballs ─────────────────────────────────────
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# ── Per-arch build loop ───────────────────────────────────────────────────────
for TARGET_ARCH in "${BUILD_ARCHES[@]}"; do
  NODE_DIR="$PROJECT_ROOT/resources/node-${TARGET_ARCH}"
  NODE_FILENAME="node-v${NODE_VERSION}-${NODE_OS}-${TARGET_ARCH}"
  NODE_URL="${NODE_DIST_MIRROR}/v${NODE_VERSION}/${NODE_FILENAME}.tar.gz"
  NODE_TAR="${TEMP_DIR}/node-${TARGET_ARCH}.tar.gz"

  echo "─── ${TARGET_ARCH} ────────────────────────────────────────────────────"
  if should_reuse_runtime "$NODE_DIR" "$TARGET_ARCH"; then
    echo ""
    continue
  fi
  if [ "$FORCE_REFRESH" = "true" ]; then
    echo "Force refresh enabled: removing existing runtime for ${TARGET_ARCH}"
    rm -rf "$NODE_DIR"
  fi
  if should_reuse_node_runtime "$NODE_DIR" "$TARGET_ARCH"; then
    echo "Reusing existing Node.js runtime for ${TARGET_ARCH} (v${NODE_VERSION})"
  else
    echo "Downloading Node.js ${NODE_VERSION} (${TARGET_ARCH})..."

    if command -v curl &>/dev/null; then
      curl -fsSL "${NODE_URL}" -o "${NODE_TAR}"
    elif command -v wget &>/dev/null; then
      wget -q "${NODE_URL}" -O "${NODE_TAR}"
    else
      echo "✗ curl or wget is required"; exit 1
    fi

    echo "Extracting..."
    EXTRACT_DIR="${TEMP_DIR}/extract-${TARGET_ARCH}"
    mkdir -p "${EXTRACT_DIR}"
    tar -xzf "${NODE_TAR}" -C "${EXTRACT_DIR}"

    # Copy to resources/node-ARCH/ (cp -a preserves symlinks for npm)
    rm -rf "$NODE_DIR"
    cp -a "${EXTRACT_DIR}/${NODE_FILENAME}/." "$NODE_DIR/"
  fi

  NODE_BIN="$NODE_DIR/bin/node"
  if [ ! -f "$NODE_BIN" ]; then
    echo "✗ node binary not found after extraction"
    exit 1
  fi

  # Remove macOS quarantine flag
  if command -v xattr &>/dev/null; then
    # Some macOS xattr builds do not support recursive (-r) mode.
    # Clear quarantine attrs per-file to keep behavior consistent.
    find "$NODE_DIR" -print0 2>/dev/null | xargs -0 -I{} xattr -d com.apple.quarantine "{}" 2>/dev/null || true
  fi

  # Check if this is a cross-arch scenario (x64 macOS host cannot run arm64 binaries).
  # arm64 macOS hosts CAN run x64 via Rosetta 2, so only x64→arm64 needs special handling.
  IS_CROSS_ARCH=false
  if [ "$HOST_ARCH" = "x64" ] && [ "$TARGET_ARCH" = "arm64" ] && [ "$OS" = "darwin" ]; then
    IS_CROSS_ARCH=true
  fi

  if [ "$IS_CROSS_ARCH" = "true" ]; then
    echo "✓ Node.js: v${NODE_VERSION} (cross-arch ${TARGET_ARCH}, not executed on ${HOST_ARCH} host)"
  else
    echo "✓ Node.js: $("$NODE_BIN" --version)"
  fi

  # ── Install openclaw with arch-specific native binaries ──────────────────
  echo ""
  echo "Installing openclaw@${INSTALL_OPENCLAW_SPEC} (arch=${TARGET_ARCH})..."
  # Use npm's supported --cpu switch with host npm to avoid mutating the bundled npm runtime.
  run_npm_with_retry "Install openclaw@${INSTALL_OPENCLAW_SPEC} (${TARGET_ARCH})" install \
    "--cpu=${TARGET_ARCH}" \
    --prefix "$NODE_DIR" \
    --no-audit \
    --no-fund \
    --fetch-retries=5 \
    --fetch-retry-mintimeout=10000 \
    --fetch-retry-maxtimeout=120000 \
    --fetch-timeout=300000 \
    --save-exact \
    "${NPM_REGISTRY_ARGS[@]}" \
    "openclaw@${INSTALL_OPENCLAW_SPEC}"
  assert_bundled_npm_runtime "$NODE_DIR"

  OPENCLAW_MJS="$NODE_DIR/node_modules/openclaw/openclaw.mjs"
  if [ ! -f "$OPENCLAW_MJS" ]; then
    echo "✗ openclaw.mjs not found. Package contents:"
    ls "$NODE_DIR/node_modules/openclaw/" 2>/dev/null || true
    exit 1
  fi

  # Read version from package.json without executing the target-arch node binary
  # (cross-arch binaries can't run on the host).
  if [ "$IS_CROSS_ARCH" = "true" ]; then
    NATIVE_NODE_BIN="$PROJECT_ROOT/resources/node-${HOST_ARCH}/bin/node"
    OPENCLAW_VER=$("$NATIVE_NODE_BIN" -e "console.log(require('$NODE_DIR/node_modules/openclaw/package.json').version)" 2>/dev/null || echo "installed")
  else
    OPENCLAW_VER=$("$NODE_BIN" -e "console.log(require('$NODE_DIR/node_modules/openclaw/package.json').version)" 2>/dev/null || echo "installed")
  fi
  if [ "$OPENCLAW_VER" != "$TARGET_OPENCLAW_VERSION" ]; then
    echo "✗ OpenClaw version mismatch for ${TARGET_ARCH}: requested ${TARGET_OPENCLAW_VERSION}, installed ${OPENCLAW_VER}"
    echo "  npm installed a different version than requested. Please check npm registry/proxy overrides."
    exit 1
  fi
  echo "✓ OpenClaw: v${OPENCLAW_VER}"

  HELPER_NODE_BIN="$NODE_BIN"
  if [ "$IS_CROSS_ARCH" = "true" ]; then
    HELPER_NODE_BIN="$PROJECT_ROOT/resources/node-${HOST_ARCH}/bin/node"
  fi

  FALLBACK_PACKAGES=()
  while IFS= read -r pkg; do
    [ -n "$pkg" ] && FALLBACK_PACKAGES+=("$pkg")
  done < <(get_missing_runtime_deps "$NODE_DIR" "$HELPER_NODE_BIN")

  if [ "${#FALLBACK_PACKAGES[@]}" -gt 0 ]; then
    echo "Installing missing runtime dependencies: ${FALLBACK_PACKAGES[*]}"
    FALLBACK_NPM_EXTRA_ARGS=()
    FALLBACK_REBUILD_SCRIPT_PACKAGES=()
    # Runtime fallback deps may pull build-time toolchain packages (e.g. esbuild via tsx/codex)
    # whose postinstall checks are fragile under prefix reification in CI.
    # Default to --ignore-scripts for stability; allow opt-in via:
    #   OPENCLAW_FALLBACK_INSTALL_SCRIPTS=1
    case "${OPENCLAW_FALLBACK_INSTALL_SCRIPTS:-}" in
      1|true|TRUE|yes|YES)
        echo "Fallback install scripts enabled via OPENCLAW_FALLBACK_INSTALL_SCRIPTS"
        ;;
      *)
        FALLBACK_NPM_EXTRA_ARGS+=(--ignore-scripts)
        echo "Fallback install: using --ignore-scripts to avoid CI postinstall/version drift"
        ;;
    esac
    # In cross-arch mode, scripts are especially error-prone; keep a clear log marker.
    if [ "$IS_CROSS_ARCH" = "true" ]; then
      echo "Cross-arch fallback install detected (${HOST_ARCH} -> ${TARGET_ARCH})"
    fi
    run_npm_with_retry "Install fallback runtime deps (${TARGET_ARCH})" install \
      "--cpu=${TARGET_ARCH}" \
      --prefix "$NODE_DIR" \
      --no-audit \
      --no-fund \
      --fetch-retries=5 \
      --fetch-retry-mintimeout=10000 \
      --fetch-retry-maxtimeout=120000 \
      --fetch-timeout=300000 \
      --no-save \
      --package-lock=false \
      "${FALLBACK_NPM_EXTRA_ARGS[@]}" \
      "${NPM_REGISTRY_ARGS[@]}" \
      "${FALLBACK_PACKAGES[@]}"
    assert_bundled_npm_runtime "$NODE_DIR"

    # Keep CI stable by default, then selectively rebuild runtime packages that
    # actually declare install/postinstall scripts. Skip known toolchain packages
    # that are frequent CI drift sources and not runtime-critical in this bundle.
    for pkg in "${FALLBACK_PACKAGES[@]}"; do
      case "$pkg" in
        esbuild|@esbuild/*|tsx|@openai/codex|acpx|@zed-industries/codex-acp)
          continue
          ;;
      esac
      pkg_json="$NODE_DIR/node_modules/$pkg/package.json"
      if [ ! -f "$pkg_json" ]; then
        continue
      fi
      if "$HELPER_NODE_BIN" -e 'const p=require(process.argv[1]);const s=p.scripts||{};process.exit((s.install||s.postinstall)?0:1)' "$pkg_json" >/dev/null 2>&1; then
        FALLBACK_REBUILD_SCRIPT_PACKAGES+=("$pkg")
      fi
    done

    if [ "${#FALLBACK_REBUILD_SCRIPT_PACKAGES[@]}" -gt 0 ]; then
      echo "Rebuilding runtime deps with scripts: ${FALLBACK_REBUILD_SCRIPT_PACKAGES[*]}"
      npm_config_arch="$TARGET_ARCH" npm_config_target_arch="$TARGET_ARCH" \
        "$HOST_NPM_CMD" rebuild \
        --prefix "$NODE_DIR" \
        --no-audit \
        --no-fund \
        "${NPM_REGISTRY_ARGS[@]}" \
        "${FALLBACK_REBUILD_SCRIPT_PACKAGES[@]}"
      assert_bundled_npm_runtime "$NODE_DIR"
    fi
  fi

  repair_feishu_protobufjs_runtime "$NODE_DIR"

  # Fallback runtime dependency install can trigger npm reification of the prefix project.
  # Guard against accidental OpenClaw drift (e.g. ^range auto-upgrade).
  OPENCLAW_VER_AFTER_FALLBACK=$("$HELPER_NODE_BIN" -e "console.log(require(process.argv[1]).version)" "$NODE_DIR/node_modules/openclaw/package.json" 2>/dev/null || echo "installed")
  if [ "$OPENCLAW_VER_AFTER_FALLBACK" != "$TARGET_OPENCLAW_VERSION" ]; then
    echo "✗ OpenClaw drift detected after runtime deps install for ${TARGET_ARCH}: expected ${TARGET_OPENCLAW_VERSION}, got ${OPENCLAW_VER_AFTER_FALLBACK}"
    echo "  Aborting to avoid silently bundling the wrong version."
    exit 1
  fi

  # ── Slim down ──────────────────────────────────────────────────────────────
  echo "Slimming down ${TARGET_ARCH} bundle..."
  rm -rf "$NODE_DIR/.npm" 2>/dev/null || true
  rm -rf "$NODE_DIR/include" "$NODE_DIR/share" 2>/dev/null || true
  rm -f "$NODE_DIR/CHANGELOG.md" "$NODE_DIR/README.md" 2>/dev/null || true
  rm -rf "$NODE_DIR/lib/node_modules/npm/docs" 2>/dev/null || true
  rm -rf "$NODE_DIR/lib/node_modules/npm/man" 2>/dev/null || true
  find "$NODE_DIR/node_modules" -type d \( -name "test" -o -name "tests" -o -name "__tests__" \) \
    -not -path "*/openclaw/*" -exec rm -rf {} + 2>/dev/null || true
  find "$NODE_DIR" -type f \( \
    -iname "*.md" -o -iname "LICENSE*" -o -iname "LICENCE*" \
    -o -iname "CHANGELOG*" -o -iname "CHANGES*" -o -iname "HISTORY*" \
    -o -iname "AUTHORS*" -o -iname ".npmignore" -o -iname ".eslintrc*" \
    -o -iname ".travis.yml" -o -iname "Makefile" \
    \) \
    -not -name "*.js" -not -name "*.mjs" -not -name "*.cjs" \
    -not -path "*/node_modules/openclaw/*" -delete 2>/dev/null || true
  # Trim type declarations and source maps recursively to reduce macOS signing file fanout.
  find "$NODE_DIR" -type f \( \
    -name "*.d.ts" -o -name "*.d.mts" -o -name "*.d.cts" \
    -o -name "*.map" \
    \) -delete 2>/dev/null || true

  FINAL_SIZE=$(du -sh "$NODE_DIR" | cut -f1)
  echo "✓ Size: ${FINAL_SIZE}"
  echo ""
done

echo "=== Done ==="
echo ""
echo "Next steps:"
echo "  npm run dev         ← start development server"
echo "  npm run build:mac   ← build macOS installer"
