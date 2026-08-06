/// Message types mirroring the Rust/Swift session format.

export interface ContentPart {
  type: "text" | "image";
  text?: string;
  url?: string;
  mime?: string;
  data?: string;
}

// ─── Timeline segment types (Phase 12A) ──────────────────────

export type ToolCallStatus = "pending" | "running" | "completed" | "error";

export type MessageSegment =
  | {
      id: string;
      ts: string;
      type: "thinking";
      content: string;
    }
  | {
      id: string;
      ts: string;
      type: "tool_call";
      tool_name: string;
      arguments: Record<string, unknown>;
      call_id: string;
      status: ToolCallStatus;
    }
  | {
      id: string;
      ts: string;
      type: "tool_result";
      call_id: string;
      result: unknown;
      is_error: boolean;
    }
  | {
      id: string;
      ts: string;
      type: "content";
      text: string;
    }
  | {
      id: string;
      ts: string;
      type: "hint-ladder";
      problem: string;
      attempt: string;
      hints: string[];
      hintsRevealed: number;
      solved: boolean | null;
      hintsUsed: number;
    }
  // Phase 16D — Proof Critique
  | ProofCritiqueSegment;

export interface CritiqueItem {
  location: string;
  issue: string;
  confidence?: "high" | "medium" | "low";
  suggestion?: string;
}

export interface ProofCritiqueSegment {
  id: string;
  ts: string;
  type: "proof-critique";
  problem: string;
  proof: string;
  focus: "full" | "logic" | "style";
  model_used: string;
  logic_gaps: CritiqueItem[];
  double_check: CritiqueItem[];
  style: CritiqueItem[];
  overall: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  segments: MessageSegment[];
  content: ContentPart[];
  created_at?: string;
  flags?: Record<string, string | boolean>;
  /** Legacy thinking field — use segments with type "thinking" instead */
  thinking?: string;
  /** For role="tool" messages: the ID of the tool call this result satisfies */
  tool_call_id?: string;
}

export interface SessionHeader {
  id: string;
  title: string;
  model: string;
  provider: string;
  created_at: string;
  updated_at: string;
  project_id?: string;
  tutor_style?: string;
  flags?: Record<string, string | boolean>;
  hints_used?: number;
  solved?: boolean;
}

export interface Session {
  header: SessionHeader;
  messages: Message[];
}

