#!/usr/bin/env bash
# One-time setup: Python 3.12 + all dependencies in a local .venv, plus your API key.
set -e
cd "$(dirname "$0")"

if ! command -v uv >/dev/null 2>&1 && [ ! -x "$HOME/.local/bin/uv" ]; then
  echo "Installing uv (Python manager)..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
UV="$(command -v uv || echo "$HOME/.local/bin/uv")"

echo "Creating .venv with Python 3.12..."
"$UV" venv --python 3.12 .venv --allow-existing
echo "Installing dependencies..."
"$UV" pip install --python .venv/bin/python -U -r requirements.txt

if ! grep -q '^ANTHROPIC_API_KEY=' .env 2>/dev/null; then
  read -r -p "Anthropic API key (sk-ant-..., leave blank to add later in .env): " KEY
  if [ -n "$KEY" ]; then echo "ANTHROPIC_API_KEY=$KEY" >> .env; fi
fi

chmod +x run.sh
echo
echo "Done. Run everything with:  ./run.sh all"
