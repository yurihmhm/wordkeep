#!/bin/sh
# Copies the pre-commit hook into .git/hooks (which git does not track).
ROOT=$(git rev-parse --show-toplevel) || exit 1
cp "$ROOT/tests/pre-commit" "$ROOT/.git/hooks/pre-commit"
chmod +x "$ROOT/.git/hooks/pre-commit"
echo "installed: .git/hooks/pre-commit"
