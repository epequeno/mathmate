/**
 * PracticePage.tsx — Phase 16B
 *
 * Full practice session flow:
 * 1. Problem picker with topic/difficulty/source filters
 * 2. Active problem view with hint ladder integration
 * 3. Outcome recording
 * 4. Problem attempt log
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Shuffle, Clock, Check, X, Lightbulb, Play, RotateCcw, BarChart3 } from "lucide-react";
import { ProblemBank } from "../lib/api/problemBank";
import { HintLadderWidget } from "../components/chat/HintLadderWidget";
import { useChatStore } from "../stores/chatStore";
import { useConfigStore } from "../stores/configStore";
import { useProjectStore } from "../stores/projectStore";
import { useCritiqueStore } from "../stores/critiqueStore";
import ProofCritiquePanel from "../components/chat/ProofCritiquePanel";
import { renderMarkdown } from "../lib/renderMarkdown";
import { sanitize } from "../lib/sanitize";
import type {
  CompProblem,
  ProblemFilter,
  ProblemTopic,
  DifficultyTier,
  ProblemSource,
  AttemptOutcome,
  ProblemAttempt,
  AttemptStats,
} from "../lib/types";

// ─── Constants ────────────────────────────────────────────────────────

const TOPICS: { value: ProblemTopic; label: string }[] = [
  { value: "Algebra", label: "Algebra" },
  { value: "Combinatorics", label: "Combinatorics" },
  { value: "Geometry", label: "Geometry" },
  { value: "NumberTheory", label: "Number Theory" },
  { value: "Inequalities", label: "Inequalities" },
  { value: "FunctionalEquations", label: "Functional Equations" },
  { value: "Probability", label: "Probability" },
];

const DIFFICULTIES: { value: DifficultyTier; label: string }[] = [
  { value: "Amc", label: "AMC" },
  { value: "Aime", label: "AIME" },
  { value: "UsamoEasy", label: "USAMO Easy" },
  { value: "UsamoHard", label: "USAMO Hard" },
  { value: "ImoEasy", label: "IMO Easy" },
  { value: "ImoHard", label: "IMO Hard" },
];

const SOURCES: { value: ProblemSource; label: string }[] = [
  { value: "Imo", label: "IMO" },
  { value: "Usamo", label: "USAMO" },
  { value: "Aime", label: "AIME" },
  { value: "Amc", label: "AMC" },
  { value: "Putnam", label: "Putnam" },
];

const TIMER_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 900, label: "15 min" },
  { value: 1800, label: "30 min" },
  { value: 2700, label: "45 min" },
  { value: 3600, label: "60 min" },
];

type Phase = "picker" | "working" | "outcome" | "done";

// ─── PracticePage ─────────────────────────────────────────────────────

export default function PracticePage() {
  const navigate = useNavigate();

  // ── Filter state ──────────────────────────────────────────────────
  const [selectedTopics, setSelectedTopics] = useState<ProblemTopic[]>([]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<DifficultyTier[]>([]);
  const [selectedSources, setSelectedSources] = useState<ProblemSource[]>([]);
  const [problems, setProblems] = useState<CompProblem[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<AttemptStats | null>(null);

  // ── Session state ─────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("picker");
  const [problem, setProblem] = useState<CompProblem | null>(null);
  const [timerDuration, setTimerDuration] = useState(1800);
  const [timeRemaining, setTimeRemaining] = useState(1800);
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [scratch, setScratch] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintLadderAttempt, setHintLadderAttempt] = useState("");
  const [hintLoading, setHintLoading] = useState(false);
  const [attempts, setAttempts] = useState<ProblemAttempt[]>([]);

  // ── Outcome state ─────────────────────────────────────────────────
  const [outcome, setOutcome] = useState<AttemptOutcome>("Solved");
  const [outcomeNotes, setOutcomeNotes] = useState("");

  // ── Timer effect ──────────────────────────────────────────────────
  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => {
      setTimeRemaining((t) => {
        if (t <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return t - 1;
      });
      setElapsedSeconds((e) => e + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerRunning]);

  // ── Load problems on mount ───────────────────────────────────────
  useEffect(() => {
    loadProblems();
    loadAttempts();
  }, []);

  const loadProblems = useCallback(async () => {
    setLoading(true);
    try {
      const filter: ProblemFilter = {};
      if (selectedTopics.length > 0) filter.topics = selectedTopics;
      if (selectedDifficulties.length > 0) filter.difficulties = selectedDifficulties;
      if (selectedSources.length > 0) filter.sources = selectedSources;
      const result = await ProblemBank.list(filter);
      setProblems(result || []);
    } catch (err) {
      console.error("Failed to load problems:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedTopics, selectedDifficulties, selectedSources]);

  const loadAttempts = useCallback(async () => {
    try {
      const result = await ProblemBank.listAttempts();
      setAttempts(result || []);
    } catch {}
    try {
      const s = await ProblemBank.getStats();
      setStats(s);
    } catch {}
  }, []);

  // ── Random pick ──────────────────────────────────────────────────
  const handleRandom = useCallback(async () => {
    setLoading(true);
    try {
      const filter: ProblemFilter = {};
      if (selectedTopics.length > 0) filter.topics = selectedTopics;
      if (selectedDifficulties.length > 0) filter.difficulties = selectedDifficulties;
      if (selectedSources.length > 0) filter.sources = selectedSources;
      // Exclude solved problems
      const solvedIds = attempts.filter((a) => a.outcome === "Solved").map((a) => a.problem_id);
      if (solvedIds.length > 0) filter.exclude_ids = solvedIds;
      filter.limit = 1;
      const result = await ProblemBank.random(filter);
      if (result) {
        setProblem(result);
        setPhase("working");
        setScratch("");
        setHints([]);
        setHintsRevealed(0);
        setHintsUsed(0);
        setHintLadderAttempt("");
        setTimeRemaining(timerDuration);
        setElapsedSeconds(0);
        setTimerRunning(false);
      }
    } catch (err) {
      console.error("Failed to pick random problem:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedTopics, selectedDifficulties, selectedSources, attempts, timerDuration]);

  // ── Timer controls ────────────────────────────────────────────────
  const toggleTimer = useCallback(() => {
    if (timerDuration === 0) return;
    setTimerRunning((r) => !r);
  }, [timerDuration]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // ── Hint ladder handlers ──────────────────────────────────────────
  const handleGenerateHints = useCallback(
    async (problemStatement: string, attempt: string): Promise<string[]> => {
      setHintLoading(true);
      try {
        const store = useChatStore.getState();
        const model = store.model || store.currentSession?.header.model || "";
        const providerName = store.provider || store.currentSession?.header.provider || "";
        const configStore = useConfigStore.getState();
        const provider =
          configStore.providers.find((p) => p.name === providerName) ?? configStore.providers[0];

        if (!provider) throw new Error("No API provider configured");

        const { generateHintLadder } = await import("../lib/hintLadder");
        const result = await generateHintLadder(problemStatement, attempt, model, provider);
        const newHints = result.hints;
        setHints(newHints);
        setHintsRevealed(1);
        return newHints;
      } catch (err: any) {
        throw err;
      } finally {
        setHintLoading(false);
      }
    },
    [],
  );

  const handleHintLadderOutcome = useCallback(
    (solved: boolean, used: number) => {
      setHintsUsed(used);
    },
    [],
  );

  const handleHintLadderUpdate = useCallback(
    (updated: Partial<{ hints: string[]; hintsRevealed: number; solved: boolean | null; hintsUsed: number }>) => {
      if (updated.hints) setHints(updated.hints);
      if (updated.hintsRevealed !== undefined) setHintsRevealed(updated.hintsRevealed);
      if (updated.hintsUsed !== undefined) setHintsUsed(updated.hintsUsed);
    },
    [],
  );

  // ── Submit outcome ────────────────────────────────────────────────
  const handleSubmitOutcome = useCallback(async () => {
    if (!problem) return;

    const attempt: ProblemAttempt = {
      problem_id: problem.id,
      session_id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      elapsed_seconds: elapsedSeconds,
      outcome,
      hints_used: hintsUsed,
      notes: outcomeNotes,
    };

    try {
      await ProblemBank.saveAttempt(attempt);

      // Also generate a vault note if a vault is configured
      const project = useProjectStore.getState().currentProject;
      const vaultPath = project?.vaults?.[0]?.path || project?.vault_path;
      if (vaultPath) {
        ProblemBank.saveAttemptNote({
          problemId: problem.id,
          source: problem.source,
          year: problem.year,
          number: problem.number,
          difficulty: problem.difficulty,
          topics: problem.topics,
          statement: problem.statement,
          outcome,
          hintsUsed,
          elapsedSeconds,
          notes: outcomeNotes || "(no notes recorded)",
          vaultPath,
        }).catch((err) => console.error("Failed to save attempt note:", err));
      }

      setPhase("done");
      loadAttempts();
      loadProblems();
    } catch (err) {
      console.error("Failed to save attempt:", err);
    }
  }, [problem, elapsedSeconds, outcome, hintsUsed, outcomeNotes, loadAttempts, loadProblems]);

  // ── Styling ───────────────────────────────────────────────────────
  const containerStyle: React.CSSProperties = {
    padding: "24px 32px",
    maxWidth: 900,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  };

  const cardStyle: React.CSSProperties = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    padding: 16,
  };

  const btnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    border: "1px solid var(--color-border)",
    borderRadius: 6,
    background: "var(--color-bg)",
    color: "var(--color-text-primary)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };

  const primaryBtnStyle: React.CSSProperties = {
    ...btnStyle,
    background: "var(--color-accent)",
    color: "#fff",
    border: "none",
  };

  const badgeStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
  };

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={containerStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <BarChart3 size={18} />
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Practice</h1>

        {/* Stats badge */}
        {stats && (
          <span
            style={{
              ...badgeStyle,
              background: "var(--color-accent-subtle)",
              color: "var(--color-accent)",
              marginLeft: "auto",
            }}
          >
            {stats.total_attempted} solved · {stats.solved}/{stats.total_attempted} ({stats.total_attempted > 0 ? Math.round((stats.solved / stats.total_attempted) * 100) : 0}%)
          </span>
        )}

        <button onClick={() => navigate("/chat")} style={btnStyle}>
          <X size={12} />
          Back to Chat
        </button>
      </div>

      {phase === "picker" && (
        <>
          {/* ── Filters ──────────────────────── */}
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Filters</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {/* Topics */}
              <div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 4 }}>Topic</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {TOPICS.map((t) => (
                    <ChipButton
                      key={t.value}
                      label={t.label}
                      selected={selectedTopics.includes(t.value)}
                      onClick={() =>
                        setSelectedTopics((prev) =>
                          prev.includes(t.value) ? prev.filter((x) => x !== t.value) : [...prev, t.value],
                        )
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 4 }}>Difficulty</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {DIFFICULTIES.map((d) => (
                    <ChipButton
                      key={d.value}
                      label={d.label}
                      selected={selectedDifficulties.includes(d.value)}
                      onClick={() =>
                        setSelectedDifficulties((prev) =>
                          prev.includes(d.value) ? prev.filter((x) => x !== d.value) : [...prev, d.value],
                        )
                      }
                    />
                  ))}
                </div>
              </div>

              {/* Source */}
              <div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 4 }}>Source</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {SOURCES.map((s) => (
                    <ChipButton
                      key={s.value}
                      label={s.label}
                      selected={selectedSources.includes(s.value)}
                      onClick={() =>
                        setSelectedSources((prev) =>
                          prev.includes(s.value) ? prev.filter((x) => x !== s.value) : [...prev, s.value],
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Timer selector */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
              <Clock size={13} />
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Timer:</span>
              <select
                value={timerDuration}
                onChange={(e) => setTimerDuration(Number(e.target.value))}
                style={{
                  padding: "4px 8px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 4,
                  fontSize: 12,
                  background: "var(--color-bg)",
                }}
              >
                {TIMER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Action buttons ────────────── */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleRandom} style={primaryBtnStyle} disabled={loading}>
              {loading ? (
                "Loading…"
              ) : (
                <>
                  <Shuffle size={14} />
                  Random Problem
                </>
              )}
            </button>
            <button onClick={loadProblems} style={btnStyle} disabled={loading}>
              <RotateCcw size={12} />
              Refresh{loading ? "ing…" : ""}
            </button>
          </div>

          {/* ── Available problems ──────────── */}
          {problems.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                Available problems ({problems.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {problems.slice(0, 20).map((p) => {
                  const attempted = attempts.find((a) => a.problem_id === p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setProblem(p);
                        setPhase("working");
                        setScratch("");
                        setHints([]);
                        setHintsRevealed(0);
                        setHintsUsed(0);
                        setHintLadderAttempt("");
                        setTimeRemaining(timerDuration);
                        setElapsedSeconds(0);
                        setTimerRunning(false);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{p.id}</span>
                      <DifficultyBadge difficulty={p.difficulty} />
                      <span style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>
                        {p.source} {p.year} · P{p.number}
                      </span>
                      {attempted && (
                        <span style={{ marginLeft: "auto" }}>
                          <OutcomeIcon outcome={attempted.outcome} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Problem log ─────────────────── */}
          {attempts.length > 0 && <ProblemLogSection attempts={attempts} />}
        </>
      )}

      {phase === "working" && problem && (
        <>
          {/* ── Active problem ────────────────── */}
          <div style={cardStyle}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span>
                {problem.source} {problem.year}, Problem {problem.number}
              </span>
              <DifficultyBadge difficulty={problem.difficulty} />
              {problem.topics.map((t) => (
                <span key={t} style={{ ...badgeStyle, background: "var(--color-bg)", color: "var(--color-text-secondary)" }}>
                  {t}
                </span>
              ))}

              {/* Timer */}
              {timerDuration > 0 && (
                <span
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: timerRunning && timeRemaining < 60 ? "var(--color-red)" : "var(--color-text-primary)",
                  }}
                >
                  <Clock size={13} />
                  {formatTime(timeRemaining)}
                  <button
                    onClick={toggleTimer}
                    style={{
                      ...btnStyle,
                      padding: "3px 8px",
                      fontSize: 11,
                    }}
                  >
                    {timerRunning ? <X size={10} /> : <Play size={10} />}
                  </button>
                </span>
              )}
            </div>

            {/* Problem statement */}
            <div
              className="markdown-body"
              style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}
              dangerouslySetInnerHTML={{
                __html: sanitize(renderMarkdown(problem.statement)),
              }}
            />

            {/* Hint ladder */}
            {phase === "working" && (
              <div style={{ marginBottom: 16 }}>
                <HintLadderWidget
                  segment={{
                    id: "practice",
                    ts: new Date().toISOString(),
                    type: "hint-ladder",
                    problem: problem.statement,
                    attempt: hintLadderAttempt,
                    hints,
                    hintsRevealed,
                    solved: null,
                    hintsUsed,
                  }}
                  onUpdate={(updated) => {
                    if (updated.attempt !== undefined) setHintLadderAttempt(updated.attempt);
                    if (updated.hints) setHints(updated.hints);
                    if (updated.hintsRevealed !== undefined) setHintsRevealed(updated.hintsRevealed);
                    if (updated.hintsUsed !== undefined) setHintsUsed(updated.hintsUsed);
                  }}
                  onGenerateHints={handleGenerateHints}
                  onOutcome={handleHintLadderOutcome}
                />
              </div>
            )}

            {/* Scratch area */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Scratch / Working
              </div>
              <textarea
                value={scratch}
                onChange={(e) => setScratch(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 80,
                  padding: "8px 10px",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  background: "var(--color-bg)",
                  color: "var(--color-text-primary)",
                  fontSize: 13,
                  fontFamily: "monospace",
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                placeholder="Write your working here..."
              />
            </div>

            {/* Submit button */}
            <button
              onClick={() => setPhase("outcome")}
              style={primaryBtnStyle}
            >
              Submit Attempt
            </button>
          </div>
        </>
      )}

      {phase === "outcome" && problem && (
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Record Outcome</div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {([
              { value: "Solved" as AttemptOutcome, label: "Solved", icon: Check },
              { value: "PartialProgress" as AttemptOutcome, label: "Partial", icon: Lightbulb },
              { value: "Stuck" as AttemptOutcome, label: "Stuck", icon: X },
              { value: "GaveUp" as AttemptOutcome, label: "Gave Up", icon: X },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setOutcome(opt.value)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  border: `1px solid ${outcome === opt.value ? "var(--color-accent)" : "var(--color-border)"}`,
                  borderRadius: 6,
                  background: outcome === opt.value ? "var(--color-accent-subtle)" : "transparent",
                  color: "var(--color-text-primary)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <opt.icon size={12} />
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-tertiary)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Notes (optional)
            </div>
            <textarea
              value={outcomeNotes}
              onChange={(e) => setOutcomeNotes(e.target.value)}
              style={{
                width: "100%",
                minHeight: 64,
                padding: "8px 10px",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                background: "var(--color-bg)",
                fontSize: 13,
                fontFamily: "inherit",
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
              placeholder="Summarize your key insight or where you got stuck..."
            />
          </div>

          <div style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12 }}>
            <span>Time: {formatTime(elapsedSeconds)}</span>
            <span>·</span>
            <span>Hints used: {hintsUsed}</span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSubmitOutcome} style={primaryBtnStyle}>
              <Check size={13} />
              Save &amp; Done
            </button>
            <button onClick={() => setPhase("working")} style={btnStyle}>
              Back to Problem
            </button>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div style={{ ...cardStyle, textAlign: "center", padding: 32 }}>
          <Check size={24} style={{ color: "#22c55e", marginBottom: 8 }} />
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Attempt Saved</div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16 }}>
            {outcome === "Solved" ? "Great work!" : "Keep practicing — review what you learned."}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => setPhase("picker")} style={primaryBtnStyle}>
              <Shuffle size={13} />
              Another Problem
            </button>
            <button
              onClick={() => useCritiqueStore.getState().openCritiquePanel(problem?.statement || "", scratch)}
              style={btnStyle}
            >
              Critique my proof
            </button>
            <button onClick={() => navigate("/overview")} style={btnStyle}>
              <BarChart3 size={13} />
              View Stats
            </button>
          </div>
        </div>
      )}
      <ProofCritiquePanel />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function ChipButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "3px 8px",
        border: `1px solid ${selected ? "var(--color-accent)" : "var(--color-border)"}`,
        borderRadius: 4,
        background: selected ? "var(--color-accent-subtle)" : "transparent",
        color: selected ? "var(--color-accent)" : "var(--color-text-secondary)",
        fontSize: 11,
        fontWeight: selected ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: DifficultyTier }) {
  const colors: Record<DifficultyTier, string> = {
    Amc: "#22c55e",
    Aime: "#3b82f6",
    UsamoEasy: "#f59e0b",
    UsamoHard: "#f97316",
    ImoEasy: "#ef4444",
    ImoHard: "#dc2626",
  };
  const badgeStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
  };
  return (
    <span
      style={{
        ...badgeStyle,
        background: `${colors[difficulty]}1a`,
        color: colors[difficulty],
      }}
    >
      {difficulty}
    </span>
  );
}

function OutcomeIcon({ outcome }: { outcome: AttemptOutcome }) {
  if (outcome === "Solved") return <Check size={12} color="#22c55e" />;
  if (outcome === "PartialProgress") return <Lightbulb size={12} color="#f59e0b" />;
  return <X size={12} color="#ef4444" />;
}

function ProblemLogSection({ attempts }: { attempts: ProblemAttempt[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          padding: "10px 14px",
          border: "none",
          background: "none",
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-text-primary)",
        }}
      >
        Problem Log ({attempts.length} attempts)
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--color-text-tertiary)" }}>
          {expanded ? "Hide" : "Show"}
        </span>
      </button>
      {expanded && (
        <div style={{ padding: "0 14px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {attempts.map((a, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 6px",
                borderRadius: 4,
                fontSize: 12,
                color: "var(--color-text-secondary)",
              }}
            >
              <OutcomeIcon outcome={a.outcome} />
              <span style={{ fontWeight: 600 }}>{a.problem_id}</span>
              <span>{new Date(a.timestamp).toLocaleDateString()}</span>
              <span>· {a.elapsed_seconds}s</span>
              {a.hints_used > 0 && <span>· {a.hints_used} hint{a.hints_used !== 1 ? "s" : ""}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}