#!/usr/bin/env bash

# ============================================================
# Emerald Feedback Wall — Merge Current Branch to Main
# Usage: bash ~/merge_emerald.sh "Merge message" [v2.0]
# Example: bash ~/merge_emerald.sh "Prompts 5-7 complete" v3.1
# ============================================================

set -e

REPO_DIR="/Users/chris.patten/Documents/02 Clients/FIS/Prototypes/fis_emerald_feedback_wall"

# --- Validate arguments ---
if [ -z "$1" ]; then
  echo ""
  echo "❌  ERROR: Merge message is required."
  echo "    Usage: bash ~/merge_emerald.sh \"Merge message\" [optional-tag]"
  echo "    Example: bash ~/merge_emerald.sh \"Prompts 5-7 complete\" v3.1"
  echo ""
  exit 1
fi

MERGE_MESSAGE="$1"
TAG="$2"

# --- Navigate to repo ---
echo ""
echo "📁  Navigating to repo..."
echo "    $REPO_DIR"
cd "$REPO_DIR"

# --- Capture current branch ---
SOURCE_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# --- Refuse to merge if already on main ---
if [ "$SOURCE_BRANCH" = "main" ]; then
  echo ""
  echo "❌  ERROR: You are already on main. Switch to the branch you want to merge first."
  echo "    Example: git checkout dev"
  echo ""
  exit 1
fi

echo ""
echo "🌿  Merging \"$SOURCE_BRANCH\" → main"
echo "    Message: $MERGE_MESSAGE"

# --- Check for uncommitted changes ---
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git status --porcelain)" ]; then
  echo ""
  echo "⚠️   WARNING: You have uncommitted changes on $SOURCE_BRANCH."
  echo "    Commit these before merging."
  git status --short
  echo ""
  exit 1
fi

# --- Show what will be merged ---
echo ""
echo "📋  Commits in \"$SOURCE_BRANCH\" not yet in main:"
git log main.."$SOURCE_BRANCH" --oneline
echo ""
echo -n "    Proceed with merge? (y/n): "
read CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
  echo "    Aborting."
  echo ""
  exit 1
fi

# --- Switch to main and pull latest ---
echo ""
echo "🔄  Switching to main and pulling latest..."
git checkout main
git pull origin main
echo "✅  main is up to date."

# --- Merge ---
echo ""
echo "🔀  Merging \"$SOURCE_BRANCH\" into main..."
git merge "$SOURCE_BRANCH" --no-ff -m "$MERGE_MESSAGE"
echo "✅  Merge complete."

# --- Handle tag ---
if [ -n "$TAG" ]; then
  echo ""
  if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "⚠️   Tag \"$TAG\" already exists."
    echo -n "    Overwrite it? (y/n): "
    read OVERWRITE
    if [ "$OVERWRITE" = "y" ] || [ "$OVERWRITE" = "Y" ]; then
      git tag -d "$TAG"
      git push origin ":refs/tags/$TAG" && echo "    Remote tag deleted." || echo "    (Remote tag not found.)"
      git tag -a "$TAG" -m "$MERGE_MESSAGE"
      echo "✅  Tag \"$TAG\" recreated."
    else
      echo "    Skipping tag."
    fi
  else
    git tag -a "$TAG" -m "$MERGE_MESSAGE"
    echo "🏷️   Tag \"$TAG\" created."
  fi
fi

# --- Push main ---
echo ""
echo "🚀  Pushing main to origin..."
git push origin main
echo "✅  main pushed."

# --- Push tag if set ---
if [ -n "$TAG" ]; then
  echo ""
  echo "🚀  Pushing tag \"$TAG\" to origin..."
  git push origin "$TAG"
  echo "✅  Tag pushed."
fi

# --- Switch back to source branch ---
echo ""
echo "🔄  Switching back to \"$SOURCE_BRANCH\"..."
git checkout "$SOURCE_BRANCH"

# --- Done ---
echo ""
echo "============================================================"
echo "✅  Done."
echo "    Merged  : $SOURCE_BRANCH → main"
echo "    Message : $MERGE_MESSAGE"
if [ -n "$TAG" ]; then
  echo "    Tag     : $TAG"
fi
echo "    Current : $SOURCE_BRANCH (returned after merge)"
echo "============================================================"
echo ""