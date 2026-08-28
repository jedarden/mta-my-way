#!/usr/bin/env bash
# Shell Environment Verification Script
# Verifies shell accessibility and initialization

set -euo pipefail

echo "=== Shell Environment Verification ==="
echo ""

# Check 1: Shell binary exists and is executable
echo "1. Checking shell binary..."
if SHELL_BINARY=$(which bash 2>/dev/null); then
    if [[ -x "$SHELL_BINARY" ]]; then
        echo "   ✓ Shell binary found and executable: $SHELL_BINARY"
        bash --version | head -n 1
    else
        echo "   ✗ Shell binary exists but is not executable"
        exit 1
    fi
else
    echo "   ✗ Shell binary not found"
    exit 1
fi
echo ""

# Check 2: Current shell process status
echo "2. Checking current shell process..."
if CURRENT_SHELL=$(ps -p $$ -o comm= 2>/dev/null); then
    echo "   ✓ Current shell process: $CURRENT_SHELL"
else
    echo "   ✗ Could not determine current shell process"
    exit 1
fi
echo ""

# Check 3: Environment variables
echo "3. Checking environment variables..."
REQUIRED_VARS=("SHELL" "PATH" "HOME" "USER" "PWD")
ALL_SET=true

for var in "${REQUIRED_VARS[@]}"; do
    if [[ -v "${var}" ]]; then
        echo "   ✓ $var is set"
    else
        echo "   ✗ $var is not set"
        ALL_SET=false
    fi
done

if [[ "$ALL_SET" == "true" ]]; then
    echo "   ✓ All required environment variables are set"
else
    echo "   ✗ Some required environment variables are missing"
    exit 1
fi
echo ""

echo "=== All checks passed ==="
exit 0
