#!/usr/bin/env bash
# Run the same pandas setup as week5_pandas_demo.ipynb without pasting Python into zsh.
# Usage from repo root: bash "Week 5/run_notebook_setup.sh"
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_ACTIVATE="$REPO_ROOT/Week 4/.venv/bin/activate"
if [[ ! -f "$VENV_ACTIVATE" ]]; then
  echo "Missing Week 4 venv at Week 4/.venv" >&2
  echo "Create it: python3 -m venv \"Week 4/.venv\" && source \"Week 4/.venv/bin/activate\" && pip install -r \"Week 4/requirements.txt\"" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$VENV_ACTIVATE"
exec python3 -c 'import pandas as pd; import warnings; warnings.filterwarnings("ignore"); print("pandas version:", pd.__version__)'
