import SwiftUI

// MARK: - Models Settings

struct SettingsModelsView: View {
    @Bindable var settingsVM: SettingsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("PROVIDERS")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppTheme.textSecondary)
                .textCase(.uppercase)
                .kerning(0.04 * 11)

            Text("API keys are read from environment variables. Toggle providers on/off to control which models appear in the selector.")
                .font(.system(size: 12))
                .foregroundColor(AppTheme.textSecondary)

            ScrollView {
                VStack(spacing: 8) {
                    ForEach(settingsVM.providers) { provider in
                        ProviderSettingsRow(
                            provider: provider,
                            onToggle: {
                                settingsVM.toggleProvider(provider.name)
                            }
                        )
                    }
                }
            }

            Divider()
                .foregroundColor(AppTheme.border)

            // Vision model filter
            VStack(alignment: .leading, spacing: 8) {
                Text("VISION MODELS")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                    .textCase(.uppercase)
                    .kerning(0.04 * 11)

                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Only show vision-capable models")
                            .font(.system(size: 13))
                            .foregroundColor(AppTheme.textPrimary)
                        Text("When enabled, only models that accept image inputs are shown in the model selector. Models without vision support are hidden.")
                            .font(.system(size: 11))
                            .foregroundColor(AppTheme.textTertiary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    Toggle("", isOn: Binding(
                        get: { settingsVM.filterVisionModels },
                        set: { settingsVM.filterVisionModels = $0 }
                    ))
                    .controlSize(.small)
                }
            }

            Spacer()
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - Provider Settings Row

struct ProviderSettingsRow: View {
    let provider: ProviderConfig
    let onToggle: () -> Void

    private var isConfigured: Bool {
        provider.apiKey != nil
    }

    private var maskedKey: String {
        guard let key = provider.apiKey, key.count >= 4 else {
            return isConfigured ? "****" : "Not set"
        }
        return String(repeating: "•", count: key.count - 4) + String(key.suffix(4))
    }

    var body: some View {
        HStack(spacing: 12) {
            // Provider icon / status
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(isConfigured ? AppTheme.green : AppTheme.border)
                        .frame(width: 8, height: 8)

                    Text(provider.name)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(AppTheme.textPrimary)
                }

                HStack(spacing: 4) {
                    Text("Set via")
                        .font(.system(size: 11))
                        .foregroundColor(AppTheme.textTertiary)
                    Text("`\(provider.resolvedEnvKey)`")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(AppTheme.textSecondary)
                }

                // Key display
                HStack(spacing: 6) {
                    Text(maskedKey)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(isConfigured ? AppTheme.textSecondary : AppTheme.textTertiary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(AppTheme.backgroundElevated)
                        .cornerRadius(4)

                    if isConfigured {
                        Button {
                            NSPasteboard.general.clearContents()
                            NSPasteboard.general.setString(provider.apiKey ?? "", forType: .string)
                        } label: {
                            Image(systemName: "doc.on.doc")
                                .font(.system(size: 10))
                                .foregroundColor(AppTheme.textSecondary)
                        }
                        .buttonStyle(.plain)
                        .help("Copy API key")
                    }
                }
            }

            Spacer()

            // Toggle
            Toggle(isOn: Binding(
                get: { provider.enabled },
                set: { _ in onToggle() }
            )) {
                EmptyView()
            }
            .toggleStyle(.switch)
            .controlSize(.small)
        }
        .padding(12)
        .background(AppTheme.surface)
        .cornerRadius(8)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.border, lineWidth: 1)
        )
        .opacity(provider.enabled ? 1.0 : 0.6)
    }
}