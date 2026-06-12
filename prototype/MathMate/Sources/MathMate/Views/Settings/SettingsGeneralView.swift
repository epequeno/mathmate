import SwiftUI

// MARK: - General Settings

struct SettingsGeneralView: View {
    @Bindable var settingsVM: SettingsViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Appearance
            VStack(alignment: .leading, spacing: 8) {
                Text("APPEARANCE")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                    .textCase(.uppercase)
                    .kerning(0.04 * 11)

                Picker("Appearance", selection: $settingsVM.appearanceMode) {
                    ForEach(SettingsViewModel.AppearanceMode.allCases) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 280)
                .onChange(of: settingsVM.appearanceMode) { _, _ in
                    settingsVM.saveAppearance()
                }
            }

            Divider()
                .foregroundColor(AppTheme.border)

            // Default session name prefix
            VStack(alignment: .leading, spacing: 8) {
                Text("SESSION DEFAULTS")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                    .textCase(.uppercase)
                    .kerning(0.04 * 11)

                Text("Sessions are auto-named from the first message. Custom names can be set inline.")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.textSecondary)
            }

            Spacer()
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}