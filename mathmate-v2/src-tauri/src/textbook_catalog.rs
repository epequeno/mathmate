use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ─── Data Types ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextbookCatalogEntry {
    pub id: String,
    pub title: String,
    pub authors: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edition: Option<String>,
    pub subject: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub publisher: Option<String>,
    pub license: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
    pub download_urls: TextbookDownloads,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size_hint: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_count_hint: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recommended_for: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextbookDownloads {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pdf: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub epub: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub html: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextbookCatalog {
    pub catalog_version: String,
    pub updated_at: String,
    pub description: String,
    pub entries: Vec<TextbookCatalogEntry>,
}

/// Information about a textbook license type.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseInfo {
    pub license: String,
    pub label: String,
    pub url: Option<String>,
    pub attribution_required: bool,
    pub description: String,
}

/// Result of a textbook download.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadResult {
    pub catalog_id: String,
    pub title: String,
    pub local_path: String,
    pub file_size_bytes: u64,
}

// ─── Catalog Loading ───────────────────────────────────────────────────

/// Load the bundled textbook catalog JSON.
pub fn load_catalog() -> Result<Vec<TextbookCatalogEntry>, String> {
    let data = include_str!("../resources/textbook-catalog.json");
    let catalog: TextbookCatalog =
        serde_json::from_str(data).map_err(|e| format!("Failed to parse textbook catalog: {e}"))?;
    Ok(catalog.entries)
}

// ─── License Info ──────────────────────────────────────────────────────

/// Get license information for a given license type string.
pub fn get_license_info(license: &str) -> Result<LicenseInfo, String> {
    match license {
        "cc-by" => Ok(LicenseInfo {
            license: "cc-by".into(),
            label: "CC BY 4.0".into(),
            url: Some("https://creativecommons.org/licenses/by/4.0/".into()),
            attribution_required: true,
            description: "Creative Commons Attribution — can be adapted with credit".into(),
        }),
        "cc-by-sa" => Ok(LicenseInfo {
            license: "cc-by-sa".into(),
            label: "CC BY-SA 4.0".into(),
            url: Some("https://creativecommons.org/licenses/by-sa/4.0/".into()),
            attribution_required: true,
            description:
                "Creative Commons Attribution-ShareAlike — adaptations must share alike".into(),
        }),
        "cc-by-nc" => Ok(LicenseInfo {
            license: "cc-by-nc".into(),
            label: "CC BY-NC 4.0".into(),
            url: Some("https://creativecommons.org/licenses/by-nc/4.0/".into()),
            attribution_required: true,
            description:
                "Creative Commons Attribution-NonCommercial — non-commercial use only".into(),
        }),
        "cc-by-nc-sa" => Ok(LicenseInfo {
            license: "cc-by-nc-sa".into(),
            label: "CC BY-NC-SA 4.0".into(),
            url: Some("https://creativecommons.org/licenses/by-nc-sa/4.0/".into()),
            attribution_required: true,
            description: "Creative Commons Attribution-NonCommercial-ShareAlike".into(),
        }),
        "cc-by-nd" => Ok(LicenseInfo {
            license: "cc-by-nd".into(),
            label: "CC BY-ND 4.0".into(),
            url: Some("https://creativecommons.org/licenses/by-nd/4.0/".into()),
            attribution_required: true,
            description: "Creative Commons Attribution-NoDerivatives — no modifications".into(),
        }),
        "gpl" => Ok(LicenseInfo {
            license: "gpl".into(),
            label: "GNU GPL".into(),
            url: Some("https://www.gnu.org/licenses/gpl-3.0.html".into()),
            attribution_required: true,
            description: "GNU General Public License — derivative works must share alike".into(),
        }),
        "free-online" => Ok(LicenseInfo {
            license: "free-online".into(),
            label: "Free Online Access".into(),
            url: None,
            attribution_required: true,
            description:
                "Freely available online with attribution requirements — check source for details"
                .into(),
        }),
        "mit" => Ok(LicenseInfo {
            license: "mit".into(),
            label: "MIT License".into(),
            url: Some("https://opensource.org/licenses/MIT".into()),
            attribution_required: true,
            description: "MIT License — minimal restrictions, attribution required".into(),
        }),
        "other" => Ok(LicenseInfo {
            license: "other".into(),
            label: "Other Open License".into(),
            url: None,
            attribution_required: true,
            description:
                "Open access — check source for specific licensing terms and attribution requirements"
                .into(),
        }),
        _ => Err(format!("Unknown license type: {license}")),
    }
}

// ─── Download ──────────────────────────────────────────────────────────

/// Resolve the textbook library directory (`~/.mathmate/textbooks/`).
fn textbook_library_dir() -> Result<PathBuf, String> {
    let home = dirs_next::home_dir().ok_or_else(|| "Could not find home directory".to_string())?;
    let dir = home.join(".mathmate").join("textbooks");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create textbook library directory: {e}"))?;
    Ok(dir)
}

