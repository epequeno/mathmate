//! TextbookService — unified entry point for textbook operations.
//!
//! Delegates to the three existing textbook crate modules:
//!   - `crate::textbook` (PDF metadata)
//!   - `crate::pdf_import` (TOC extraction + import)
//!   - `crate::textbook_catalog` (free textbook listing + download)
//!   - `crate::textbook_index` (search index)
//!
//! All methods are thin wrappers; the service exists to provide a single
//! injection point rather than having 10 scattered free-function commands.

use crate::error::AppError;

// ─── Re-exports ──────────────────────────────────────────────────────────

pub use crate::pdf_import::{ImportResult, TocEntry};
pub use crate::textbook::TextbookMetadata;
pub use crate::textbook_catalog::{
    DownloadResult, LicenseInfo, TextbookCatalogEntry,
};
pub use crate::textbook_index::{PageContent, TextbookIndexMeta};

// ─── Service ─────────────────────────────────────────────────────────────

pub struct TextbookService;

impl TextbookService {
    pub fn new() -> Self {
        Self
    }

    // ── PDF metadata ──────────────────────────────────────────────────

    pub fn read_metadata(&self, path: &str) -> Result<TextbookMetadata, AppError> {
        crate::textbook::read_textbook_metadata(path).map_err(|e| AppError::internal(e))
    }

    // ── PDF TOC ───────────────────────────────────────────────────────

    pub fn extract_pdf_toc(&self, path: &str) -> Result<Vec<TocEntry>, AppError> {
        crate::pdf_import::extract_pdf_toc(path).map_err(|e| AppError::internal(e))
    }

    pub fn import_pdf_toc(
        &self,
        pdf_path: &str,
        vault_path: &str,
        selected_indices: &[usize],
        textbook_title: Option<&str>,
    ) -> Result<ImportResult, AppError> {
        crate::pdf_import::import_pdf_toc(
            pdf_path,
            vault_path,
            selected_indices,
            textbook_title,
        )
        .map_err(|e| AppError::internal(e))
    }

    // ── Free textbook catalog ─────────────────────────────────────────

    pub fn list_catalog(&self) -> Result<Vec<TextbookCatalogEntry>, AppError> {
        crate::textbook_catalog::load_catalog().map_err(|e| AppError::internal(e))
    }

    pub fn get_license_info(&self, license: &str) -> Result<LicenseInfo, AppError> {
        crate::textbook_catalog::get_license_info(license).map_err(|e| AppError::internal(e))
    }

    pub fn download_free_textbook(
        &self,
        catalog_id: &str,
    ) -> Result<DownloadResult, AppError> {
        crate::textbook_catalog::download_textbook(catalog_id)
            .map_err(|e| AppError::internal(e))
    }

    // ── Search index ──────────────────────────────────────────────────

    pub fn index_pages(
        &self,
        textbook_id: &str,
        title: Option<&str>,
        total_pages: u32,
        pages: Vec<PageContent>,
        complete: bool,
    ) -> Result<TextbookIndexMeta, AppError> {
        crate::textbook_index::save_page_batch(
            textbook_id,
            title.map(|s| s.to_string()),
            total_pages,
            pages,
            complete,
        )
        .map_err(|e| AppError::internal(e))
    }

    pub fn get_index_status(
        &self,
        textbook_id: &str,
    ) -> Result<Option<TextbookIndexMeta>, AppError> {
        match crate::textbook_index::load_meta(textbook_id) {
            Ok(meta) => Ok(Some(meta)),
            Err(_) => Ok(None),
        }
    }

    pub fn derive_textbook_id(&self, pdf_path: &str) -> String {
        crate::textbook_index::derive_textbook_id(pdf_path)
    }
}
