/// Slash command registry — mirrors `SlashCommandRegistry.swift`

export type SlashCommandHandler = (args: string) => string | void;

export interface SlashCommand {
  name: string;
  description: string;
  usage: string;
  handler?: SlashCommandHandler;
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

export function executeCommand(input: string): string | void {
  const cmd = findCommand(input);
  if (!cmd?.handler) return;
  const args = input.slice(cmd.name.length + 2); // past "/cmd "
  return cmd.handler(args);
}
