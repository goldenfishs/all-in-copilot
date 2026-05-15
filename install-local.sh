#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_NAME="$(node -p "require('$ROOT_DIR/package.json').name")"
PACKAGE_VERSION="$(node -p "require('$ROOT_DIR/package.json').version")"
PACKAGE_PUBLISHER="$(node -p "require('$ROOT_DIR/package.json').publisher")"
EXTENSION_ID="$PACKAGE_PUBLISHER.$PACKAGE_NAME"
VSIX_PATH="$ROOT_DIR/$PACKAGE_NAME-$PACKAGE_VERSION.vsix"
MACOS_CODE_BIN="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"

if [[ -x "$MACOS_CODE_BIN" ]]; then
  CODE_BIN="$MACOS_CODE_BIN"
elif command -v code >/dev/null 2>&1; then
  CODE_BIN="$(command -v code)"
else
  echo "Cannot find VS Code CLI. Install the 'code' command or check: $MACOS_CODE_BIN" >&2
  exit 1
fi

cd "$ROOT_DIR"

echo "Packaging $PACKAGE_NAME@$PACKAGE_VERSION..."
npm run check
npm run package

echo
if [[ "${CLEAN_INSTALL:-0}" == "1" ]]; then
  echo "Uninstalling existing $EXTENSION_ID..."
  "$CODE_BIN" --uninstall-extension "$EXTENSION_ID" || true
  echo "If VS Code asks for a restart before reinstalling, reload VS Code and run this script again."
  echo
fi

echo "Installing $VSIX_PATH..."
"$CODE_BIN" --install-extension "$VSIX_PATH" --force
echo
echo "Installed $EXTENSION_ID@$PACKAGE_VERSION."
echo "Restart VS Code or run 'Developer: Reload Window', then open the All in Copilot sidebar."