export interface StreamChunk {
  text?: string;
  thinking?: string;
  tool_call_delta?: {
    index: number;
    call_id_part?: string;
    tool_name_part?: string;
    arguments_part?: string;
  };
  tool_call_deltas?: {
    index: number;
    call_id_part?: string;
    tool_name_part?: string;
    arguments_part?: string;
  }[];
  tool_call_complete?: {
    call_id: string;
    tool_name: string;
    arguments: Record<string, unknown>;
  };
  tool_result?: {
    call_id: string;
    result: unknown;
    is_error?: boolean;
  };
  done?: boolean;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export function makeMessage(role: "user" | "assistant" | "system", text: string): Message {
  return {
    id: crypto.randomUUID(),
    role,
    segments: [],
    content: [{ type: "text", text }],
    created_at: new Date().toISOString(),
  };
}

/**
 * Create a MessageSegment with auto-generated id and timestamp.
 */
export function makeSegment(kind: { type: "thinking"; content: string }): MessageSegment;
export function makeSegment(kind: { type: "tool_call"; tool_name: string; arguments: Record<string, unknown>; call_id: string; status: ToolCallStatus }): MessageSegment;
export function makeSegment(kind: { type: "tool_result"; call_id: string; result: unknown; is_error: boolean }): MessageSegment;
export function makeSegment(kind: { type: "content"; text: string }): MessageSegment;
export function makeSegment(kind: { type: "hint-ladder"; problem: string; attempt: string; hints: string[]; hintsRevealed: number; solved: boolean | null; hintsUsed: number }): MessageSegment;
export function makeSegment(kind: { type: "proof-critique"; problem: string; proof: string; focus: "full" | "logic" | "style"; model_used: string; logic_gaps: CritiqueItem[]; double_check: CritiqueItem[]; style: CritiqueItem[]; overall: string }): MessageSegment;
export function makeSegment(kind: Record<string, unknown>): MessageSegment {
  return {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    ...kind,
  } as MessageSegment;
}

/**
 * Adapter: derive segments from legacy message fields when segments is empty.
 * This ensures old sessions (pre-Phase 12) render correctly in the timeline UI.
 */
export function adaptLegacyMessage(msg: Message): MessageSegment[] {
  if (msg.segments && msg.segments.length > 0) {
    // If msg.thinking exists but no thinking segment is present in the stored
    // segments (can happen when thinking + tool calls were saved in separate
    // fields), prepend a thinking segment so the trace is always visible.
    const hasThinkingSeg = msg.segments.some((s) => s.type === "thinking");
    if (msg.thinking && !hasThinkingSeg) {
      return [makeSegment({ type: "thinking", content: msg.thinking }), ...msg.segments];
    }
    return msg.segments;
  }

  const segs: MessageSegment[] = [];

  // Legacy thinking field → thinking segment
  if (msg.thinking) {
    segs.push(makeSegment({ type: "thinking", content: msg.thinking }));
  }

  // Legacy content parts → content segment(s)
  for (const part of msg.content) {
    if (part.type === "text" && part.text) {
      segs.push(makeSegment({ type: "content", text: part.text }));
    }
  }

  return segs;
}

export function makeSessionHeader(overrides?: Partial<SessionHeader>): SessionHeader {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "New Session",
    model: "",
    provider: "",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ─── Project types ──────────────────────────────

// ─── Vault multi-vault types (Phase 15E) ─────────────────────────────

export type VaultKind = "synapse" | "legacy" | "classroom";

export interface VaultRef {
  id: string;
  name: string;
  path: string;
  kind: VaultKind;
  read_only: boolean;
  position: number;
}

// ─── Project ───────────────────────────────────

export interface MathProject {
  id: string;
  name: string;
  vault_path?: string;  // deprecated; prefer vaults + active_vault_id
  vaults: VaultRef[];
  active_vault_id?: string;
  textbook_path?: string;
  default_model?: string;
  tutor_style?: string;
  schema_version?: number;
  created_at: string;
  updated_at: string;
}

// ─── Vault types ────────────────────────────────

export interface VaultNote {
  path: string;
  filename: string;
  title: string;
  tags: string[];
  created_at?: string;
  modified_at?: string;
  size_bytes: number;
}

// ─── Memory types ───────────────────────────────

export interface MemoryItem {
  id: string;
  session_id?: string;
  source_type: string;
  unit_type: string;
  content: string;
  score: number;
  created_at: string;
  tags: string[];
  provenance?: string;
  scan_status?: string;
  scan_reason?: string;
}

// ─── Wrap-up types ──────────────────────────────

export interface WrapUpResult {
  session_id: string;
  title: string;
  study_log_path?: string;
  content: string;
  created_at: string;
}

// ─── Textbook types ─────────────────────────────────

export interface TextbookMetadata {
  path: string;
  title?: string;
  file_size_bytes: number;
  page_count?: number;
}

// ─── Free Textbook Catalog types ────────────────

export interface TextbookCatalogEntry {
  id: string;
  title: string;
  authors: string[];
  edition?: string;
  subject: TextbookSubject;
  publisher?: string;
  license: TextbookLicense;
  description: string;
  thumbnail_url?: string;
  download_urls: TextbookDownloads;
  file_size_hint?: number;
  page_count_hint?: number;
  recommended_for?: string[];
}

export interface TextbookDownloads {
  pdf?: string;
  epub?: string;
  html?: string;
}

export type TextbookSubject =
  | "algebra"
  | "calculus"
  | "statistics"
  | "linear-algebra"
  | "differential-equations"
  | "geometry"
  | "trigonometry"
  | "discrete-math"
  | "probability"
  | "physics"
  | "number-theory"
  | "abstract-algebra"
  | "real-analysis"
  | "other"
  // Competition prep subjects (Phase 16C)
  | "olympiad-general"
  | "olympiad-geometry"
  | "olympiad-algebra"
  | "olympiad-number-theory"
  | "olympiad-combinatorics";

export type TextbookLicense =
  | "cc-by"
  | "cc-by-sa"
  | "cc-by-nc"
  | "cc-by-nc-sa"
  | "cc-by-nd"
  | "cc-by-nc-nd"
  | "gpl"
  | "mit"
  | "free-online"
  | "other";

export interface TextbookLicenseInfo {
  license: TextbookLicense;
  label: string;
  url?: string;
  attribution_required: boolean;
  description: string;
}

export interface DownloadResult {
  catalog_id: string;
  title: string;
  local_path: string;
  file_size_bytes: number;
}

// ─── Model Catalog types ────────────────────────

export interface ModelPricing {
  prompt: string;
  completion: string;
  image?: string;
}

export interface ModelCatalogEntry {
  id: string;
  name: string;
  supports_vision: boolean;
  context_length: number;
  pricing?: ModelPricing;
}

export interface ModelCatalog {
  fetched_at: string;
  models: ModelCatalogEntry[];
}

// ─── Problem Bank types (Phase 16B) ─────────────

export type ProblemSource = "Imo" | "Usamo" | "Aime" | "Amc" | "Putnam" | "Custom";
export type DifficultyTier = "Amc" | "Aime" | "UsamoEasy" | "UsamoHard" | "ImoEasy" | "ImoHard";
export type ProblemTopic = "Combinatorics" | "NumberTheory" | "Algebra" | "Geometry" | "Inequalities" | "FunctionalEquations" | "Probability" | "Other";
export type AttemptOutcome = "Solved" | "PartialProgress" | "Stuck" | "GaveUp";

export interface ProblemFilter {
  topics?: ProblemTopic[];
  difficulties?: DifficultyTier[];
  sources?: ProblemSource[];
  exclude_ids?: string[];
  limit?: number;
}

export interface CompProblem {
  id: string;
  source: ProblemSource;
  year: number;
  number: number;
  difficulty: DifficultyTier;
  topics: ProblemTopic[];
  statement: string;
  answer: string | null;
  solution_sketch: string | null;
}

export interface ProblemAttempt {
  problem_id: string;
  session_id: string;
  timestamp: string;
  elapsed_seconds: number;
  outcome: AttemptOutcome;
  hints_used: number;
  notes: string;
}

export interface TopicStat {
  topic: string;
  attempted: number;
  solved: number;
}

export interface AttemptStats {
  total_attempted: number;
  solved: number;
  partial: number;
  stuck: number;
  gave_up: number;
  by_topic: TopicStat[];
}
