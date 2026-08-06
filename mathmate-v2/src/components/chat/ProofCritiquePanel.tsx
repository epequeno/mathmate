// ProofCritiquePanel.tsx — Phase 16D
//
// Submission form for proof critique:
// - Problem statement (pre-filled from practice session)
// - Proof attempt textarea
// - Feedback focus selector (Full / Logic / Style)
// - Model recommendation nudge (recommend Gemini 2.5 Pro)
// - Submit button that calls generateCritique() via streamChat

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useChatStore } from "../../stores/chatStore";
import { useConfigStore } from "../../stores/configStore";
import { useProjectStore } from "../../stores/projectStore";
import { useCritiqueStore } from "../../stores/critiqueStore";
import { streamChat, buildPayload } from "../../lib/providers";
import { makeMessage } from "../../lib/types";
import type { CritiqueItem, ProofCritiqueSegment } from "../../lib/types";
import { Sessions } from "../../lib/api";
import styles from "./ProofCritiquePanel.module.css";

// ─── Gemini 2.5 Pro identifier ───────────────────────────────────────

const GEMINI_PRO_MODEL = "google/gemini-2.5-pro-preview-05-06";

// ─── Critique prompt ──────────────────────────────────────────────────

function buildCritiquePrompt(problem: string, proof: string, focus: string): string {
  return `You are critiquing an olympiad math proof attempt. Your job is to identify potential issues — not to confirm the proof is correct.

<problem>${problem}</problem>

<proof>${proof}</proof>

Focus: ${focus}

Return JSON only, no other text:
{
  "logic_gaps": [
    {
      "location": "brief description of where in the proof",
      "issue": "what might be wrong or missing",
      "confidence": "high | medium | low"
    }
  ],
  "double_check": [
    {
      "location": "...",
      "issue": "..."
    }
  ],
  "style": [
    {
      "location": "...",
      "suggestion": "..."
    }
  ],
  "overall": "one sentence summary"
}

Rules:
- Do NOT say the proof is correct. Only flag things to check.
- Flag every "it is clear that", "obviously", "trivially", "it follows that" as needing justification.
- Flag every implicit step — if something needs justification, say so.
- Keep each item to 1-2 sentences.
- If you cannot find issues, return empty arrays — do not invent them.
- Do not write the corrected proof.`;
}

// ─── JSON parser ──────────────────────────────────────────────────────

function parseCritiqueResponse(raw: string): {
  logic_gaps: CritiqueItem[];
  double_check: CritiqueItem[];
  style: CritiqueItem[];
  overall: string;
} {
  // Try to extract JSON from code block
  let jsonStr = raw;
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Try strict JSON parse
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      logic_gaps: Array.isArray(parsed.logic_gaps) ? parsed.logic_gaps : [],
      double_check: Array.isArray(parsed.double_check) ? parsed.double_check : [],
      style: Array.isArray(parsed.style) ? parsed.style : [],
      overall: typeof parsed.overall === "string" ? parsed.overall : "No overall summary provided.",
    };
  } catch {
    // Fallback: simple text extraction
    return {
      logic_gaps: [{ location: "(see critique text)", issue: raw.slice(0, 500), confidence: "low" }],
      double_check: [],
      style: [],
      overall: "Critique response could not be parsed into structured format. See raw text above.",
    };
  }
}

// ─── Component ────────────────────────────────────────────────────────

