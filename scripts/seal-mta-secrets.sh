#!/usr/bin/env bash
#
# MTA My Way - Create and Seal Secrets Script
# ============================================
#
# This script creates and seals the MTA API and VAPID secrets for deployment
# to apexalgo-iad using Bitnami's SealedSecrets controller.
#
# Usage:
#   ./scripts/seal-mta-secrets.sh
#
# Prerequisites:
#   - kubectl configured with access to apexalgo-iad cluster
#   - kubeseal installed (available at ~/.local/bin/kubeseal)
#   - MTA API key from https://api.mta.info/
#   - VAPID keys (generate with: npx web-push generate-vapid-keys)
#
# The script will:
#   1. Prompt for MTA API key
#   2. Prompt for VAPID public/private keys (or generate them)
#   3. Create a temporary Kubernetes Secret manifest
#   4. Seal it using kubeseal against apexalgo-iad
#   5. Save the sealed secret to declarative-config
#   6. Clean up temporary files
#

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DECLARATIVE_CONFIG_DIR="$HOME/declarative-config"
OUTPUT_DIR="$DECLARATIVE_CONFIG_DIR/k8s/apexalgo-iad/mta-my-way"
SECRET_NAME="mta-my-way-secrets"
NAMESPACE="mta-my-way"
TMP_SECRET_FILE="/tmp/mta-my-way-secret-$$.yaml"
SEALED_SECRET_FILE="$OUTPUT_DIR/sealedsecret.yaml"

# Kubernetes API server for apexalgo-iad
K8S_SERVER="--server=http://traefik-apexalgo-iad:8001"

# Functions
print_error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

cleanup() {
    if [[ -f "$TMP_SECRET_FILE" ]]; then
        rm -f "$TMP_SECRET_FILE"
        print_info "Cleaned up temporary secret file"
    fi
}

trap cleanup EXIT

check_prerequisites() {
    print_info "Checking prerequisites..."

    # Check if kubectl can access apexalgo-iad
    if ! kubectl $K8S_SERVER get namespace "$NAMESPACE" &>/dev/null; then
        print_error "Cannot access namespace '$NAMESPACE' in apexalgo-iad cluster"
        print_info "Make sure kubectl proxy is available"
        exit 1
    fi
    print_success "kubectl access to apexalgo-iad confirmed"

    # Check if sealed-secrets controller is running
    if ! kubectl $K8S_SERVER get crd sealedsecrets.bitnami.com &>/dev/null; then
        print_error "SealedSecret CRD not found in apexalgo-iad cluster"
        exit 1
    fi
    print_success "SealedSecrets controller is available"

    # Check if kubeseal is installed
    if ! command -v kubeseal &>/dev/null; then
        print_error "kubeseal not found in PATH"
        exit 1
    fi
    print_success "kubeseal is available"

    # Check if declarative-config directory exists
    if [[ ! -d "$OUTPUT_DIR" ]]; then
        print_error "Output directory not found: $OUTPUT_DIR"
        exit 1
    fi
    print_success "declarative-config directory exists"
}

prompt_for_mta_api_key() {
    echo ""
    print_info "Enter your MTA GTFS-RT API key"
    print_info "Get your API key at: https://api.mta.info/"
    echo ""
    read -rp "MTA API Key: " MTA_API_KEY

    if [[ -z "$MTA_API_KEY" ]]; then
        print_error "MTA API Key cannot be empty"
        exit 1
    fi
}

