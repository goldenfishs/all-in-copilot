#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSIX_PATH="$ROOT_DIR/all-in-copilot-0.0.9.vsix"
CODE_BIN="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"

if [[ ! -x "$CODE_BIN" ]]; then
  echo "Cannot find VS Code CLI at: $CODE_BIN" >&2
  exit 1
fi

if [[ ! -f "$VSIX_PATH" ]]; then
  echo "Cannot find VSIX package: $VSIX_PATH" >&2
  echo "Run: npx vsce package --allow-missing-repository" >&2
  exit 1
fi

echo "Installing $VSIX_PATH"
"$CODE_BIN" --install-extension "$VSIX_PATH" --force
echo
echo "Installed. Restart VS Code, then open the All in Copilot sidebar."
