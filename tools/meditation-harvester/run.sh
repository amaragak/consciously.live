#!/usr/bin/env bash
# Usage: ./run.sh all | search | download | transcribe | synthesise  [--types body-scan,sleep] [--force]
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then ./install.sh || exit 1; fi
export PATH="$PWD/.venv/bin:$PATH"
exec .venv/bin/python harvester.py "$@"
