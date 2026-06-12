#!/usr/bin/env python3
"""
Generate a comprehensive models.json config from OpenRouter's API.
Usage: ./generate_models.py
"""

import json
import urllib.request
from pathlib import Path


def fetch_openrouter_models():
    """Fetch all models from OpenRouter API."""
    url = "https://openrouter.ai/api/v1/models"
    with urllib.request.urlopen(url) as response:
        return json.loads(response.read().decode())


def group_models_by_provider(data):
    """Group models by provider name."""
    providers = {}
    for model in data['data']:
        provider = model['id'].split('/')[0]
        if provider not in providers:
            providers[provider] = []
        providers[provider].append(model['id'])
    
    # Sort models within each provider
    for p in providers:
        providers[p].sort()
    
    return providers


def select_chat_models(models):
    """Select models suitable for chat/math tutoring."""
    model_ids = [m if isinstance(m, str) else m['id'] for m in models]
    
    # Include models with common chat/instruct keywords
    include_keywords = ['chat', 'instruct', 'pi', 'gemini', 'qwen', 'mistral', 'llama', 'deepseek', 'command', 'mixtral']
    
    # Include models that match any include keyword
    included = []
    for m in model_ids:
        if any(kw in m.lower() for kw in include_keywords):
            included.append(m)
    
    # Prefer non-free models with better capabilities
    non_free = [m for m in included if ':free' not in m.lower()]
    free = [m for m in included if ':free' in m.lower()]
    
    # Return top 50 non-free models, or all if fewer
    return non_free[:50] if len(non_free) >= 50 else non_free + free[:50 - len(non_free)]


def generate_config():
    """Generate the models.json configuration."""
    print("Fetching models from OpenRouter API...")
    data = fetch_openrouter_models()
    print(f"Fetched {len(data['data'])} models")
    
    providers = group_models_by_provider(data)
    
    config = {"providers": []}
    
    # OpenRouter provider - main provider with all compatible models
    openrouter_models = select_chat_models(data['data'])
    config["providers"].append({
        "name": "OpenRouter",
        "enabled": True,
        "baseURL": "https://openrouter.ai/api/v1",
        "envKey": "OPENROUTER_API_KEY",
        "defaultModel": "openai/gpt-4o",
        "models": openrouter_models
    })
    print(f"OpenRouter provider: {len(openrouter_models)} models")
    
    # Anthropic provider
    if 'anthropic' in providers:
        anthropic_models = providers['anthropic'][:10]
        config["providers"].append({
            "name": "Anthropic",
            "enabled": False,
            "baseURL": "https://api.anthropic.com/v1",
            "envKey": "ANTHROPIC_API_KEY",
            "defaultModel": "anthropic/claude-opus-4-7",
            "models": anthropic_models
        })
        print(f"Anthropic provider: {len(anthropic_models)} models")
    
    # OpenAI provider
    if 'openai' in providers:
        openai_models = providers['openai'][:15]
        config["providers"].append({
            "name": "OpenAI",
            "enabled": True,
            "baseURL": "https://api.openai.com/v1",
            "envKey": "OPENAI_API_KEY",
            "defaultModel": "openai/gpt-4o",
            "models": openai_models
        })
        print(f"OpenAI provider: {len(openai_models)} models")
    
    return config


def main():
    output_dir = Path.home() / ".mathmate"
    output_file = output_dir / "models.json"
    
    # Ensure directory exists
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate config
    config = generate_config()
    
    # Write to file
    with open(output_file, 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"\nWritten to {output_file}")
    print(f"Total providers: {len(config['providers'])}")


if __name__ == "__main__":
    main()
