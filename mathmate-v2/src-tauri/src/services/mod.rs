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

pub mod memory;
pub mod path;
pub mod session;

use crate::error::AppError;
use memory::MemoryService;
use path::PathScope;
use session::SessionService;

/// Central service container managed by Tauri as state.
pub struct AppServices {
    pub memory: MemoryService,
    pub path: PathScope,
    pub sessions: SessionService,
}

impl AppServices {
    /// Initialise all services and return the container.
    pub fn init() -> Result<Self, AppError> {
        // Base directory is ~/.mathmate
        let base_dir = dirs_next::home_dir()
            .ok_or_else(|| AppError::internal("Could not find home directory"))?
            .join(".mathmate");

        Ok(Self {
            memory: MemoryService::new(base_dir.clone()),
            path: PathScope::new(),
            sessions: SessionService::new(base_dir),
        })
    }
}
