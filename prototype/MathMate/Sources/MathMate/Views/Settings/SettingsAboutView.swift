import SwiftUI

// MARK: - About Settings

struct SettingsAboutView: View {
    @State private var isRefreshing = false
    @State private var refreshResult: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // App info
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Image(systemName: "book.closed")
                        .font(.system(size: 32))
                        .foregroundColor(AppTheme.accent)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("MathMate")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(AppTheme.textPrimary)

                        Text("Version 1.0.0")
                            .font(.system(size: 13))
                            .foregroundColor(AppTheme.textSecondary)
                    }
                }
            }

            Divider()
                .foregroundColor(AppTheme.border)

            // Description
            VStack(alignment: .leading, spacing: 8) {
                Text("ABOUT")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                    .textCase(.uppercase)
                    .kerning(0.04 * 11)

                Text("MathMate is a native macOS tutoring app that pairs AI-powered math assistance with your Synapse vault. Ask questions, get step-by-step guidance, and save structured study notes — all in one place.")
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.textPrimary)
                    .lineSpacing(4)
            }

            Divider()
                .foregroundColor(AppTheme.border)

            // Links
            VStack(alignment: .leading, spacing: 8) {
                Text("LINKS")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                    .textCase(.uppercase)
                    .kerning(0.04 * 11)

                LinkRow(label: "Documentation", icon: "book", url: "")
                LinkRow(label: "Report an Issue", icon: "exclamationmark.bubble", url: "")
                LinkRow(label: "GitHub Repository", icon: "chevron.left.forwardslash.chevron.right", url: "")
            }

            Divider()
                .foregroundColor(AppTheme.border)

            // Model Data section
            VStack(alignment: .leading, spacing: 8) {
                Text("MODEL DATA")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                    .textCase(.uppercase)
                    .kerning(0.04 * 11)

                // Status line
                HStack(spacing: 6) {
                    if let lastRefreshed = ModelPricing.lastRefreshedAt {
                        Text("\(ModelPricing.cachedModelCount) models · Last refreshed \(relativeDate(lastRefreshed))")
                            .font(.system(size: 12))
                            .foregroundColor(AppTheme.textSecondary)
                    } else {
                        Text("Using bundled data (\(ModelPricing.cachedModelCount) models)")
                            .font(.system(size: 12))
                            .foregroundColor(AppTheme.textSecondary)
                    }
                }

                // Refresh button
                HStack(spacing: 8) {
                    Button {
                        refreshPricing()
                    } label: {
                        HStack(spacing: 6) {
                            if isRefreshing {
                                ProgressView()
                                    .controlSize(.small)
                                    .scaleEffect(0.7)
                            } else {
                                Image(systemName: "arrow.clockwise")
                                    .font(.system(size: 11))
                            }
                            Text(isRefreshing ? "Refreshing…" : "Refresh from OpenRouter")
                                .font(.system(size: 12))
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(isRefreshing)

                    if let result = refreshResult {
                        Text(result)
                            .font(.system(size: 11))
                            .foregroundColor(result.hasPrefix("✓") ? AppTheme.green : .red)
                            .transition(.opacity)
                    }
                }
            }

            Spacer()

            // Disclaimer
            Text("MathMate can make mistakes. Verify important results.")
                .font(.system(size: 10))
                .foregroundColor(AppTheme.textTertiary)
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .animation(.easeInOut(duration: 0.2), value: refreshResult)
    }

    // MARK: - Actions

    private func refreshPricing() {
        isRefreshing = true
        refreshResult = nil

        Task {
            do {
                try await ModelPricing.refreshFromAPI()
                await MainActor.run {
                    isRefreshing = false
                    let count = ModelPricing.cachedModelCount
                    refreshResult = "✓ \(count) models updated"
                }
            } catch {
                await MainActor.run {
                    isRefreshing = false
                    refreshResult = "✗ \(error.localizedDescription)"
                }
            }
        }
    }

    private func relativeDate(_ date: Date) -> String {
        let interval = -date.timeIntervalSinceNow
        if interval < 60 { return "just now" }
        if interval < 3600 { return "\(Int(interval / 60))m ago" }
        if interval < 86400 { return "\(Int(interval / 3600))h ago" }
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

// MARK: - Link Row

struct LinkRow: View {
    let label: String
    let icon: String
    let url: String

    var body: some View {
        Button {
            if !url.isEmpty, let linkURL = URL(string: url) {
                NSWorkspace.shared.open(linkURL)
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.accent)
                    .frame(width: 16)
                Text(label)
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.accent)
                Spacer()
                Image(systemName: "arrow.up.forward")
                    .font(.system(size: 10))
                    .foregroundColor(AppTheme.textTertiary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
