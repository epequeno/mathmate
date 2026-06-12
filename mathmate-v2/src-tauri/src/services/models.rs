//! ModelCatalogService — thin wrapper around `crate::models`.
//!
//! Provides cached/fresh model catalog queries from OpenRouter.
//! Stateless — all state lives in the underlying module's global cache.

use crate::error::AppError;

pub use crate::models::ModelCatalog;

pub struct ModelCatalogService;

impl ModelCatalogService {
    pub fn new() -> Self {
        Self
    }

    pub fn fetch(&self, force_refresh: bool) -> Result<ModelCatalog, AppError> {
        crate::models::fetch_models(force_refresh).map_err(|e| AppError::internal(e))
    }

    pub fn get_cached(&self) -> Option<ModelCatalog> {
        crate::models::get_cached_models()
    }
}
