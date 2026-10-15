#!/usr/bin/env bash
# Deploy Firestore security rules. Usage: scripts/deploy_rules.sh [project-id]
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="${1:-ipo-tracker-arpit}"
command -v firebase >/dev/null || npm i -g firebase-tools
firebase login --no-localhost        # one-time; skip if already logged in
firebase deploy --only firestore:rules --project "$PROJECT"
