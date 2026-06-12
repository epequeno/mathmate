import SwiftUI

// MARK: - Chat Settings

struct SettingsChatView: View {
    @Bindable var settingsVM: SettingsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // System Prompt section
            VStack(alignment: .leading, spacing: 8) {
                Text("SYSTEM PROMPT")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                    .textCase(.uppercase)
                    .kerning(0.04 * 11)

                Text("The system prompt sets the assistant's behaviour for all sessions.")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.textSecondary)

                // Preset picker
                Picker("Preset", selection: $settingsVM.selectedPreset) {
                    ForEach(SettingsStore.Preset.allCases) { preset in
                        Text(preset.rawValue).tag(preset)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: settingsVM.selectedPreset) { _, newValue in
                    if newValue != .custom {
                        settingsVM.systemPrompt = newValue.prompt
                    }
                }

                // Prompt editor
                TextEditor(text: Binding(
                    get: { settingsVM.systemPrompt },
                    set: { settingsVM.updatePrompt($0) }
                ))
                .font(.system(.body, design: .monospaced))
                .frame(minHeight: 180)
                .padding(8)
                .background(AppTheme.surface)
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(AppTheme.border, lineWidth: 1)
                )
            }

            Divider()
                .foregroundColor(AppTheme.border)

            // Max tokens
            VStack(alignment: .leading, spacing: 8) {
                Text("RESPONSE LIMITS")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                    .textCase(.uppercase)
                    .kerning(0.04 * 11)

                HStack {
                    Text("Max tokens per response:")
                        .font(.system(size: 13))
                        .foregroundColor(AppTheme.textPrimary)
                    Spacer()
                    TextField("4096", value: $settingsVM.maxTokens, format: .number)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 100)
                        .multilineTextAlignment(.trailing)
                }
            }

            Divider()
                .foregroundColor(AppTheme.border)

            // Memory section
            VStack(alignment: .leading, spacing: 8) {
                Text("MEMORY")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                    .textCase(.uppercase)
                    .kerning(0.04 * 11)

                Text("Learner facts and preferences stored between sessions. Memory items are injected into the system prompt during each tutoring turn.")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.textSecondary)

                HStack {
                    Text("Enable memory injection")
                        .font(.system(size: 13))
                        .foregroundColor(AppTheme.textPrimary)
                    Spacer()
                    Toggle("", isOn: $settingsVM.memoryEnabled)
                        .controlSize(.small)
                }

                HStack {
                    Text("Max items per turn")
                        .font(.system(size: 13))
                        .foregroundColor(AppTheme.textPrimary)
                    Spacer()
                    Stepper("\(settingsVM.maxMemoryItems)",
                        value: Binding(
                            get: { settingsVM.maxMemoryItems },
                            set: { settingsVM.maxMemoryItems = $0 }
                        ),
                        in: 1...20
                    )
                    .controlSize(.small)
                    .font(.system(size: 12, weight: .medium))
                }
            }

            Spacer()

            // Save button
            HStack {
                Spacer()
                Button("Save Chat Settings") {
                    settingsVM.saveChat()
                }
                .buttonStyle(.borderedProminent)
                .tint(AppTheme.accentFill)
            }
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}