export default function ProofCritiquePanel() {
  const { showCritiquePanel, prefilledProblem, prefilledProof, closeCritiquePanel } = useCritiqueStore();
  const sessionId = useChatStore((s) => s.currentSession?.header.id);
  const currentSession = useChatStore((s) => s.currentSession);

  const [problem, setProblem] = useState(prefilledProblem);
  const [proof, setProof] = useState(prefilledProof);
  const [focus, setFocus] = useState<"full" | "logic" | "style">("full");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProofCritiqueSegment | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update from prefilled values when panel opens
  useEffect(() => {
    if (showCritiquePanel) {
      setProblem(prefilledProblem);
      setProof(prefilledProof);
      setFocus("full");
      setLoading(false);
      setError(null);
      setResult(null);
      // Focus the proof textarea after a tick
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [showCritiquePanel, prefilledProblem, prefilledProof]);

  // ── Model check for nudge ──────────────────────────────────────
  const currentModel = useChatStore((s) => s.model) || currentSession?.header.model || "";
  const currentProviderName = useChatStore((s) => s.provider) || currentSession?.header.provider || "";
  const isOnGeminiPro = currentModel === GEMINI_PRO_MODEL;
  const isOnGeminiProvider = currentProviderName === "google" || currentProviderName.includes("gemini");

  // ── Submit ─────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!proof.trim()) {
      setError("Please enter a proof to critique.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const store = useChatStore.getState();
      const model = store.model || store.currentSession?.header.model || "";
      const providerName = store.provider || store.currentSession?.header.provider || "";
      const configStore = useConfigStore.getState();
      const provider = configStore.providers.find((p) => p.name === providerName) ?? configStore.providers[0];

      if (!provider) {
        throw new Error("No API provider configured");
      }

      const prompt = buildCritiquePrompt(problem || "(no problem statement provided)", proof, focus);
      const payload = buildPayload([{ role: "user", content: [{ type: "text", text: prompt }] }]);

      let accumulated = "";
      const abortController = new AbortController();

      for await (const chunk of streamChat(payload, model, provider, abortController.signal)) {
        if (chunk.text) accumulated += chunk.text;
      }

      const parsed = parseCritiqueResponse(accumulated);

      const critiqueSegment: ProofCritiqueSegment = {
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        type: "proof-critique",
        problem: problem || "(no problem statement provided)",
        proof,
        focus,
        model_used: model,
        logic_gaps: parsed.logic_gaps,
        double_check: parsed.double_check,
        style: parsed.style,
        overall: parsed.overall,
      };

      // Save to session as an assistant message
      if (sessionId) {
        const assistantMsg = makeMessage("assistant", "");
        assistantMsg.segments = [critiqueSegment];
        const updated = await Sessions.append(sessionId, assistantMsg);
        const chatStore = (await import("../../stores/chatStore")).useChatStore.getState();
        chatStore.openSession(sessionId);
      }

      setResult(critiqueSegment);
      closeCritiquePanel();
    } catch (err: any) {
      setError(err?.message || "Failed to generate critique. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [problem, proof, focus, sessionId, closeCritiquePanel]);

  if (!showCritiquePanel) return null;

  return createPortal(
    <div className={styles.overlay} onClick={closeCritiquePanel}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>⚖ Proof Critique</span>
          <button className={styles.closeBtn} onClick={closeCritiquePanel}>
            ✕
          </button>
        </div>

        {/* Problem field */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Problem (optional — context for critique)</label>
          <textarea
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="Paste the problem statement here..."
            className={styles.textarea}
            rows={3}
          />
        </div>

        {/* Proof field */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Your proof</label>
          <textarea
            ref={textareaRef}
            value={proof}
            onChange={(e) => setProof(e.target.value)}
            placeholder="Write or paste your proof attempt here..."
            className={styles.textarea}
            rows={6}
          />
        </div>

        {/* Focus selector */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Feedback focus</label>
          <div className={styles.focusRow}>
            {([
              { value: "full" as const, label: "Full review" },
              { value: "logic" as const, label: "Logic only" },
              { value: "style" as const, label: "Style only" },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFocus(opt.value)}
                className={styles.focusBtn}
                style={{
                  borderColor: focus === opt.value ? "var(--color-accent)" : "var(--color-border)",
                  background: focus === opt.value ? "var(--color-accent-subtle)" : "transparent",
                  color: focus === opt.value ? "var(--color-accent)" : "var(--color-text-secondary)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Model recommendation nudge */}
        {sessionId && !isOnGeminiPro && !isOnGeminiProvider && (
          <div className={styles.nudge}>
            <span className={styles.nudgeIcon}>ℹ</span>
            <div className={styles.nudgeText}>
              Using <strong>{currentModel || currentProviderName}</strong>. For best results on proof logic,{' '}
              <strong>Gemini 2.5 Pro</strong> is strongly recommended (only model with ~25% accuracy on
              olympiad-level proof evaluation as of March 2025).
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className={styles.error}>
            <span>{error}</span>
          </div>
        )}

        {/* Submit button */}
        <div className={styles.actions}>
          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={loading || !proof.trim()}
          >
            {loading ? "Generating critique…" : "Submit for critique"}
          </button>
          <button className={styles.cancelBtn} onClick={closeCritiquePanel}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}