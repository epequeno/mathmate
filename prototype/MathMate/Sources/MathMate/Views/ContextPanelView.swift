import SwiftUI

// MARK: - Context Panel View

struct ContextPanelView: View {
    @Bindable var viewModel: ChatViewModel

    private var totalPromptTokens: Int {
        viewModel.cachedPromptTokens
    }

    private var totalCompletionTokens: Int {
        viewModel.cachedCompletionTokens
    }

    private var totalReasoningTokens: Int {
        viewModel.cachedReasoningTokens
    }

    private var totalTokens: Int {
        viewModel.cachedTotalTokens
    }

    private var contextLimit: Int {
        guard let model = viewModel.currentModel else { return viewModel.contextLimit }
        return ModelPricing.lookup(model: model).contextWindow
    }

    /// Whether the session has already consumed more tokens than the currently
    /// selected model's context window allows.
    private var contextOverflow: Bool {
        contextLimit > 0 && totalTokens > contextLimit
    }

    /// How many tokens over the limit (positive when overflowing, 0 otherwise).
    private var overflowTokens: Int {
        max(totalTokens - contextLimit, 0)
    }

    private var fillFraction: Double {
        guard contextLimit > 0 else { return 0 }
        return min(Double(totalTokens) / Double(contextLimit), 1.0)
    }

    private var allToolEvents: [ToolEvent] {
        viewModel.messages.flatMap { $0.toolEvents }
    }

    private var sentImageCount: Int {
        viewModel.messages.reduce(0) { $0 + $1.images.count }
    }

    @State private var storedMemoryCount: Int = 0
    @State private var storedFactCount: Int = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // Header
                Text("CONTEXT & USAGE")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                    .textCase(.uppercase)
                    .kerning(0.04 * 11)
                    .padding(EdgeInsets(top: 14, leading: 16, bottom: 8, trailing: 16))

                // 1. Context Window Section
                contextWindowSection
                    .padding(.bottom, 16)

                Divider()
                    .foregroundColor(AppTheme.border)

                // 2. Token Breakdown Section
                tokenBreakdownSection
                    .padding(.bottom, 16)

                Divider()
                    .foregroundColor(AppTheme.border)

                // 3. Session Cost Section
                sessionCostSection
                    .padding(.bottom, 16)

                Divider()
                    .foregroundColor(AppTheme.border)

                // 4. Tool Calls Section
                toolCallsSection
                    .padding(.bottom, 16)

                Divider()
                    .foregroundColor(AppTheme.border)

                // 5. Memory Section
                memorySection
                    .padding(.bottom, 16)

                Divider()
                    .foregroundColor(AppTheme.border)

                // 6. Attachments Section
                attachmentsSection
                    .padding(.bottom, 16)

                Divider()
                    .foregroundColor(AppTheme.border)