/// Download a free textbook PDF to the local textbook library.
///
/// Uses reqwest (blocking) for the HTTP download. Saves to
/// `~/.mathmate/textbooks/{catalog_id}.pdf` and returns the local path.
pub fn download_textbook(catalog_id: &str) -> Result<DownloadResult, String> {
    let entries = load_catalog()?;
    let entry = entries
        .iter()
        .find(|e| e.id == catalog_id)
        .ok_or_else(|| format!("Textbook '{catalog_id}' not found in catalog"))?;

    let pdf_url = entry
        .download_urls
        .pdf
        .as_deref()
        .ok_or_else(|| format!("Textbook '{catalog_id}' has no PDF download URL"))?;

    let lib_dir = textbook_library_dir()?;
    let extension = if pdf_url.ends_with(".pdf") {
        "pdf"
    } else {
        "pdf" // default
    };
    let local_path = lib_dir.join(format!("{catalog_id}.{extension}"));
    let local_path_str = local_path.to_string_lossy().to_string();

    // Skip download if file already exists
    if local_path.exists() {
        let file_size = std::fs::metadata(&local_path)
            .map(|m| m.len())
            .unwrap_or(0);
        return Ok(DownloadResult {
            catalog_id: catalog_id.into(),
            title: entry.title.clone(),
            local_path: local_path_str,
            file_size_bytes: file_size,
        });
    }

    // Download with reqwest (blocking)
    let response = reqwest::blocking::get(pdf_url)
        .map_err(|e| format!("Failed to download textbook: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "Download failed with HTTP {status} for URL: {pdf_url}"
        ));
    }

    let bytes = response
        .bytes()
        .map_err(|e| format!("Failed to read download response: {e}"))?;

    std::fs::write(&local_path, &bytes)
        .map_err(|e| format!("Failed to save textbook to disk: {e}"))?;

    let file_size = bytes.len() as u64;

    Ok(DownloadResult {
        catalog_id: catalog_id.into(),
        title: entry.title.clone(),
        local_path: local_path_str,
        file_size_bytes: file_size,
    })
}

// ─── Validation ────────────────────────────────────────────────────────

/// Validate the catalog JSON (used in testing).
#[allow(dead_code)]
pub fn validate_catalog() -> Result<(), Vec<String>> {
    let entries = load_catalog().map_err(|e| vec![e])?;
    let mut errors: Vec<String> = Vec::new();

    for entry in &entries {
        if entry.id.is_empty() {
            errors.push("Entry has empty id".into());
        }
        if entry.title.is_empty() {
            errors.push(format!("Entry '{}' has empty title", entry.id));
        }
        if entry.authors.is_empty() {
            errors.push(format!("Entry '{}' has no authors", entry.id));
        }
        if entry.description.is_empty() {
            errors.push(format!("Entry '{}' has no description", entry.id));
        }
        if entry.download_urls.pdf.is_none()
            && entry.download_urls.epub.is_none()
            && entry.download_urls.html.is_none()
        {
            errors.push(format!(
                "Entry '{}' has no download URLs at all",
                entry.id
            ));
        }
        if get_license_info(&entry.license).is_err() {
            errors.push(format!(
                "Entry '{}' has unknown license '{}'",
                entry.id, entry.license
            ));
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

// ─── Tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_catalog_loads() {
        let entries = load_catalog().expect("Catalog should load");
        assert!(!entries.is_empty(), "Catalog should have at least one entry");
        assert!(entries.len() >= 20, "Expected at least 20 entries, got {}", entries.len());
    }

    #[test]
    fn test_catalog_validates() {
        validate_catalog().expect("Catalog should pass validation");
    }

    #[test]
    fn test_known_entries_have_pdfs() {
        let entries = load_catalog().expect("Catalog should load");
        let no_pdf: Vec<&TextbookCatalogEntry> = entries
            .iter()
            .filter(|e| e.download_urls.pdf.is_none())
            .collect();
        assert!(
            no_pdf.is_empty(),
            "All entries should have a PDF URL. Missing: {:?}",
            no_pdf.iter().map(|e| e.id.as_str()).collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_all_subjects_represented() {
        let entries = load_catalog().expect("Catalog should load");
        let mut subjects: std::collections::HashSet<&str> = std::collections::HashSet::new();
        for entry in &entries {
            subjects.insert(&entry.subject);
        }
        // We should have at least 4 distinct subjects
        assert!(subjects.len() >= 4, "Expected 4+ subjects, got {}", subjects.len());
    }

    #[test]
    fn test_license_info() {
        let info = get_license_info("cc-by").expect("cc-by should be known");
        assert!(info.attribution_required);
        assert_eq!(info.label, "CC BY 4.0");

        let unknown = get_license_info("bogus");
        assert!(unknown.is_err());
    }

    #[test]
    fn test_download_invalid_id() {
        let result = download_textbook("nonexistent-id");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found in catalog"));
    }
}
