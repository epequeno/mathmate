import SwiftUI

// MARK: - Model Selector Popover

struct ModelSelectorView: View {
    @Bindable var viewModel: ChatViewModel
    @Binding var isPresented: Bool

    @State private var query = ""
    @FocusState private var searchFocused: Bool
    @State private var focusedIndex: Int? = nil

    private var enabledProviders: [ProviderConfig] {
        viewModel.currentProviders.filter { $0.enabled }
    }

    /// Flat list of all filtered model entries for keyboard navigation.
    private var flatModels: [(provider: String, model: String)] {
        let allModels = viewModel.availableModels
        let enabled = allModels.filter { entry in
            enabledProviders.contains(where: { $0.name == entry.provider })
        }
        // Apply vision filter when enabled — only show models that support image inputs
        let withVisionFilter: [(provider: String, model: String)]
        if viewModel.filterVisionModels {
            withVisionFilter = enabled.filter { ModelVisionRegistry.supportsVision(model: $0.model) }
        } else {
            withVisionFilter = enabled
        }
        guard !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return withVisionFilter
        }
        let q = query.lowercased()
        return withVisionFilter.filter {
            $0.model.lowercased().contains(q) ||
            $0.provider.lowercased().contains(q)
        }
    }

    /// Models grouped by provider name, maintaining display order.
    private var groupedModels: [(provider: ProviderConfig, models: [(provider: String, model: String)])] {
        let filtered = flatModels
        var groups: [(ProviderConfig, [(String, String)])] = []
        for provider in enabledProviders {
            let models = filtered.filter { $0.provider == provider.name }
            if !models.isEmpty {
                groups.append((provider, models))
            }
        }
        return groups
    }

    var body: some View {
        ScrollViewReader { proxy in
        VStack(spacing: 0) {
            // Search field
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.textTertiary)

                TextField("Search models…", text: $query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .focused($searchFocused)
                    .onKeyPress(keys: [.upArrow, .downArrow, .return, .escape], phases: .down) { event in
                        handleKeyPress(event, proxy: proxy) ? .handled : .ignored
                    }
                    .onChange(of: query) { _, _ in
                        focusedIndex = nil
                    }

                if !query.isEmpty {
                    Button {
                        query = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 12))
                            .foregroundColor(AppTheme.textTertiary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(EdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 14))
            .background(AppTheme.background)

            // Vision filter indicator
            if viewModel.filterVisionModels {
                HStack(spacing: 4) {
                    Image(systemName: "eye")
                        .font(.system(size: 9))
                        .foregroundColor(AppTheme.textTertiary)
                    Text("Vision-capable models only • \(flatModels.count) shown")
                        .font(.system(size: 10))
                        .foregroundColor(AppTheme.textTertiary)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.accent.opacity(0.06))
            }

            Divider()
                .foregroundColor(AppTheme.border)

            // Model list
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(groupedModels, id: \.provider.name) { group in
                        providerGroupView(provider: group.provider, models: group.models)
                    }
                }
            }
            .frame(maxHeight: 400)
        }
        } // ScrollViewReader
        .frame(minWidth: 360, idealWidth: 360, maxWidth: 360)
        .background(AppTheme.surface)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(AppTheme.border, lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.18), radius: 32, x: 0, y: 8)
        .shadow(color: Color.black.opacity(0.10), radius: 8, x: 0, y: 2)
        .onAppear {
            searchFocused = true
        }
    }

    // MARK: - Key Handling

    @discardableResult
    private func handleKeyPress(_ event: KeyPress, proxy: ScrollViewProxy) -> Bool {
        let count = flatModels.count
        guard count > 0 else { return event.key == .escape ? { isPresented = false; return true }() : false }

        switch event.key {
        case .upArrow:
            if let current = focusedIndex {
                if current > 0 {
                    focusedIndex = current - 1
                } else {
                    focusedIndex = nil
                }
            } else {
                focusedIndex = count - 1
            }
            scrollToFocused(proxy: proxy)
            return true

        case .downArrow:
            if let current = focusedIndex {
                focusedIndex = min(current + 1, count - 1)
            } else {
                focusedIndex = 0
            }
            scrollToFocused(proxy: proxy)
            return true

        case .return:
            if let index = focusedIndex {
                selectModel(at: index)
                return true
            }
            return false

        case .escape:
            isPresented = false
            return true

        default:
            return false
        }
    }

    private func scrollToFocused(proxy: ScrollViewProxy) {
        guard let index = focusedIndex else { return }
        // Use the flat model ID as the anchor
        let entry = flatModels[index]
        withAnimation(.easeInOut(duration: 0.15)) {
            proxy.scrollTo(entry.model, anchor: .center)
        }
    }

    private func selectModel(at index: Int) {
        guard index >= 0 && index < flatModels.count else { return }
        let entry = flatModels[index]
        viewModel.selectModel(provider: entry.provider, model: entry.model)
        isPresented = false
    }

    // MARK: - Provider Group

    private func providerGroupView(provider: ProviderConfig, models: [(provider: String, model: String)]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Group header
            HStack(spacing: 6) {
                // Status dot
                Circle()
                    .fill(provider.apiKey != nil ? AppTheme.green : AppTheme.border)
                    .frame(width: 8, height: 8)

                Text(provider.name)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(AppTheme.textPrimary)

                if provider.apiKey == nil {
                    Text("no key set")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(AppTheme.textTertiary)
                }

                Spacer()
            }
            .padding(EdgeInsets(top: 10, leading: 14, bottom: 6, trailing: 14))

            // Model rows
            ForEach(models, id: \.model) { entry in
                modelRow(entry: entry, provider: provider)
            }

            // Separator between groups
            Divider()
                .foregroundColor(AppTheme.border)
                .padding(.leading, 14)
        }
    }

    // MARK: - Model Row

    private func modelRow(entry: (provider: String, model: String), provider: ProviderConfig) -> some View {
        let isSelected = viewModel.selectedModel?.model == entry.model &&
                         viewModel.selectedModel?.provider == entry.provider
        let isConfigured = provider.apiKey != nil
        let modelName = entry.model.components(separatedBy: "/").last ?? entry.model
        let pricing = ModelPricing.lookup(model: entry.model)

        // Check if this row is keyboard-focused
        let isFocused = flatModels.firstIndex(where: { $0.provider == entry.provider && $0.model == entry.model }) == focusedIndex

        return Button {
            selectModel(at: flatModels.firstIndex(where: { $0.provider == entry.provider && $0.model == entry.model }) ?? 0)
        } label: {
            HStack(spacing: 0) {
                // Model info
                VStack(alignment: .leading, spacing: 2) {
                    // Line 1: model name + provider chip
                    HStack(spacing: 6) {
                        Text(modelName)
                            .font(.system(size: 13))
                            .foregroundColor(isSelected ? .white : (isConfigured ? AppTheme.textPrimary : AppTheme.textTertiary))

                        Text(entry.provider)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(isSelected ? Color.white.opacity(0.5) : AppTheme.textSecondary)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(
                                isSelected
                                    ? Color.white.opacity(0.12)
                                    : AppTheme.backgroundElevated
                            )
                            .cornerRadius(4)
                    }

                    // Line 2: context window + pricing
                    HStack(spacing: 4) {
                        Text("\(formatContextWindow(pricing.contextWindow)) ctx")
                            .font(.system(size: 11))
                            .foregroundColor(isSelected ? Color.white.opacity(0.55) : AppTheme.textTertiary)
                        Text("·")
                            .font(.system(size: 11))
                            .foregroundColor(AppTheme.textMuted)
                        Text("$\(String(format: "%.2f", pricing.input))/M in · $\(String(format: "%.2f", pricing.output))/M out")
                            .font(.system(size: 11))
                            .foregroundColor(isSelected ? Color.white.opacity(0.55) : AppTheme.textTertiary)
                    }
                }

                Spacer()

                // Keyboard focus indicator
                if isFocused {
                    Image(systemName: "arrowtriangle.right.fill")
                        .font(.system(size: 8))
                        .foregroundColor(AppTheme.accent.opacity(0.6))
                }

                // Checkmark for selected
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color.white.opacity(0.8))
                }
            }
            .padding(EdgeInsets(top: 8, leading: 14, bottom: 8, trailing: 14))
            .background {
                if isFocused && !isSelected {
                    AppTheme.accent.opacity(0.08)
                } else if isSelected {
                    AppTheme.accentFill
                } else {
                    Color.clear
                }
            }
            .cornerRadius(6)
            .padding(.horizontal, 8)
            .opacity(isConfigured ? 1.0 : 0.45)
        }
        .buttonStyle(.plain)
        .disabled(!isConfigured)
        .id(entry.model)
    }

    // MARK: - Formatting

    private func formatContextWindow(_ window: Int) -> String {
        if window >= 1_000_000 {
            return "\(window / 1_000_000)M"
        } else if window >= 1_000 {
            return "\(window / 1_000)k"
        }
        return "\(window)"
    }
}