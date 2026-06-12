#!/bin/bash
# MathMate Setup Script
# Initializes the ~/.mathmate configuration directory

set -e

MATHMATE_CONFIG_DIR="$HOME/.mathmate"

echo "Setting up MathMate configuration..."

# Create config directory if it doesn't exist
mkdir -p "$MATHMATE_CONFIG_DIR"

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Copy templates if config files don't exist
if [ ! -f "$MATHMATE_CONFIG_DIR/models.json" ]; then
    echo "Creating models.json from template..."
    cp "$PROJECT_ROOT/config/models.json.template" "$MATHMATE_CONFIG_DIR/models.json"
    echo "✅  models.json created (no API keys stored — reads from env vars)"
fi

if [ ! -f "$MATHMATE_CONFIG_DIR/config.json" ]; then
    echo "Creating config.json from template..."
    cp "$PROJECT_ROOT/config/config.json.template" "$MATHMATE_CONFIG_DIR/config.json"
fi

echo ""
echo "✅ MathMate setup complete!"
echo ""
echo "Configuration directory: $MATHMATE_CONFIG_DIR"
echo ""
echo "Next steps:"
echo "  1. Set your API keys as environment variables:"
echo "       export ANTHROPIC_API_KEY=sk-..."
echo "       export OPENAI_API_KEY=sk-..."
echo "       export OPENROUTER_API_KEY=sk-..."
echo "     (Add these to your ~/.zshrc or ~/.bashrc to persist)"
echo "  2. Configure your Obsidian vault paths in ~/.mathmate/config.json"
echo "  3. Launch MathMate from the prototype directory:"
echo "       cd prototype/MathMate && swift run"
