import SwiftUI

/// A single slash command definition.
struct SlashCommand: Identifiable {
    let id = UUID()
    /// Primary command name (e.g. "/compact").
    let name: String
    /// Alternate names that also trigger this command.
    let aliases: [String]
    /// Short description shown in the popup.
    let description: String
    /// Optional hint text (e.g. "[restore]" or "<fact>").
    let hint: String?

    /// All trigger strings (name + aliases).
    var triggers: [String] { [name] + aliases }

    /// Whether this command matches the given query (typed after the slash, no leading "/").
    func matches(_ query: String) -> Bool {
        let q = query.lowercased()
        if q.isEmpty { return true }
        // Strip the leading "/" from each trigger before prefix-matching.
        return triggers.contains { $0.dropFirst().lowercased().hasPrefix(q) }
    }

    /// The display name to show — uses the first matching trigger (full name including "/").
    func displayName(for query: String) -> String {
        let q = query.lowercased()
        if q.isEmpty { return name }
        return triggers.first { $0.dropFirst().lowercased().hasPrefix(q) } ?? name
    }
}

/// Registry of all available slash commands.
enum SlashCommandRegistry {
    static let all: [SlashCommand] = [
        SlashCommand(
            name: "/compact",
            aliases: [],
            description: "Summarize older messages to free context",
            hint: "[restore]"
        ),
        SlashCommand(
            name: "/wrap-up",
            aliases: ["/wrapup", "/wrap"],
            description: "Generate session summary and save to vault",
            hint: nil
        ),
        SlashCommand(
            name: "/flags",
            aliases: [],
            description: "Show flagged content from this session",
            hint: "type:<type>"
        ),
        SlashCommand(
            name: "/remember",
            aliases: [],
            description: "Save a fact to long-term memory",
            hint: "<fact>"
        ),
        SlashCommand(
            name: "/forget",
            aliases: [],
            description: "Remove a memory fact",
            hint: "<fact>"
        ),
        SlashCommand(
            name: "/memory",
            aliases: [],
            description: "View current memory facts",
            hint: nil
        ),
        SlashCommand(
            name: "/help",
            aliases: [],
            description: "Show available commands",
            hint: nil
        ),
    ]

    /// Filter commands by the typed query (text after "/").
    static func filter(_ query: String) -> [SlashCommand] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return all }
        return all.filter { $0.matches(trimmed) }
    }
}

/// Popup overlay that appears when the user types "/" in the chat input.
struct SlashCommandPopup: View {
    /// The text typed after the "/" (e.g. "com" for "/compact").
    let query: String
    /// Called when the user selects a command. Passes the full command name.
    let onSelect: (String) -> Void
    /// Called to dismiss the popup (Escape or click outside).
    let onDismiss: () -> Void
    /// Keyboard-driven selection index, owned by the parent so arrow keys in the
    /// text field can drive it without the popup needing focus.
    @Binding var selectedIndex: Int

    private let commands: [SlashCommand]

    init(
        query: String,
        selectedIndex: Binding<Int>,
        onSelect: @escaping (String) -> Void,
        onDismiss: @escaping () -> Void
    ) {
        self.query = query
        self._selectedIndex = selectedIndex
        self.onSelect = onSelect
        self.onDismiss = onDismiss
        self.commands = SlashCommandRegistry.filter(query)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Commands")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.secondary)
                Spacer()
                Text("\(commands.count)")
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color(nsColor: .controlBackgroundColor).opacity(0.95))

            Divider()

            // Command list
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(commands.enumerated()), id: \.element.id) { index, cmd in
                        commandRow(cmd, index: index)
                    }
                }
            }
            .frame(maxHeight: 240)
        }
        .background(.ultraThinMaterial)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color(nsColor: .separatorColor), lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(0.15), radius: 8, y: 4)
        .frame(width: 340)
        .onAppear {
            selectedIndex = 0
        }
    }

    private func commandRow(_ cmd: SlashCommand, index: Int) -> some View {
        let isSelected = index == selectedIndex
        let displayName = cmd.displayName(for: query)

        return Button {
            onSelect(displayName)
        } label: {
            HStack(spacing: 8) {
                // Command name
                Text(displayName)
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                    .foregroundColor(isSelected ? .white : .primary)

                // Hint
                if let hint = cmd.hint {
                    Text(hint)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(isSelected ? .white.opacity(0.6) : .secondary)
                }

                Spacer()

                // Description
                Text(cmd.description)
                    .font(.system(size: 11))
                    .foregroundStyle(isSelected ? AnyShapeStyle(.white.opacity(0.7)) : AnyShapeStyle(.tertiary))
                    .lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isSelected ? Color.accentColor : Color.clear)
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            if hovering {
                selectedIndex = index
            }
        }
    }
}
