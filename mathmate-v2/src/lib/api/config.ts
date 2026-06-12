/**
 * Typed Tauri API wrapper for Config, Models, and Provider commands.
 *
 * @module lib/api/config
 */

import { invoke } from "@tauri-apps/api/core";
import type { ModelCatalog } from "../types";
import type { AppConfig, ProviderConfig } from "../../stores/configStore";

export const Config = {
  /** @command: get_app_config */
  get: () => invoke<AppConfig>("get_app_config"),

  /** @command: save_app_config */
  save: (config: AppConfig) =>
    invoke<void>("save_app_config", { config }),

  /** @command: get_models_config */
  getModels: () =>
    invoke<{ providers: ProviderConfig[] }>("get_models_config"),

  /** @command: set_provider_api_key */
  setProviderKey: (providerName: string, apiKey: string | null) =>
    invoke<void>("set_provider_api_key", { providerName, apiKey }),

  /** @command: fetch_models */
  fetchModels: (forceRefresh?: boolean) =>
    invoke<ModelCatalog>("fetch_models", { forceRefresh }),

  /** @command: get_cached_models */
  getCachedModels: () =>
    invoke<ModelCatalog | null>("get_cached_models"),

  /** @command: get_env_var */
  getEnvVar: (key: string) =>
    invoke<string | null>("get_env_var", { key }),

  /** @command: get_config_path */
  getConfigPath: () =>
    invoke<string>("get_config_path"),
} as const;
