#!/usr/bin/env bash
# Verify shell binary accessibility
# This script checks that the shell binary exists and is executable

set -euo pipefail

echo "=== Shell Binary Accessibility Check ==="

# 1. Identify current shell
SHELL_PATH="${SHELL:-/bin/bash}"
echo "Current shell: $SHELL_PATH"

# 2. Verify binary exists
if [[ -e "$SHELL_PATH" ]]; then
  echo "✓ Binary exists: $SHELL_PATH"
else
  echo "✗ Binary not found: $SHELL_PATH"
  exit 1
fi

# 3. Check execute permissions
if [[ -x "$SHELL_PATH" ]]; then
  echo "✓ Binary has execute permissions"
  ls -la "$SHELL_PATH"
else
  echo "✗ Binary lacks execute permissions"
  exit 1
fi

# 4. Test invocation
if "$SHELL_PATH" --version >/dev/null 2>&1; then
  echo "✓ Binary can be invoked successfully"
  "$SHELL_PATH" --version 2>&1 | head -1
else
  echo "✗ Binary cannot be invoked"
  exit 1
fi

echo ""
echo "=== All checks passed ==="