prompt_for_vapid_keys() {
    echo ""
    print_info "VAPID keys are required for Web Push notifications"
    echo ""
    read -rp "Do you have VAPID keys already? (y/n): " HAS_VAPID

    if [[ "$HAS_VAPID" == "y" || "$HAS_VAPID" == "Y" ]]; then
        echo ""
        read -rp "VAPID Public Key: " VAPID_PUBLIC_KEY
        read -rp "VAPID Private Key: " VAPID_PRIVATE_KEY

        if [[ -z "$VAPID_PUBLIC_KEY" || -z "$VAPID_PRIVATE_KEY" ]]; then
            print_error "VAPID keys cannot be empty"
            exit 1
        fi
    else
        print_info "Generating VAPID keys using web-push..."
        if ! command -v npx &>/dev/null; then
            print_error "npx not found. Please install Node.js and npm first"
            exit 1
        fi

        # Generate VAPID keys
        VAPID_OUTPUT=$(npx web-push generate-vapid-keys 2>&1)
        VAPID_PUBLIC_KEY=$(echo "$VAPID_OUTPUT" | grep "public key:" | awk '{print $3}')
        VAPID_PRIVATE_KEY=$(echo "$VAPID_OUTPUT" | grep "private key:" | awk '{print $3}')

        if [[ -z "$VAPID_PUBLIC_KEY" || -z "$VAPID_PRIVATE_KEY" ]]; then
            print_error "Failed to generate VAPID keys"
            exit 1
        fi

        print_success "Generated VAPID keys:"
        echo "  Public:  $VAPID_PUBLIC_KEY"
        echo "  Private: $VAPID_PRIVATE_KEY"
        echo ""
        read -rp "Press Enter to continue..."
    fi
}

create_secret_manifest() {
    print_info "Creating Kubernetes Secret manifest..."

    cat > "$TMP_SECRET_FILE" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: $SECRET_NAME
  namespace: $NAMESPACE
  labels:
    app.kubernetes.io/name: mta-my-way
type: Opaque
stringData:
  mta-api-key: "$MTA_API_KEY"
  vapid-public-key: "$VAPID_PUBLIC_KEY"
  vapid-private-key: "$VAPID_PRIVATE_KEY"
EOF

    print_success "Secret manifest created"
}

seal_secret() {
    print_info "Sealing secret with kubeseal against apexalgo-iad..."

    # Get the sealed-secrets service certificate from the cluster
    # and use it to seal the secret
    kubeseal \
        --format=yaml \
        --controller-name=sealed-secrets \
        --controller-namespace=sealed-secrets \
        $K8S_SERVER \
        < "$TMP_SECRET_FILE" > "$SEALED_SECRET_FILE"

    print_success "Secret sealed successfully"
}

verify_sealed_secret() {
    print_info "Verifying sealed secret..."

    # Check if the sealed secret file was created
    if [[ ! -f "$SEALED_SECRET_FILE" ]]; then
        print_error "Failed to create sealed secret file"
        exit 1
    fi

    # Verify it's a valid SealedSecret
    if ! grep -q "kind: SealedSecret" "$SEALED_SECRET_FILE"; then
        print_error "Generated file is not a valid SealedSecret"
        exit 1
    fi

    # Check for encrypted data
    if ! grep -q "encryptedData:" "$SEALED_SECRET_FILE"; then
        print_error "Sealed secret missing encryptedData section"
        exit 1
    fi

    print_success "Sealed secret is valid"
}

commit_to_declarative_config() {
    print_info "Sealed secret saved to: $SEALED_SECRET_FILE"
    echo ""
    print_info "Next steps:"
    echo "  1. Review the sealed secret file:"
    echo "     cat $SEALED_SECRET_FILE"
    echo ""
    echo "  2. Commit and push to declarative-config:"
    echo "     cd $DECLARATIVE_CONFIG_DIR"
    echo "     git add k8s/apexalgo-iad/mta-my-way/sealedsecret.yaml"
    echo "     git commit -m 'feat: add sealed mta-my-way secrets'"
    echo "     git push"
    echo ""
    echo "  3. ArgoCD will automatically sync the sealed secret to apexalgo-iad"
    echo "  4. The sealed-secrets controller will decrypt it into a regular Secret"
    echo ""
    print_success "Done! The sealed secret is ready for deployment"
}

main() {
    echo "================================================"
    echo "  MTA My Way - Create and Seal Secrets"
    echo "  Target: apexalgo-iad cluster"
    echo "================================================"
    echo ""

    check_prerequisites
    prompt_for_mta_api_key
    prompt_for_vapid_keys
    create_secret_manifest
    seal_secret
    verify_sealed_secret
    commit_to_declarative_config
}

main "$@"
