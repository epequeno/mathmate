// ─── Config Service ───────────────────────────────────────────────────
//
// Owns config loading/persistence + in-memory cache.  Replaces the
// `models_config` and `app_config` fields on `AppState`.
//
// All config file I/O uses `~/.mathmate/` (the injected base_dir) so
// the service is unit-testable with a temp directory.
//
// See: Implementation_Phase14C_RustServiceLayer.md § C.6

use std::path::PathBuf;
use std::sync::Mutex;

pub use crate::config::{AppConfig, AppConfigModels, ProviderConfig};

use crate::error::AppError;

// ─── ConfigService ───────────────────────────────────────────────────

pub struct ConfigService {
    base_dir: PathBuf,
    models_cache: Mutex<Option<AppConfigModels>>,
    app_cache: Mutex<Option<AppConfig>>,
}

impl ConfigService {
    pub fn new(base_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&base_dir).ok();
        Self {
            base_dir,
            models_cache: Mutex::new(None),
            app_cache: Mutex::new(None),
        }
    }

#[allow(dead_code)] // private helper
    fn config_dir(&self) -> PathBuf {
        self.base_dir.clone()
    }

    // ── models config ────────────────────────────────────────────────

    pub fn get_models_config(&self) -> Result<AppConfigModels, AppError> {
        let mut cache = self
            .models_cache
            .lock()
            .map_err(|e| AppError::internal(format!("Cache lock poisoned: {}", e)))?;
        if let Some(ref config) = *cache {
            return Ok(config.clone());
        }
        let config = load_models_config_at(&self.base_dir)?;
        *cache = Some(config.clone());
        Ok(config)
    }

    /// Set stored API key for a provider and persist + invalidate cache.
    pub fn set_provider_api_key(
        &self,
        provider_name: &str,
        key: Option<String>,
    ) -> Result<(), AppError> {
        let mut config = load_models_config_at(&self.base_dir)?;
        let _changed = config
            .providers
            .iter_mut()
            .find(|p| p.name == provider_name)
            .map(|p| p.stored_api_key = key)
            .is_some();
        save_models_config_at(&self.base_dir, &config)?;
        // Invalidate cache so next read picks up the change
        let mut cache = self
            .models_cache
            .lock()
            .map_err(|e| AppError::internal(format!("Cache lock poisoned: {}", e)))?;
        *cache = None;
        Ok(())
    }

    // ── app config ───────────────────────────────────────────────────

    pub fn get_app_config(&self) -> Result<AppConfig, AppError> {
        let mut cache = self
            .app_cache
            .lock()
            .map_err(|e| AppError::internal(format!("Cache lock poisoned: {}", e)))?;
        if let Some(ref config) = *cache {
            return Ok(config.clone());
        }
        let config = load_app_config_at(&self.base_dir)?;
        *cache = Some(config.clone());
        Ok(config)
    }

    pub fn save_app_config(&self, config: &AppConfig) -> Result<(), AppError> {
        save_app_config_at(&self.base_dir, config)?;
        let mut cache = self
            .app_cache
            .lock()
            .map_err(|e| AppError::internal(format!("Cache lock poisoned: {}", e)))?;
        *cache = Some(config.clone());
        Ok(())
    }

    // ── misc ─────────────────────────────────────────────────────────

    /// Return the config directory path for the frontend.
    pub fn config_path(&self) -> String {
        self.base_dir.to_string_lossy().to_string()
    }

    /// Read a safe env var (whitelist-enforced).
    pub fn get_env_var(&self, key: &str) -> Result<Option<String>, AppError> {
        let allowed = ["OPENROUTER_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"];
        if !allowed.contains(&key) {
            return Err(AppError::access_denied(format!(
                "env var '{}' is not in the allowed list",
                key
            )));
        }
        Ok(std::env::var(key).ok())
    }
}

// ─── I/O helpers (private, path-aware versions) ──────────────────────

fn load_models_config_at(base: &PathBuf) -> Result<AppConfigModels, AppError> {
    let path = base.join("models.json");
    if !path.exists() {
        let default = default_models_config();
        save_models_config_at(base, &default).ok();
        return Ok(default);
    }
    let data = std::fs::read_to_string(&path)
        .map_err(|e| AppError::internal(format!("Failed to read models config: {}", e)))?;
    match serde_json::from_str(&data) {
        Ok(c) => Ok(c),
        Err(e) => {
            eprintln!("Warning: models.json parse error ({}), falling back to defaults", e);
            let default = default_models_config();
            save_models_config_at(base, &default).ok();
            Ok(default)
        }
    }
}

fn save_models_config_at(base: &PathBuf, config: &AppConfigModels) -> Result<(), AppError> {
    let path = base.join("models.json");
    let data = serde_json::to_string_pretty(config)
        .map_err(|e| AppError::internal(format!("Failed to serialize models config: {}", e)))?;
    std::fs::write(&path, data)
        .map_err(|e| AppError::internal(format!("Failed to write models config: {}", e)))
}

