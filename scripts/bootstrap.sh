#!/usr/bin/env bash
set -euo pipefail

GHIDRA_VERSION="12.1.4"
GHIDRA_DIR="/opt/ghidra_12.1.4_PUBLIC"
GHIDRA_ZIP="ghidra_12.1.4_PUBLIC_20260921.zip"
GHIDRA_URL="https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/${GHIDRA_ZIP}"
GHIDRA_SHA256="ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db"

printf '\n==> Installing workspace packages\n'
npm install

printf '\n==> Installing REA native-analysis prerequisites\n'
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  openjdk-21-jdk-headless \
  ca-certificates \
  curl \
  unzip \
  jq \
  file \
  binutils
sudo rm -rf /var/lib/apt/lists/*

if [[ ! -x "${GHIDRA_DIR}/support/analyzeHeadless" ]]; then
  printf '\n==> Downloading Ghidra %s (about 570 MB)\n' "${GHIDRA_VERSION}"
  tmp_zip="/tmp/${GHIDRA_ZIP}"
  curl -fL --retry 4 --retry-delay 2 "${GHIDRA_URL}" -o "${tmp_zip}"
  echo "${GHIDRA_SHA256}  ${tmp_zip}" | sha256sum -c -
  sudo rm -rf "${GHIDRA_DIR}"
  sudo unzip -q "${tmp_zip}" -d /opt
  rm -f "${tmp_zip}"
else
  printf '\n==> Ghidra already installed\n'
fi

export GHIDRA_INSTALL_DIR="${GHIDRA_DIR}"
export JAVA_HOME="/usr/lib/jvm/java-21-openjdk-amd64"
export REA_ANALYSIS_PROVIDER="ghidra"

mkdir -p targets analysis-output

# Persist the provider environment in interactive terminals too.
ENV_BLOCK='\n# REA workstation\nexport GHIDRA_INSTALL_DIR=/opt/ghidra_12.1.4_PUBLIC\nexport JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64\nexport REA_ANALYSIS_PROVIDER=ghidra\n'
if ! grep -q 'REA workstation' "$HOME/.bashrc" 2>/dev/null; then
  printf "%b" "$ENV_BLOCK" >> "$HOME/.bashrc"
fi

printf '\n==> Registering REA with VS Code MCP\n'
./node_modules/.bin/rea setup --client vscode --yes --json || true

printf '\n==> REA / Ghidra readiness\n'
./node_modules/.bin/rea doctor --provider ghidra --json | tee analysis-output/doctor.json || true

printf '\n==> Bootstrap complete. The REA UI will run on port 3000.\n'
