#!/usr/bin/env bash

# ============================================================
# Emerald Feedback Wall — Git Commit Script
# Usage: bash ~/commit.sh "Your commit message" [v1.5]
# ============================================================

set -e

# --- Config ---
REPO_DIR="/Users/chris.patten/Documents/02 Clients/FIS/Prototypes/fis_emerald_feedback_wall"

# --- Validate arguments ---
if [ -z "$1" ]; then
  echo ""
  echo "❌  ERROR: Commit message is required."
  echo "    Usage: bash ~/commit.sh \"Your commit message\" [optional-tag]"
  echo ""
  exit 1
fi

COMMIT_MESSAGE="$1"
TAG="$2"

# --- Navigate to repo ---
echo ""
echo "📁  Navigating to repo..."
echo "    $REPO_DIR"
cd "$REPO_DIR"

# --- Confirm current branch ---
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Warn if accidentally trying to commit directly to main
if [ "$BRANCH" = "main" ]; then
  echo ""
  echo "⚠️   WARNING: You are committing directly to main."
  echo -n "    Are you sure? (y/n): "
  read CONFIRM_MAIN
  if [ "$CONFIRM_MAIN" != "y" ] && [ "$CONFIRM_MAIN" != "Y" ]; then
    echo "    Aborting. Switch to dev first: git checkout dev"
    echo ""
    exit 1
  fi
fi

echo ""
echo "🌿  Current branch: $BRANCH"

# --- Check for anything to commit ---
if git diff --quiet && git diff --cached --quiet && [ -z "$(git status --porcelain)" ]; then
  echo ""
  echo "✅  Nothing to commit — working tree is clean."
  echo "    (If you intended to tag only, re-run with a tag argument.)"
  echo ""
  exit 0
fi

# --- Show what will be staged ---
echo ""
echo "📋  Files to be staged:"
git status --short

# --- Stage everything ---
echo ""
echo "➕  Staging all changes (git add .)..."
git add .

# --- Confirm staged files ---
echo ""
echo "✅  Staged files:"
git diff --cached --name-status

# --- Commit ---
echo ""
echo "💾  Committing with message: \"$COMMIT_MESSAGE\""
git commit -m "$COMMIT_MESSAGE"

# --- Handle tag ---
if [ -n "$TAG" ]; then
  echo ""
  if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "⚠️   Tag \"$TAG\" already exists."
    echo -n "    Overwrite it? (y/n): "
    read OVERWRITE
    if [ "$OVERWRITE" = "y" ] || [ "$OVERWRITE" = "Y" ]; then
      echo "    Deleting existing tag \"$TAG\" locally and on remote..."
      git tag -d "$TAG"
      git push origin ":refs/tags/$TAG" && echo "    Remote tag deleted." || echo "    (Remote tag not found or already removed.)"
      git tag -a "$TAG" -m "$COMMIT_MESSAGE"
      echo "✅  Tag \"$TAG\" recreated."
    else
      echo "    Skipping tag. Commit will proceed without tagging."
    fi
  else
    git tag -a "$TAG" -m "$COMMIT_MESSAGE"
    echo "🏷️   Tag \"$TAG\" created."
  fi
fi

# --- Push commit ---
echo ""
echo "🚀  Pushing commit to origin/$BRANCH..."
git push origin "$BRANCH"
echo "✅  Commit pushed."

# --- Push tag if set ---
if [ -n "$TAG" ]; then
  echo ""
  echo "🚀  Pushing tag \"$TAG\" to origin..."
  git push origin "$TAG"
  echo "✅  Tag pushed."
fi

# --- Done ---
echo ""
echo "============================================================"
echo "✅  Done."
echo "    Branch : $BRANCH"
echo "    Message: $COMMIT_MESSAGE"
if [ -n "$TAG" ]; then
  echo "    Tag    : $TAG"
fi
echo "============================================================"
echo ""