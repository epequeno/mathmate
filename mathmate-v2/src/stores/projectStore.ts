import { create } from "zustand";
import type { MathProject } from "../lib/types";

import { invoke } from "../lib/tauri";

interface SynapseStatus {
  running: boolean;
  vault_path: string | null;
  tool_count: number;
}

interface ProjectState {
  projects: MathProject[];
  archivedProjects: MathProject[];
  currentProject: MathProject | null;
  loading: boolean;
  hasProjects: boolean;
  synapseStatus: SynapseStatus;
  loadProjects: () => Promise<void>;
  loadArchivedProjects: () => Promise<void>;
  createProject: (opts: {
    name: string;
    vaultPath?: string;
    textbookPath?: string;
    defaultModel?: string;
    tutorStyle?: string;
  }) => Promise<MathProject>;
  updateProject: (project: MathProject) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  deleteProjectCascade: (id: string) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  unarchiveProject: (id: string) => Promise<void>;
  setCurrentProject: (project: MathProject | null) => void;
  startSynapse: () => Promise<void>;
  stopSynapse: () => Promise<void>;
  checkSynapseStatus: () => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  archivedProjects: [],
  currentProject: null,
  loading: false,
  hasProjects: false,
  synapseStatus: { running: false, vault_path: null, tool_count: 0 },

  loadProjects: async () => {
    const isFirstLoad = !get().hasProjects && !get().loading;
    if (isFirstLoad) {
      set({ loading: true });
      } else {
      }
    try {
      const projects = await invoke<MathProject[]>("list_projects");
      const hasProjects = projects.length > 0;
      set({ projects, hasProjects, loading: false });
      const current = get().currentProject;
      if (current) {
        // Keep currentProject in sync with the freshly loaded list so
        // any field changes (e.g. tutor_style) are immediately reflected in the UI.
        const refreshed = projects.find((p) => p.id === current.id);
        if (refreshed) {
          set({ currentProject: refreshed });
          if (refreshed.vault_path) {
            get().startSynapse();
          }
        }
      } else if (hasProjects) {
        // Auto-select first project when none is active
        const first = projects[0];
        set({ currentProject: first });
        // Auto-start Synapse if the selected project has a vault
        if (first?.vault_path) {
          get().startSynapse();
        }
      }
    } catch (err) {

      set({ loading: false, hasProjects: false });
    }
  },

  loadArchivedProjects: async () => {
    try {
      const projects = await invoke<MathProject[]>("list_archived_projects");
      set({ archivedProjects: projects });
    } catch (err) {
    }
  },

  createProject: async (opts) => {
    const project = await invoke<MathProject>("create_project", {
      name: opts.name,
      vaultPath: opts.vaultPath ?? null,
      textbookPath: opts.textbookPath ?? null,
      defaultModel: opts.defaultModel ?? null,
      tutorStyle: opts.tutorStyle ?? null,
    });
    await get().loadProjects();
    set({ currentProject: project });
    return project;
  },

  updateProject: async (project: MathProject) => {
    await invoke("update_project", { project });
    get().loadProjects();
  },

  deleteProject: async (id: string) => {
    await invoke("delete_project", { projectId: id });
    const { currentProject } = get();
    if (currentProject?.id === id) set({ currentProject: null });
    get().loadProjects();
  },

  deleteProjectCascade: async (id: string) => {
    await invoke("delete_project_cascade", { projectId: id });
    const { currentProject } = get();
    if (currentProject?.id === id) set({ currentProject: null });
    get().loadProjects();
    get().loadArchivedProjects();
  },

  archiveProject: async (id: string) => {
    await invoke("archive_project", { projectId: id });
    const { currentProject } = get();
    if (currentProject?.id === id) set({ currentProject: null });
    get().loadProjects();
    get().loadArchivedProjects();
  },

  unarchiveProject: async (id: string) => {
    await invoke("unarchive_project", { projectId: id });
    get().loadProjects();
    get().loadArchivedProjects();
  },

  setCurrentProject: (project: MathProject | null) => {
    // Stop Synapse when switching away from a vault project
    const prev = get().currentProject;
    if (prev?.vault_path) {
      invoke("stop_synapse_mcp").catch(() => {});
      set({ synapseStatus: { running: false, vault_path: null, tool_count: 0 } });
    }

    set({ currentProject: project });

    // Auto-start Synapse when switching to a project with a vault
    if (project?.vault_path) {
      get().startSynapse();
    }
  },

  startSynapse: async () => {
    const project = get().currentProject;
    if (!project?.vault_path) return;

    try {
      await invoke("start_synapse_mcp", { vaultPath: project.vault_path });
      await get().checkSynapseStatus();
    } catch (err) {
      console.warn("[synapse] Failed to start MCP:", err);
      set({ synapseStatus: { running: false, vault_path: null, tool_count: 0 } });
    }
  },

  stopSynapse: async () => {
    try {
      await invoke("stop_synapse_mcp");
    } catch (err) {
      console.warn("[synapse] Failed to stop MCP:", err);
    }
    set({ synapseStatus: { running: false, vault_path: null, tool_count: 0 } });
  },

  checkSynapseStatus: async () => {
    try {
      const status = await invoke<SynapseStatus>("synapse_mcp_status");
      set({ synapseStatus: status });
    } catch {
      set({ synapseStatus: { running: false, vault_path: null, tool_count: 0 } });
    }
  },
}));