#!/usr/bin/env bash
# Verify shell binary accessibility
# This script checks that the shell binary exists and is executable on the system.

set -euo pipefail

echo "=== Shell Binary Accessibility Verification ==="
echo ""

# Get current shell
SHELL_PATH="${SHELL:-/bin/bash}"
echo "Current shell: $SHELL_PATH"

# Check if shell binary exists
if [ ! -e "$SHELL_PATH" ]; then
    echo "❌ FAIL: Shell binary does not exist: $SHELL_PATH"
    exit 1
fi
echo "✅ Shell binary exists: $SHELL_PATH"

# Resolve symlink if present
REAL_PATH=$(readlink -f "$SHELL_PATH")
echo "Real path: $REAL_PATH"

# Check if real binary exists
if [ ! -e "$REAL_PATH" ]; then
    echo "❌ FAIL: Real binary does not exist: $REAL_PATH"
    exit 1
fi
echo "✅ Real binary exists: $REAL_PATH"

# Check execute permissions
if [ ! -x "$REAL_PATH" ]; then
    echo "❌ FAIL: Binary lacks execute permissions: $REAL_PATH"
    ls -la "$REAL_PATH"
    exit 1
fi
echo "✅ Binary has execute permissions"

# Test invocation
if ! "$SHELL_PATH" --version > /dev/null 2>&1; then
    echo "❌ FAIL: Cannot invoke shell binary"
    exit 1
fi
echo "✅ Binary can be invoked successfully"

# Test basic execution
if ! "$SHELL_PATH" -c 'echo "test"' > /dev/null 2>&1; then
    echo "❌ FAIL: Cannot execute basic commands"
    exit 1
fi
echo "✅ Basic command execution works"

echo ""
echo "=== All shell binary accessibility checks passed ==="