                // 7. Per Message Section
                perMessageSection
                    .padding(.bottom, 16)
            }
        }
        .frame(width: 272)
        .background(AppTheme.backgroundElevated)
        .task {
            await refreshMemoryCounts()
        }
    }

    // MARK: - Memory

    private var memorySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("MEMORY")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppTheme.textSecondary)
                .textCase(.uppercase)
                .kerning(0.04 * 11)
                .padding(.horizontal, 16)

            // Enable toggle
            HStack {
                Text("Injection")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.textPrimary)
                Spacer()
                Toggle("", isOn: Binding(
                    get: { viewModel.memoryEnabled },
                    set: { viewModel.memoryEnabled = $0 }
                ))
                .controlSize(.small)
            }
            .padding(.horizontal, 16)

            // Max items stepper
            HStack {
                Text("Max items per turn")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.textPrimary)
                Spacer()
                Stepper("\(viewModel.maxMemoryItems)",
                    value: Binding(
                        get: { viewModel.maxMemoryItems },
                        set: { viewModel.maxMemoryItems = $0 }
                    ),
                    in: 1...20
                )
                .controlSize(.small)
                .font(.system(size: 11, weight: .medium))
            }
            .padding(.horizontal, 16)

            // Stored counts
            HStack {
                Text("Stored items")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.textPrimary)
                Spacer()
                Text("\(storedMemoryCount) memories · \(storedFactCount) facts")
                    .font(.system(size: 11))
                    .foregroundColor(AppTheme.textSecondary)
            }
            .padding(.horizontal, 16)

            // Last-turn indicator (conceptual — exact injected count is complex to track)
            if !viewModel.memoryEnabled {
                Text("Memory injection is disabled. Use /memory, /remember, /forget to manage stored items.")
                    .font(.system(size: 10))
                    .foregroundColor(AppTheme.textTertiary)
                    .padding(.horizontal, 16)
            }
        }
    }

    private func refreshMemoryCounts() async {
        let store = viewModel.memoryStore
        storedMemoryCount = (try? await store.countItems()) ?? 0
        storedFactCount = (try? await store.countFacts()) ?? 0
    }

    // MARK: - Context Window

    private var contextWindowSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("CONTEXT WINDOW")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppTheme.textSecondary)
                .textCase(.uppercase)
                .kerning(0.04 * 11)
                .padding(.horizontal, 16)

            // Overflow warning banner
            if contextOverflow {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 10))
                        .foregroundColor(AppTheme.red)
                    Text("Context overflow by \(overflowTokens) tokens — the selected model's \(contextLimit) context window is smaller than the \(totalTokens) tokens already used. Oldest messages will be dropped.")
                        .font(.system(size: 10))
                        .foregroundColor(AppTheme.red)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(AppTheme.red.opacity(0.08))
                .cornerRadius(6)
                .padding(.horizontal, 16)
            }

            // Fill bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    // Track
                    RoundedRectangle(cornerRadius: 3)
                        .fill(AppTheme.border)
                        .frame(height: 6)

                    // Fill
                    RoundedRectangle(cornerRadius: 3)
                        .fill(contextOverflow ? AppTheme.red : AppTheme.accent)
                        .frame(width: max(geo.size.width * fillFraction, 0), height: 6)
                }
            }
            .frame(height: 6)
            .padding(.horizontal, 16)

            // Stats row
            HStack {
                Text("\(totalTokens) / \(contextLimit)")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(AppTheme.textPrimary)
                Spacer()
                if contextOverflow {
                    Text("OVERFLOW")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(AppTheme.red)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(AppTheme.red.opacity(0.12))
                        .cornerRadius(3)
                } else {
                    Text("\(Int(fillFraction * 100))%")
                        .font(.system(size: 12))
                        .foregroundColor(AppTheme.textSecondary)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    // MARK: - Token Breakdown

    private var tokenBreakdownSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TOKENS")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppTheme.textSecondary)
                .textCase(.uppercase)
                .kerning(0.04 * 11)
                .padding(.horizontal, 16)

            // Stacked mini-bar
            GeometryReader { geo in
                let total = max(totalTokens, 1)
                let promptW = CGFloat(totalPromptTokens) / CGFloat(total) * geo.size.width
                let completionW = CGFloat(totalCompletionTokens) / CGFloat(total) * geo.size.width
                let reasoningW = CGFloat(totalReasoningTokens) / CGFloat(total) * geo.size.width

                HStack(spacing: 0) {
                    if totalPromptTokens > 0 {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(AppTheme.accent)
                            .frame(width: max(promptW, 0), height: 4)
                    }
                    if totalCompletionTokens > 0 {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(AppTheme.green)
                            .frame(width: max(completionW, 0), height: 4)
                    }
                    if totalReasoningTokens > 0 {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(AppTheme.amber)
                            .frame(width: max(reasoningW, 0), height: 4)
                    }
                }
            }
            .frame(height: 4)
            .padding(.horizontal, 16)

            // Token breakdown rows
            VStack(spacing: 4) {
                tokenRow(label: "Prompt", value: totalPromptTokens, color: AppTheme.accent)
                tokenRow(label: "Completion", value: totalCompletionTokens, color: AppTheme.green)
                if totalReasoningTokens > 0 {
                    tokenRow(label: "Reasoning", value: totalReasoningTokens, color: AppTheme.amber)
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func tokenRow(label: String, value: Int, color: Color) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text(label)
                .font(.system(size: 12))
                .foregroundColor(AppTheme.textPrimary)
            Spacer()
            Text("\(value)")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(AppTheme.textSecondary)
        }
    }

    // MARK: - Session Cost

    private var sessionCostSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("SESSION COST")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppTheme.textSecondary)
                .textCase(.uppercase)
                .kerning(0.04 * 11)
                .padding(.horizontal, 16)

            HStack {
                Text("$\(String(format: "%.4f", viewModel.estimatedCost))")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(AppTheme.textPrimary)

                Spacer()

                if let model = viewModel.currentModel {
                    let pricing = ModelPricing.lookup(model: model)
                    Text("$\(String(format: "%.2f", pricing.input))/M in · $\(String(format: "%.2f", pricing.output))/M out")
                        .font(.system(size: 10))
                        .foregroundColor(AppTheme.textTertiary)
                }
            }
            .padding(.horizontal, 16)

            if let model = viewModel.currentModel {
                HStack {
                    Text("Model")
                        .font(.system(size: 11))
                        .foregroundColor(AppTheme.textSecondary)
                    Spacer()
                    Text(model.components(separatedBy: "/").last ?? model)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(AppTheme.textPrimary)
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // MARK: - Tool Calls

    private var toolCallsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TOOL CALLS")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppTheme.textSecondary)
                .textCase(.uppercase)
                .kerning(0.04 * 11)
                .padding(.horizontal, 16)

            if allToolEvents.isEmpty {
                Text("No tool calls in this session")
                    .font(.system(size: 11))
                    .foregroundColor(AppTheme.textTertiary)
                    .padding(.horizontal, 16)
            } else {
                VStack(spacing: 6) {
                    ForEach(aggregatedToolCalls(), id: \.name) { aggregated in
                        HStack(spacing: 6) {
                            Image(systemName: icon(for: aggregated.status))
                                .font(.system(size: 10))
                                .foregroundColor(color(for: aggregated.status))
                            Text(aggregated.name)
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.textPrimary)
                            Spacer()
                            Text("×\(aggregated.count)")
                                .font(.system(size: 11))
                                .foregroundColor(AppTheme.textSecondary)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private struct AggregatedToolCall {
        let name: String
        let status: ToolEvent.Status
        let count: Int
    }

    private func aggregatedToolCalls() -> [AggregatedToolCall] {
        Dictionary(grouping: allToolEvents, by: { $0.toolName })
            .map { name, events in
                // Use the status of the most recent event of this name
                let status = events.last?.status ?? .pending
                return AggregatedToolCall(name: name, status: status, count: events.count)
            }
            .sorted { $0.name < $1.name }
    }

    private func icon(for status: ToolEvent.Status) -> String {
        switch status {
        case .pending: return "clock"
        case .running: return "gearshape.2"
        case .success: return "checkmark.circle.fill"
        case .failure: return "xmark.octagon.fill"
        }
    }

    private func color(for status: ToolEvent.Status) -> Color {
        switch status {
        case .pending: return AppTheme.amber
        case .running: return .accentColor
        case .success: return AppTheme.green
        case .failure: return AppTheme.red
        }
    }

    // MARK: - Attachments

    private var attachmentsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("ATTACHMENTS")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppTheme.textSecondary)
                .textCase(.uppercase)
                .kerning(0.04 * 11)
                .padding(.horizontal, 16)

            let pending = viewModel.pendingImages.count
            let sent = sentImageCount
            let total = pending + sent

            if total == 0 {
                Text("No images in this session")
                    .font(.system(size: 11))
                    .foregroundColor(AppTheme.textTertiary)
                    .padding(.horizontal, 16)
            } else {
                VStack(spacing: 4) {
                    HStack {
                        Text("Sent")
                            .font(.system(size: 12))
                            .foregroundColor(AppTheme.textPrimary)
                        Spacer()
                        Text("\(sent)")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(AppTheme.textSecondary)
                    }
                    if pending > 0 {
                        HStack {
                            Text("Pending")
                                .font(.system(size: 12))
                                .foregroundColor(AppTheme.amber)
                            Spacer()
                            Text("\(pending)")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(AppTheme.amber)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // MARK: - Per Message

    private var perMessageSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PER MESSAGE")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppTheme.textSecondary)
                .textCase(.uppercase)
                .kerning(0.04 * 11)
                .padding(.horizontal, 16)

            if viewModel.messages.isEmpty {
                Text("No messages yet")
                    .font(.system(size: 11))
                    .foregroundColor(AppTheme.textTertiary)
                    .padding(.horizontal, 16)
            } else {
                VStack(spacing: 2) {
                    ForEach(viewModel.messages.reversed()) { message in
                        CompactMessageTokenRow(message: message)
                    }
                }
                .padding(.horizontal, 8)
            }
        }
    }
}

// MARK: - Compact Message Token Row

struct CompactMessageTokenRow: View {
    let message: Message

    private var totalTokens: Int {
        (message.tokenUsage?.promptTokens ?? 0) +
        (message.tokenUsage?.completionTokens ?? 0) +
        (message.tokenUsage?.reasoningTokens ?? 0)
    }

    var body: some View {
        HStack(spacing: 6) {
            // Label
            Text(message.isUser ? "You" : "Assistant")
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(AppTheme.textPrimary)
                .lineLimit(1)

            Spacer()

            // Token count
            if totalTokens > 0 {
                Text("\(totalTokens)")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(AppTheme.textSecondary)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1)
                    .background(AppTheme.border)
                    .cornerRadius(4)
            } else {
                Text("0")
                    .font(.system(size: 11))
                    .foregroundColor(AppTheme.textTertiary)
            }
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(message.isUser ? Color.clear : AppTheme.background.opacity(0.5))
        .cornerRadius(4)
    }
}