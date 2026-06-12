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

pub mod path;

use crate::error::AppError;
use path::PathScope;

/// Central service container managed by Tauri as state.
pub struct AppServices {
    pub path: PathScope,
}

impl AppServices {
    /// Initialise all services and return the container.
    ///
    /// Currently only PathScope is extracted; other services follow in
    /// subsequent sub-steps (C.6.c–C.6.j).
    pub fn init() -> Result<Self, AppError> {
        Ok(Self {
            path: PathScope::new(),
        })
    }
}
