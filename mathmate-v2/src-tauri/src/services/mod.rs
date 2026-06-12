// ─── Service layer entry point ─────────────────────────────────────────
//
// AppServices holds one instance of each service.  Services own their
// state and are unit-testable without Tauri.  Tauri commands in lib.rs
// become thin wrappers: extract State<AppServices>, call the method,
// map the error.
//
// The container is registered with Tauri via `.manage()` during app
// setup so every command handler gets access.
//
// See: Implementation_Phase14C_RustServiceLayer.md

pub mod config;
pub mod image;
pub mod memory;
pub mod models;
pub mod path;
pub mod project;
pub mod session;
pub mod synapse;
pub mod textbook;
pub mod vault;
pub mod wrapup;

use crate::error::AppError;
use config::ConfigService;
use image::ImageService;
use memory::MemoryService;
use models::ModelCatalogService;
use path::PathScope;
use project::ProjectService;
use session::SessionService;
use synapse::SynapseService;
use textbook::TextbookService;
use vault::VaultService;
use wrapup::WrapUpService;

/// Central service container managed by Tauri as state.
pub struct AppServices {
    pub config: ConfigService,
    pub images: ImageService,
    pub memory: MemoryService,
    pub model_catalog: ModelCatalogService,
    pub path: PathScope,
    pub projects: ProjectService,
    pub sessions: SessionService,
    pub synapse: SynapseService,
    pub textbook: TextbookService,
    pub vault: VaultService,
    pub wrapup: WrapUpService,
}

impl AppServices {
    /// Initialise all services and return the container.
    pub fn init() -> Result<Self, AppError> {
        let base_dir = dirs_next::home_dir()
            .ok_or_else(|| AppError::internal("Could not find home directory"))?
            .join(".mathmate");

        Ok(Self {
            config: ConfigService::new(base_dir.clone()),
            images: ImageService::new(base_dir.clone()),
            memory: MemoryService::new(base_dir.clone()),
            model_catalog: ModelCatalogService::new(),
            path: PathScope::new(),
            projects: ProjectService::new(base_dir.clone()),
            sessions: SessionService::new(base_dir.clone()),
            synapse: SynapseService::new(),
            textbook: TextbookService::new(),
            vault: VaultService::new(),
            wrapup: WrapUpService::new(),
        })
    }
}
