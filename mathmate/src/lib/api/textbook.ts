/**
 * Typed Tauri API wrapper for Textbook commands.
 *
 * @module lib/api/textbook
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  TextbookCatalogEntry,
  TextbookMetadata,
  DownloadResult,
} from "../types";

export interface TocEntry {
  title: string;
  page: number;
  level: number;
  index: number;
  children?: TocEntry[];
}

export interface ImportResult {
  files_created: string[];
  chapters_found: number;
  sections_found: number;
}

export interface PageContent {
  page: number;
  text: string;
}

export interface TextbookIndexMeta {
  textbook_id: string;
  title?: string;
  total_pages: number;
  indexed_pages: number;
  status: "idle" | "indexing" | "complete" | "error";
  error?: string;
}

// ─── Book Stream Info (PDF streaming via local HTTP range server) ────────

export interface BookStreamInfo {
  origin: string;
  token: string;
}

/** @command: get_book_stream_info */
export async function getBookStreamInfo(): Promise<BookStreamInfo> {
  return invoke<BookStreamInfo>("get_book_stream_info");
}

/**
 * Build a pdf.js-compatible URL for the local book stream server.
 * Includes a token for auth and a revision for cache-busting.
 */
export function projectTextbookStreamUrl(
  info: BookStreamInfo,
  projectId: string,
  revision: string,
): string {
  const url = new URL(`/book/${encodeURIComponent(projectId)}`, info.origin);
  url.searchParams.set("token", info.token);
  url.searchParams.set("v", revision);
  return url.toString();
}

/**
 * Compute a short, stable revision string from a textbook path.
 * Uses a simple DJB2 hash to avoid exposing local paths in DevTools URLs.
 */
export function textbookPathRevision(path: string): string {
  let hash = 5381;
  for (let i = 0; i < path.length; i++) {
    hash = ((hash << 5) + hash + path.charCodeAt(i)) | 0;
  }
  // Convert to unsigned hex, take first 8 chars
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export const Textbook = {
  /** @command: list_textbook_catalog */
  listCatalog: () =>
    invoke<TextbookCatalogEntry[]>("list_textbook_catalog"),

  /** @command: download_free_textbook */
  download: (catalogId: string, format?: "pdf" | "epub") =>
    invoke<DownloadResult>("download_free_textbook", { catalogId, format }),

  /** @command: index_textbook_pages */
  indexPages: (
    textbookId: string,
    title: string | null,
    totalPages: number,
    pages: PageContent[],
    complete: boolean
  ) =>
    invoke<TextbookIndexMeta>("index_textbook_pages", {
      textbookId,
      title,
      totalPages,
      pages,
      complete,
    }),

  /** @command: get_textbook_index_status */
  getIndexStatus: (textbookId: string) =>
    invoke<TextbookIndexMeta | null>("get_textbook_index_status", {
      textbookId,
    }),

  /** @command: extract_pdf_toc */
  extractToc: (path: string) =>
    invoke<TocEntry[]>("extract_pdf_toc", { path }),

  /** @command: import_pdf_toc */
  importToc: (
    pdfPath: string,
    vaultPath: string,
    selectedIndices: number[],
    textbookTitle?: string
  ) =>
    invoke<ImportResult>("import_pdf_toc", {
      pdfPath,
      vaultPath,
      selectedIndices,
      textbookTitle,
    }),

  /**
   * @command: read_project_textbook
   * @deprecated Use getBookStreamInfo() + projectTextbookStreamUrl() instead.
   *   This legacy command reads the entire PDF into memory and returns it
   *   as base64 — slow for large textbooks. The new streaming path uses a
   *   local HTTP server that supports byte-range requests.
   */
  readProjectTextbook: (
    projectId: string,
    pageNumber?: number,
    mode?: string
  ) => invoke<string>("read_project_textbook", { projectId, pageNumber, mode }),

  /** @command: derive_textbook_id */
  deriveId: (path: string) =>
    invoke<string>("derive_textbook_id", { path }),

  /** @command: read_textbook_metadata */
  readMetadata: (path: string) =>
    invoke<TextbookMetadata>("read_textbook_metadata", { path }),

  /** @command: get_textbook_license_info */
  getLicenseInfo: (license: string) =>
    invoke<Record<string, unknown>>("get_textbook_license_info", { license }),
} as const;
