#![allow(dead_code)]
use std::path::PathBuf;
#[cfg(feature = "export-types")]
use ts_rs::TS;

use crate::services::config::{
    AppConfig, AppConfigModels, LaTeXConfig, ProviderConfig, SynapseConfig,
};

// ─── Config Loading ─────────────────────────────


/// Get the mathmate config directory: ~/.mathmate
pub fn config_dir() -> PathBuf {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".mathmate")
}

/// Load models config from ~/.mathmate/models.json
/// Returns a default config if the file doesn't exist or is invalid.
pub fn load_models_config() -> Result<AppConfigModels, String> {
    let path = config_dir().join("models.json");
    if !path.exists() {
        // First run — write a default config and return it
        let default_config = default_models_config();
        if let Err(e) = save_models_config(&default_config) {
            eprintln!("Warning: could not write default models.json: {e}");
        }
        return Ok(default_config);
    }
    let data =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read models config: {e}"))?;
    match serde_json::from_str::<AppConfigModels>(&data) {
        Ok(config) => Ok(config),
        Err(e) => {
            eprintln!("Warning: models.json parse error ({e}), falling back to defaults");
            let default_config = default_models_config();
            let _ = save_models_config(&default_config);
            Ok(default_config)
        }
    }
}

/// Save models config to ~/.mathmate/models.json
pub fn save_models_config(config: &AppConfigModels) -> Result<(), String> {
    let dir = config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {e}"))?;
    let path = dir.join("models.json");
    let data = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize models config: {e}"))?;
    std::fs::write(&path, data).map_err(|e| format!("Failed to write models config: {e}"))
}

/// Set the stored API key for a provider and persist to models.json.
/// Pass key = None to clear it.
pub fn set_provider_api_key(provider_name: &str, key: Option<String>) -> Result<(), String> {
    let mut config = load_models_config()?;
    let changed = if let Some(provider) = config
        .providers
        .iter_mut()
        .find(|p| p.name == provider_name)
    {
        provider.stored_api_key = key;
        true
    } else {
        false
    };
    if changed {
        save_models_config(&config)?;
    }
    Ok(())
}

fn default_models_config() -> AppConfigModels {
    AppConfigModels {
        providers: vec![
            ProviderConfig {
                name: "openrouter".into(),
                enabled: true,
                env_key: Some("OPENROUTER_API_KEY".into()),
                stored_api_key: None,
                base_url: "https://openrouter.ai/api/v1".into(),
                models: vec![
                    "moonshotai/kimi-k2".into(),
                    "anthropic/claude-sonnet-4".into(),
                    "openai/gpt-4.1".into(),
                ],
                default_model: "moonshotai/kimi-k2".into(),
                fetch_models: false,
            },
            ProviderConfig {
                name: "openai".into(),
                enabled: false,
                env_key: Some("OPENAI_API_KEY".into()),
                stored_api_key: None,
                base_url: "https://api.openai.com/v1".into(),
                models: vec!["gpt-4.1".into(), "o3".into()],
                default_model: "gpt-4.1".into(),
                fetch_models: false,
            },
            ProviderConfig {
                name: "anthropic".into(),
                enabled: false,
                env_key: Some("ANTHROPIC_API_KEY".into()),
                stored_api_key: None,
                base_url: "https://api.anthropic.com/v1".into(),
                models: vec!["claude-sonnet-4-20250514".into()],
                default_model: "claude-sonnet-4-20250514".into(),
                fetch_models: false,
            },
        ],
    }
}

/// Load app config from ~/.mathmate/config.json
/// Returns a default config if the file doesn't exist or is invalid.
pub fn load_app_config() -> Result<AppConfig, String> {
    let path = config_dir().join("config.json");
    if !path.exists() {
        let default_config = default_app_config();
        if let Err(e) = save_app_config(&default_config) {
            eprintln!("Warning: could not write default config.json: {e}");
        }
        return Ok(default_config);
    }
    let data =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read app config: {e}"))?;
    match serde_json::from_str::<AppConfig>(&data) {
        Ok(config) => Ok(config),
        Err(e) => {
            eprintln!("Warning: config.json parse error ({e}), falling back to defaults");
            // Back up the old config and write a fresh default
            let backup = path.with_extension("json.bak");
            let _ = std::fs::copy(&path, &backup);
            let default_config = default_app_config();
            let _ = save_app_config(&default_config);
            Ok(default_config)
        }
    }
}

fn default_app_config() -> AppConfig {
    AppConfig {
        latex: LaTeXConfig {
            engine: "katex".into(),
        },
        synapse: SynapseConfig {
            vaults: None,
            study_log_path: None,
        },
        chat: None,
        ui: None,
    }
}

/// Save app config to ~/.mathmate/config.json
pub fn save_app_config(config: &AppConfig) -> Result<(), String> {
    let dir = config_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {e}"))?;
    let path = dir.join("config.json");
    let data = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    std::fs::write(&path, data).map_err(|e| format!("Failed to write config: {e}"))
}
