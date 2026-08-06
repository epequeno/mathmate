use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Pricing info per model (from OpenRouter).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPricing {
    pub prompt: String,
    pub completion: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
}

/// A single model entry from the OpenRouter catalog.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelCatalogEntry {
    pub id: String,
    pub name: String,
    pub supports_vision: bool,
    pub context_length: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pricing: Option<ModelPricing>,
}

/// The full cached catalog with metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelCatalog {
    pub fetched_at: String,
    pub models: Vec<ModelCatalogEntry>,
}

// ─── Raw OpenRouter response types ──────────────

#[derive(Debug, Deserialize)]
struct OpenRouterResponse {
    data: Vec<OpenRouterModel>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterModel {
    id: String,
    name: String,
    #[serde(default)]
    context_length: u64,
    #[serde(default)]
    architecture: Option<OpenRouterArchitecture>,
    #[serde(default)]
    pricing: Option<OpenRouterPricing>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterArchitecture {
    #[serde(default)]
    modality: String,
    #[serde(default)]
    input_modalities: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct OpenRouterPricing {
    #[serde(default)]
    prompt: String,
    #[serde(default)]
    completion: String,
    #[serde(default)]
    image: Option<String>,
}

// ─── Cache management ───────────────────────────

fn cache_path() -> PathBuf {
    let home = dirs_next::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".mathmate").join("models_cache.json")
}

fn read_cache() -> Option<ModelCatalog> {
    let path = cache_path();
    if !path.exists() {
        return None;
    }
    let data = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&data).ok()
}

fn write_cache(catalog: &ModelCatalog) -> Result<(), String> {
    let path = cache_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create cache dir: {}", e))?;
    }
    let tmp = path.with_extension("json.tmp");
    let data = serde_json::to_string_pretty(catalog)
        .map_err(|e| format!("Failed to serialize catalog: {}", e))?;
    std::fs::write(&tmp, &data).map_err(|e| format!("Failed to write cache tmp: {}", e))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("Failed to commit cache: {}", e))
}

/// Check if a cached catalog is still fresh (within TTL).
fn is_cache_fresh(catalog: &ModelCatalog) -> bool {
    let Ok(fetched) = chrono::DateTime::parse_from_rfc3339(&catalog.fetched_at) else {
        return false;
    };
    let elapsed = chrono::Utc::now().signed_duration_since(fetched);
    elapsed.num_hours() < 24
}

// ─── Public API ─────────────────────────────────

/// Fetch models from OpenRouter API and cache the result.
/// If `force_refresh` is false and cache is fresh, returns the cached version.
pub fn fetch_models(force_refresh: bool) -> Result<ModelCatalog, String> {
    // Check cache first (unless force refresh)
    if !force_refresh {
        if let Some(cached) = read_cache() {
            if is_cache_fresh(&cached) {
                return Ok(cached);
            }
        }
    }

    // Fetch from OpenRouter
    let url = "https://openrouter.ai/api/v1/models";
    let response =
        reqwest::blocking::get(url).map_err(|e| format!("Network error fetching models: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(format!("OpenRouter API returned {}", status));
    }

    let or_response: OpenRouterResponse = response
        .json()
        .map_err(|e| format!("Failed to parse OpenRouter response: {}", e))?;

    // Map to our catalog format
    let models: Vec<ModelCatalogEntry> = or_response
        .data
        .into_iter()
        .map(|m| {
            let supports_vision = m.architecture.as_ref().map_or(false, |arch| {
                arch.input_modalities.contains(&"image".to_string())
                    || arch.modality.contains("image")
            });

            ModelCatalogEntry {
                id: m.id,
                name: m.name,
                supports_vision,
                context_length: m.context_length,
                pricing: m.pricing.map(|p| ModelPricing {
                    prompt: p.prompt,
                    completion: p.completion,
                    image: p.image,
                }),
            }
        })
        .collect();

    let catalog = ModelCatalog {
        fetched_at: chrono::Utc::now().to_rfc3339(),
        models,
    };

    // Write to cache
    write_cache(&catalog)?;

    Ok(catalog)
}

/// Get the cached models without making any network requests.
pub fn get_cached_models() -> Option<ModelCatalog> {
    read_cache()
}
