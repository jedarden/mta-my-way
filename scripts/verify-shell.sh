#!/usr/bin/env bash
# Verify shell environment accessibility
# This script checks that the shell binary exists, the process is running,
# and environment variables are properly set.

set -euo pipefail

echo "=== Shell Accessibility Check ==="
echo

# 1. Check shell binary
echo "1. Shell binary:"
SHELL_BIN="$(which bash 2>/dev/null)" || { echo "❌ bash not found"; exit 1; }
if [[ -x "$SHELL_BIN" ]]; then
    echo "✅ bash found and executable: $SHELL_BIN"
    ls -l "$SHELL_BIN"
else
    echo "❌ bash not executable: $SHELL_BIN"
    exit 1
fi
echo

# 2. Check shell process
echo "2. Shell process status:"
if ps -p $$ > /dev/null 2>&1; then
    echo "✅ Current shell process running:"
    ps -p $$ -o pid,ppid,comm
else
    echo "❌ Shell process not found"
    exit 1
fi
echo

# 3. Check environment variables
echo "3. Environment variables:"
REQUIRED_VARS=("SHELL" "PATH" "HOME" "USER")
ALL_SET=true
for var in "${REQUIRED_VARS[@]}"; do
    if [[ -v "$var" ]]; then
        echo "✅ $var=${!var}"
    else
        echo "❌ $var not set"
        ALL_SET=false
    fi
done
echo

if [[ "$ALL_SET" == "true" ]]; then
    echo "=== All checks passed ==="
    exit 0
else
    echo "=== Some checks failed ==="
    exit 1
fi
