/// Slash command registry — mirrors `SlashCommandRegistry.swift`

export interface CommandResult {
  text?: string;
  segment?: import("../lib/types").MessageSegment;
}

export type SlashCommandHandler = (args: string) => string | void;
export type SegmentBuilder = (args: string) => import("../lib/types").MessageSegment | null;


export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  handler?: SlashCommandHandler;
  /** If present, the command produces a structured segment rather than raw text. */
  segmentBuilder?: (args: string) => import("../lib/types").MessageSegment | null;
}

// Default commands
const builtins: SlashCommand[] = [
  {
    name: "help",
    description: "Show available commands and their usage",
    usage: "/help",
    handler: () => [
      "## MathMate Commands",
      "",
      "| Command | Description |",
      "|---|---|",
      "| `/help` | Show this help |",
      "| `/compact` | Summarize conversation into a compact version |",
      "| `/compact restore` | Restore the full conversation from a compacted one |",
      "| `/problem` | Open hint ladder for a problem statement |",
    ].join("\n"),
  },
  {
    name: "compact",
    description: "Summarize the conversation",
    usage: "/compact [restore]",
    handler: (args) => {
      if (args.trim() === "restore") {
        return "Restoring full conversation from compacted state...";
      }
      return "Compacting conversation...";
    },
  },
  {
    name: "problem",
    description: "Open the hint ladder widget for a problem statement",
    usage: "/problem <problem statement or paste>",
    segmentBuilder: (args) => {
      const trimmed = args.trim();
      if (!trimmed) return null;
      return {
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        type: "hint-ladder",
        problem: trimmed,
        attempt: "",
        hints: [],
        hintsRevealed: 0,
        solved: null,
        hintsUsed: 0,
      } as import("../lib/types").MessageSegment;
    },
  },
  {
    name: "practice",
    description: "Open the practice page for problem sessions",
    usage: "/practice",
    handler: () => {
      // Navigate to practice page — handled by chatStore router integration
      return "Opening practice page...";
    },
  },
  {
    name: "critique",
    description: "Open the proof critique panel",
    usage: "/critique [problem statement]",
    handler: (args) => {
      // Open proof critique panel — handled by critiqueStore integration
      import("../stores/critiqueStore").then(({ useCritiqueStore }) => {
        useCritiqueStore.getState().openCritiquePanel(args.trim() || "", "");
      });
      return args.trim()
        ? "Opening proof critique with problem context..."
        : "Opening proof critique panel...";
    },
  },
];

export function getCommands(): SlashCommand[] {
  return [...builtins];
}

export function findCommand(input: string): SlashCommand | null {
  if (!input.startsWith("/")) return null;
  const parts = input.slice(1).split(/\s+/);
  const name = parts[0].toLowerCase();
  return getCommands().find((c) => c.name === name) ?? null;
}

export function executeCommand(input: string): CommandResult | string | void {
  const cmd = findCommand(input);
  if (!cmd) return;
  const args = input.slice(cmd.name.length + 2); // past "/cmd "
  
  // If the command has a segmentBuilder, use it
  if (cmd.segmentBuilder) {
    const segment = cmd.segmentBuilder(args);
    if (segment) {
      return { segment };
    }
    return { text: undefined };
  }
  
  return cmd.handler?.(args);
}
