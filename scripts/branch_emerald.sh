#!/usr/bin/env bash

# ============================================================
# Emerald Feedback Wall — Create Branch from Main
# Usage: bash ~/branch_emerald.sh <branch-name> ["optional description"]
# Example: bash ~/branch_emerald.sh feature/prompt-8 "Theme snapshots implementation"
# ============================================================

set -e

REPO_DIR="/Users/chris.patten/Documents/02 Clients/FIS/Prototypes/fis_emerald_feedback_wall"

# --- Validate arguments ---
if [ -z "$1" ]; then
  echo ""
  echo "❌  ERROR: Branch name is required."
  echo "    Usage: bash ~/branch_emerald.sh <branch-name> [\"description\"]"
  echo "    Example: bash ~/branch_emerald.sh feature/prompt-8 \"Theme snapshots\""
  echo ""
  exit 1
fi

BRANCH_NAME="$1"
DESCRIPTION="${2:-No description provided}"

# --- Navigate to repo ---
echo ""
echo "📁  Navigating to repo..."
echo "    $REPO_DIR"
cd "$REPO_DIR"

# --- Check for uncommitted changes ---
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git status --porcelain)" ]; then
  echo ""
  echo "⚠️   WARNING: You have uncommitted changes."
  echo "    These will carry over to the new branch."
  git status --short
  echo ""
  echo -n "    Continue anyway? (y/n): "
  read CONFIRM
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "    Aborting. Commit or stash your changes first."
    echo ""
    exit 1
  fi
fi

# --- Switch to main and pull latest ---
echo ""
echo "🔄  Switching to main and pulling latest..."
git checkout main
git pull origin main
echo "✅  main is up to date."

# --- Check if branch already exists ---
if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
  echo ""
  echo "⚠️   Branch \"$BRANCH_NAME\" already exists locally."
  echo -n "    Switch to it instead of creating a new one? (y/n): "
  read USE_EXISTING
  if [ "$USE_EXISTING" = "y" ] || [ "$USE_EXISTING" = "Y" ]; then
    git checkout "$BRANCH_NAME"
    echo "✅  Switched to existing branch \"$BRANCH_NAME\"."
  else
    echo "    Aborting. Choose a different branch name."
    echo ""
    exit 1
  fi
else
  # --- Create and switch to new branch ---
  echo ""
  echo "🌿  Creating branch \"$BRANCH_NAME\"..."
  echo "    Description: $DESCRIPTION"
  git checkout -b "$BRANCH_NAME"
  echo "✅  Branch \"$BRANCH_NAME\" created."

  # --- Push branch to remote ---
  echo ""
  echo "🚀  Pushing new branch to origin..."
  git push -u origin "$BRANCH_NAME"
  echo "✅  Branch pushed to origin."
fi

# --- Done ---
echo ""
echo "============================================================"
echo "✅  Done."
echo "    Branch     : $BRANCH_NAME"
echo "    Description: $DESCRIPTION"
echo "    Based on   : main (latest)"
echo "============================================================"
echo ""