fn load_app_config_at(base: &PathBuf) -> Result<AppConfig, AppError> {
    let path = base.join("config.json");
    if !path.exists() {
        let default = default_app_config();
        save_app_config_at(base, &default).ok();
        return Ok(default);
    }
    let data = std::fs::read_to_string(&path)
        .map_err(|e| AppError::internal(format!("Failed to read app config: {}", e)))?;
    match serde_json::from_str(&data) {
        Ok(c) => Ok(c),
        Err(e) => {
            eprintln!("Warning: config.json parse error ({}), falling back to defaults", e);
            let backup = path.with_extension("json.bak");
            let _ = std::fs::copy(&path, &backup);
            let default = default_app_config();
            save_app_config_at(base, &default).ok();
            Ok(default)
        }
    }
}

fn save_app_config_at(base: &PathBuf, config: &AppConfig) -> Result<(), AppError> {
    let path = base.join("config.json");
    let data = serde_json::to_string_pretty(config)
        .map_err(|e| AppError::internal(format!("Failed to serialize config: {}", e)))?;
    std::fs::write(&path, data)
        .map_err(|e| AppError::internal(format!("Failed to write config: {}", e)))
}

// ─── Defaults (duplicated from config.rs to keep the service self-contained) ─

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

fn default_app_config() -> AppConfig {
    AppConfig {
        latex: crate::config::LaTeXConfig {
            engine: "katex".into(),
        },
        synapse: crate::config::SynapseConfig {
            vaults: None,
            study_log_path: None,
        },
        chat: None,
        ui: None,
    }
}

// ─── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_service() -> (ConfigService, PathBuf) {
        use std::sync::atomic::{AtomicU32, Ordering};
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("mathmate_cfg_{}", n));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let svc = ConfigService::new(dir.clone());
        (svc, dir)
    }

    #[test]
    fn test_get_models_config_returns_defaults_on_first_run() {
        let (svc, dir) = temp_service();
        let config = svc.get_models_config().unwrap();
        assert_eq!(config.providers.len(), 3);
        assert_eq!(config.providers[0].name, "openrouter");
        // Second call should hit cache
        let config2 = svc.get_models_config().unwrap();
        assert_eq!(config2.providers.len(), 3);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_get_app_config_returns_defaults_on_first_run() {
        let (svc, dir) = temp_service();
        let config = svc.get_app_config().unwrap();
        assert_eq!(config.latex.engine, "katex");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_save_and_reload_app_config() {
        let (svc, dir) = temp_service();
        let mut config = svc.get_app_config().unwrap();
        config.latex.engine = "mathjax".into();
        svc.save_app_config(&config).unwrap();

        // New service to same dir should read the saved config
        let svc2 = ConfigService::new(dir.clone());
        let loaded = svc2.get_app_config().unwrap();
        assert_eq!(loaded.latex.engine, "mathjax");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_set_provider_api_key() {
        let (svc, dir) = temp_service();
        svc.set_provider_api_key("openrouter", Some("sk-test-123".into()))
            .unwrap();

        // Read back — key should be in the config
        let config = svc.get_models_config().unwrap();
        let or = config.providers.iter().find(|p| p.name == "openrouter").unwrap();
        assert_eq!(or.stored_api_key, Some("sk-test-123".into()));

        // Clear it
        svc.set_provider_api_key("openrouter", None).unwrap();
        let config2 = svc.get_models_config().unwrap();
        let or2 = config2.providers.iter().find(|p| p.name == "openrouter").unwrap();
        assert_eq!(or2.stored_api_key, None);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_config_path() {
        let (svc, dir) = temp_service();
        let path = svc.config_path();
        assert!(path.contains("mathmate_cfg_"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_get_env_var_allowed() {
        let (svc, dir) = temp_service();
        std::env::set_var("OPENAI_API_KEY", "sk-test-456");
        let val = svc.get_env_var("OPENAI_API_KEY").unwrap();
        assert_eq!(val, Some("sk-test-456".into()));
        std::env::remove_var("OPENAI_API_KEY");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_get_env_var_blocked() {
        let (svc, dir) = temp_service();
        let err = svc.get_env_var("SECRET_TOKEN").unwrap_err();
        assert_eq!(err.kind(), "access_denied");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_get_env_var_missing_returns_none() {
        let (svc, dir) = temp_service();
        std::env::remove_var("OPENAI_API_KEY");
        let val = svc.get_env_var("OPENAI_API_KEY").unwrap();
        assert_eq!(val, None);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_cache_invalidation_on_key_change() {
        let (svc, dir) = temp_service();

        // First read populates cache
        let c1 = svc.get_models_config().unwrap();
        let key1 = c1.providers[0].stored_api_key.clone();

        // Change key invalidates cache
        svc.set_provider_api_key("openrouter", Some("sk-new".into()))
            .unwrap();

        // Next read should be fresh
        let c2 = svc.get_models_config().unwrap();
        let key2 = c2.providers[0].stored_api_key.clone();
        assert_ne!(key1, key2);
        assert_eq!(key2, Some("sk-new".into()));

        std::fs::remove_dir_all(&dir).ok();
    }
}
