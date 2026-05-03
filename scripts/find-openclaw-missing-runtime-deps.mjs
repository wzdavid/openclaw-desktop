import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
let nodeDir = "";
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--node-dir") {
    nodeDir = args[i + 1] ?? "";
    i += 1;
  }
}

if (!nodeDir) {
  console.error("Missing required argument: --node-dir <path>");
  process.exit(1);
}

nodeDir = path.resolve(nodeDir);

const openclawPkgPath = path.join(nodeDir, "node_modules", "openclaw", "package.json");
const openclawDistDir = path.join(nodeDir, "node_modules", "openclaw", "dist");
if (!fs.existsSync(openclawPkgPath) || !fs.existsSync(openclawDistDir)) {
  process.exit(0);
}

const missing = new Set();

function packageDirCandidates(packageName) {
  const parts = packageName.split("/");
  return [
    path.join(nodeDir, "node_modules", ...parts),
    path.join(nodeDir, "node_modules", "openclaw", "node_modules", ...parts),
  ];
}

function hasValidPackageEntry(candidateDir) {
  const pkgJsonPath = path.join(candidateDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    const mainEntry = typeof pkg?.main === "string" ? pkg.main.trim() : "";
    if (!mainEntry) {
      // No explicit main → directory exists is good enough for our fallback scanner.
      return true;
    }
    const resolvedMain = path.resolve(candidateDir, mainEntry);
    const normalizedBase = `${path.resolve(candidateDir)}${path.sep}`;
    if (!(resolvedMain === path.resolve(candidateDir) || resolvedMain.startsWith(normalizedBase))) {
      return false;
    }
    return fs.existsSync(resolvedMain);
  } catch {
    return false;
  }
}

function isPresentInBundle(packageName) {
  return packageDirCandidates(packageName).some((candidate) => hasValidPackageEntry(candidate));
}

function addIfMissing(name, version) {
  if (!name || !version || isPresentInBundle(name)) {
    return;
  }
  missing.add(`${name}@${version}`);
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") {
        continue;
      }
      walk(fullPath);
      continue;
    }
    if (!entry.isFile() || entry.name !== "package.json") {
      continue;
    }

    const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    if (parsed?.openclaw?.bundle?.stageRuntimeDependencies !== true) {
      continue;
    }

    for (const [name, version] of Object.entries(parsed.dependencies ?? {})) {
      addIfMissing(name, version);
    }
  }
}

walk(path.join(openclawDistDir, "extensions"));

for (const result of [...missing].sort((a, b) => a.localeCompare(b))) {
  process.stdout.write(`${result}\n`);
}
