import { useState, useRef, useCallback, useEffect } from "react";
import type { ProviderConfig } from "../stores/configStore";
import { useConfigStore } from "../stores/configStore";
import { Eye, RefreshCw, AlertTriangle, Camera } from "lucide-react";
import type { ModelCatalogEntry } from "../lib/types";

interface ModelSelectorProps {
  onClose: () => void;
  onSelect: (provider: string, model: string) => void;
  currentProvider?: string;
  currentModel?: string;
}

export default function ModelSelector({ onClose, onSelect, currentProvider, currentModel }: ModelSelectorProps) {
  const providers = useConfigStore((s) => s.providers);
  const modelCatalog = useConfigStore((s) => s.modelCatalog);
  const modelCatalogLoading = useConfigStore((s) => s.modelCatalogLoading);
  const modelCatalogError = useConfigStore((s) => s.modelCatalogError);
  const visionFilterEnabled = useConfigStore((s) => s.visionFilterEnabled);
  const fetchModelCatalog = useConfigStore((s) => s.fetchModelCatalog);
  const loadCachedModelCatalog = useConfigStore((s) => s.loadCachedModelCatalog);
  const setVisionFilter = useConfigStore((s) => s.setVisionFilter);

  const [search, setSearch] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(currentProvider ?? null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load cached catalog on mount, then fetch fresh in background
  useEffect(() => {
    loadCachedModelCatalog();
    fetchModelCatalog(false);
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Build combined model list: configured models enriched with catalog info,
  // plus catalog-only models when searching
  const allModels = buildModelList(providers, modelCatalog, search.trim());

  // Apply filters: provider + search + vision
  let filtered = allModels;

  if (selectedProvider && !search.trim()) {
    filtered = filtered.filter((m) => m.provider === selectedProvider);
  }

  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (m) =>
        m.model.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.catalogEntry?.name?.toLowerCase().includes(q)
    );
  }

  if (visionFilterEnabled) {
    filtered = filtered.filter((m) => m.catalogEntry?.supports_vision);
  }

  // Group by provider
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = [];
    acc[m.provider].push(m);
    return acc;
  }, {});

  const handleSelect = useCallback(
    (provider: string, model: string) => {
      onSelect(provider, model);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleRefresh = useCallback(() => {
    fetchModelCatalog(true);
  }, [fetchModelCatalog]);

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)" }}>
              Select Model
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* Vision filter toggle */}
              <button
                onClick={() => setVisionFilter(!visionFilterEnabled)}
                style={{
                  ...chipStyle,
                  background: visionFilterEnabled ? "var(--color-accent-subtle)" : "var(--color-surface)",
                  color: visionFilterEnabled ? "var(--color-accent)" : "var(--color-text-secondary)",
                  borderColor: visionFilterEnabled ? "var(--color-accent)" : "var(--color-border)",
                }}
                title="Show only vision-capable models"
              >
                <Camera size={12} /> Vision
              </button>
              {/* Refresh catalog */}
              <button
                onClick={handleRefresh}
                disabled={modelCatalogLoading}
                style={{
                  ...chipStyle,
                  opacity: modelCatalogLoading ? 0.5 : 1,
                }}
                title="Refresh model catalog from OpenRouter"
              >
                <RefreshCw size={12} className={modelCatalogLoading ? "spin" : ""} />
              </button>
            </div>
          </div>
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models or providers..."
            style={searchInputStyle}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
          />
          {/* Catalog status */}
          {modelCatalogError && !modelCatalog && (
            <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <AlertTriangle size={11} /> Catalog unavailable — showing configured models only
            </div>
          )}
          {modelCatalog && (
            <div style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 4 }}>
              {modelCatalog.models.length} models · updated {formatRelativeTime(modelCatalog.fetched_at)}
            </div>
          )}
        </div>

        {/* Provider tabs (when not searching) */}
        {!search.trim() && (
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "8px 12px",
              borderBottom: "1px solid var(--color-border)",
              overflow: "auto",
            }}
          >
            <button
              onClick={() => setSelectedProvider(null)}
              style={{
                ...providerTabStyle,
                background: !selectedProvider ? "var(--color-accent-subtle)" : "transparent",
                color: !selectedProvider ? "var(--color-accent)" : "var(--color-text-secondary)",
                fontWeight: !selectedProvider ? 600 : 400,
              }}
            >
              All
            </button>
            {providers.map((p) => (
              <button
                key={p.name}
                onClick={() => setSelectedProvider(p.name)}
                style={{
                  ...providerTabStyle,
                  background: selectedProvider === p.name ? "var(--color-accent-subtle)" : "transparent",
                  color: selectedProvider === p.name ? "var(--color-accent)" : "var(--color-text-secondary)",
                  fontWeight: selectedProvider === p.name ? 600 : 400,
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {/* Model list */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {Object.entries(grouped).length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
              {search.trim()
                ? "No matching models"
                : visionFilterEnabled
                ? "No vision-capable models found"
                : "No models configured"}
            </div>
          ) : (
            Object.entries(grouped).map(([provider, models]) => (
              <div key={provider}>
                <div
                  style={{
                    padding: "8px 12px 4px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--color-text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {provider}
                </div>
                {models.map((m) => {
                  const isSelected = currentProvider === m.provider && currentModel === m.model;
                  return (
                    <div
                      key={`${m.provider}/${m.model}`}
                      onClick={() => handleSelect(m.provider, m.model)}
                      style={{
                        padding: "8px 12px 8px 16px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: isSelected ? "var(--color-accent-subtle)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--color-surface)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 500 }}>
                          {m.catalogEntry?.name || m.model}
                        </span>
                        {/* Capability badges */}
                        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                          {m.catalogEntry?.supports_vision && (
                            <span style={badgeVisionStyle}>
                              <Eye size={10} /> Vision
                            </span>
                          )}
                          {m.catalogEntry?.context_length && m.catalogEntry.context_length > 0 && (
                            <span style={badgeStyle}>
                              {formatContextLength(m.catalogEntry.context_length)}
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <span style={{ fontSize: 11, color: "var(--color-accent)", fontWeight: 600, flexShrink: 0 }}>
                          Current
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 12px",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "6px 14px",
              border: "none",
              borderRadius: "var(--radius-button)",
              background: "var(--color-surface)",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────

interface EnrichedModel {
  provider: string;
  model: string;
  baseUrl: string;
  catalogEntry?: ModelCatalogEntry;
}

function buildModelList(
  providers: { name: string; models: string[]; base_url: string }[],
  catalog: { models: ModelCatalogEntry[] } | null,
  searchQuery: string = ""
): EnrichedModel[] {
  const catalogMap = new Map<string, ModelCatalogEntry>();
  if (catalog) {
    for (const entry of catalog.models) {
      catalogMap.set(entry.id, entry);
    }
  }

  // Start with configured provider models
  const configuredModels = providers.flatMap((p) =>
    p.models.map((m) => ({
      provider: p.name,
      model: m,
      baseUrl: p.base_url,
      catalogEntry: catalogMap.get(m),
    }))
  );

  // When searching, also include matching catalog models not already configured
  if (searchQuery && catalog) {
    const configuredKeys = new Set(
      configuredModels.map((m) => `${m.provider}/${m.model}`)
    );
    const q = searchQuery.toLowerCase();

    for (const entry of catalog.models) {
      // Check if this catalog model matches the search
      const matchesSearch =
        entry.id.toLowerCase().includes(q) ||
        entry.name.toLowerCase().includes(q);
      if (!matchesSearch) continue;

      // Find the best matching provider for this catalog model
      // For OpenRouter-style IDs (provider/model), match to openrouter provider
      for (const p of providers) {
        const key = `${p.name}/${entry.id}`;
        if (configuredKeys.has(key)) continue; // already in list

        // Include catalog model under this provider
        configuredModels.push({
          provider: p.name,
          model: entry.id,
          baseUrl: p.base_url,
          catalogEntry: entry,
        });
      }
    }
  }

  return configuredModels;
}

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return "";
  }
}

function formatContextLength(length: number): string {
  if (length >= 1_000_000) return `${(length / 1_000_000).toFixed(0)}M ctx`;
  if (length >= 1000) return `${(length / 1000).toFixed(0)}K ctx`;
  return `${length} ctx`;
}

// ─── Styles ─────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.3)",
};

const modalStyle: React.CSSProperties = {
  width: 520,
  maxHeight: "75vh",
  background: "var(--color-bg-elevated)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-bg)",
  color: "var(--color-text-primary)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
};

const providerTabStyle: React.CSSProperties = {
  padding: "4px 10px",
  border: "none",
  borderRadius: 12,
  cursor: "pointer",
  fontSize: 11,
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

const chipStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 3,
  padding: "3px 8px",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  background: "var(--color-surface)",
  color: "var(--color-text-secondary)",
  cursor: "pointer",
  fontSize: 11,
  fontFamily: "inherit",
};

const badgeStyle: React.CSSProperties = {
  fontSize: 10,
  padding: "1px 5px",
  borderRadius: 6,
  background: "var(--color-surface)",
  color: "var(--color-text-tertiary)",
  lineHeight: 1.3,
};

const badgeVisionStyle: React.CSSProperties = {
  ...badgeStyle,
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
  background: "rgba(10, 132, 255, 0.1)",
  color: "var(--color-accent)",
};
