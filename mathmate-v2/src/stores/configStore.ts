import { create } from "zustand";
import { Config } from "../lib/api";
import type { ModelCatalog, ModelCatalogEntry } from "../lib/types";
import { toAppError } from "../lib/error";

// ─── Theme helpers ────────────────────────────────────────────────────────────

export function applyTheme(theme: "system" | "light" | "dark") {
  const root = document.documentElement;
  if (theme === "light") {
    root.setAttribute("data-theme", "light");
  } else if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
}

// Apply persisted theme immediately on module load (before first React render)
// so there's no flash of unstyled content.
{
  const stored = localStorage.getItem("mathmate-theme") as "system" | "light" | "dark" | null;
  if (stored) applyTheme(stored);
}

export interface ProviderConfig {
  name: string;
  enabled: boolean;
  env_key?: string;
  stored_api_key?: string;
  base_url: string;
  models: string[];
  default_model: string;
  fetch_models: boolean;
}

export interface AppConfig {
  latex: { engine: string };
  synapse: { vaults?: { name: string; path: string }[]; study_log_path?: string };
  chat?: {
    system_prompt?: string;
    max_tokens?: number;
    temperature?: number;
    safety_mode?: string;
    safety_min_trust?: number;
    safety_max_total_bytes?: number;
  };
  ui?: { font_size?: number };
}

interface ConfigState {
  providers: ProviderConfig[];
  appConfig: AppConfig | null;
  loading: boolean;
  error: string | null;
  // Model catalog
  modelCatalog: ModelCatalog | null;
  modelCatalogLoading: boolean;
  modelCatalogError: string | null;
  visionFilterEnabled: boolean;
  // Phase 12C: Feature flag for timeline UI
  timelineEnabled: boolean;
  setTimelineEnabled: (v: boolean) => void;
  // Theme preference (persisted to localStorage)
  theme: "system" | "light" | "dark";
  setTheme: (theme: "system" | "light" | "dark") => void;
  loadConfig: () => Promise<void>;
  fetchModelCatalog: (forceRefresh?: boolean) => Promise<void>;
  loadCachedModelCatalog: () => Promise<void>;
  setVisionFilter: (enabled: boolean) => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
  providers: [],
  appConfig: null,
  loading: false,
  error: null,
  // Model catalog
  modelCatalog: null,
  modelCatalogLoading: false,
  modelCatalogError: null,
  visionFilterEnabled: false,
  // Timeline rendering is always enabled — segments are the canonical format.
  timelineEnabled: true,
  setTimelineEnabled: (v: boolean) => set({ timelineEnabled: v }),
  // Theme preference — read from localStorage on first load, default to system
  theme: (localStorage.getItem("mathmate-theme") as "system" | "light" | "dark") ?? "system",
  setTheme: (theme: "system" | "light" | "dark") => {
    localStorage.setItem("mathmate-theme", theme);
    applyTheme(theme);
    set({ theme });
  },

  loadConfig: async () => {
    set({ loading: true, error: null });
    try {

      const modelsConfig = await Config.getModels();
      let appConfig: AppConfig | null = null;
      try {
        appConfig = await Config.get();
      } catch {
        // non-fatal: app config load can fail silently
      }
      set({
        providers: modelsConfig.providers.filter((p) => p.enabled),
        appConfig,
        loading: false,
      });
    } catch (err) {
      console.error("[configStore] Failed to load config:", err);
      set({ error: toAppError(err).message, loading: false });
    }
  },

  fetchModelCatalog: async (forceRefresh = false) => {
    set({ modelCatalogLoading: true, modelCatalogError: null });
    try {
      const catalog = await Config.fetchModels(forceRefresh);
      set({ modelCatalog: catalog, modelCatalogLoading: false });
    } catch (err) {
      console.error("[configStore] Failed to fetch model catalog:", err);
      set({ modelCatalogError: toAppError(err).message, modelCatalogLoading: false });
    }
  },

  loadCachedModelCatalog: async () => {
    try {
      const cached = await Config.getCachedModels();
      if (cached) {
        set({ modelCatalog: cached });
      }
    } catch {
      // Silently fail — cache is optional
    }
  },

  setVisionFilter: (enabled: boolean) => set({ visionFilterEnabled: enabled }),
}));
