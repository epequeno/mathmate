import SwiftUI

// MARK: - Overview View

struct OverviewView: View {
    let project: MathProject
    let onSelectSession: (SessionHeader) -> Void

    @State private var overviewVM: OverviewViewModel

    init(project: MathProject?, onSelectSession: @escaping (SessionHeader) -> Void) {
        guard let project else {
            // Fallback for nil project — shouldn't happen in normal flow
            self.project = MathProject(name: "", vaultPath: "")
            self._overviewVM = State(initialValue: OverviewViewModel(project: MathProject(name: "", vaultPath: "")))
            self.onSelectSession = onSelectSession
            return
        }
        self.project = project
        self._overviewVM = State(initialValue: OverviewViewModel(project: project))
        self.onSelectSession = onSelectSession
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                // Page title
                Text(project.name)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(AppTheme.textPrimary)
                    .padding(.horizontal, 20)

                // Stats grid
                statsGrid
                    .padding(.horizontal, 20)

                if project.hasValidTextbook, let path = project.textbookPath, let displayName = project.textbookDisplayName {
                    Divider()
                        .foregroundColor(AppTheme.border)
                        .padding(.horizontal, 20)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("TEXTBOOK PDF")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(AppTheme.textSecondary)
                            .textCase(.uppercase)
                            .kerning(0.04 * 11)

                        Button {
                            NSWorkspace.shared.open(URL(fileURLWithPath: path))
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "doc.text.fill")
                                    .font(.system(size: 20))
                                    .foregroundColor(AppTheme.accent)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(displayName)
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundColor(AppTheme.textPrimary)
                                    Text(path)
                                        .font(.system(size: 11))
                                        .foregroundColor(AppTheme.textTertiary)
                                        .lineLimit(1)
                                        .truncationMode(.middle)
                                }

                                Spacer()

                                Image(systemName: "arrow.up.forward.app")
                                    .font(.system(size: 14))
                                    .foregroundColor(AppTheme.textSecondary)
                            }
                            .padding(.all, 12)
                            .background(AppTheme.backgroundElevated)
                            .cornerRadius(8)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(AppTheme.border, lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 20)
                }

                Divider()
                    .foregroundColor(AppTheme.border)
                    .padding(.horizontal, 20)

                // AI Summary
                aiSummarySection
                    .padding(.horizontal, 20)

                Divider()
                    .foregroundColor(AppTheme.border)
                    .padding(.horizontal, 20)

                // Recent Sessions
                recentSessionsSection
                    .padding(.horizontal, 20)

                // Key Topics placeholder
                keyTopicsSection
                    .padding(.horizontal, 20)
                    .padding(.bottom, 32)
            }
            .padding(.vertical, 20)
        }
        .background(AppTheme.background)
    }

    // MARK: - Stats Grid

    private var statsGrid: some View {
        LazyVGrid(columns: [
            GridItem(.flexible()),
            GridItem(.flexible()),
            GridItem(.flexible()),
            GridItem(.flexible())
        ], spacing: 16) {
            StatCard(title: "Sessions", value: "\(overviewVM.sessionCount)", icon: "bubble.left.and.bubble.right")
            StatCard(title: "Messages", value: "\(overviewVM.totalMessages)", icon: "text.bubble")
            StatCard(title: "Vault Notes", value: "\(overviewVM.vaultNoteCount)", icon: "doc.text")
            StatCard(title: "Last Active", value: lastActiveText, icon: "clock")
        }
    }

    private var lastActiveText: String {
        guard let date = overviewVM.lastActive else { return "—" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    // MARK: - AI Summary

    private var aiSummarySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("AI SUMMARY")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(AppTheme.textSecondary)
                    .textCase(.uppercase)
                    .kerning(0.04 * 11)

                Spacer()

                if let freshness = overviewVM.summaryFreshness {
                    Text(freshness)
                        .font(.system(size: 11))
                        .foregroundColor(AppTheme.textTertiary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(AppTheme.backgroundElevated)
                        .cornerRadius(8)
                }

                Button {
                    Task { await overviewVM.generateSummary() }
                } label: {
                    if overviewVM.isGeneratingSummary {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text("Generate Summary")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(AppTheme.accent)
                    }
                }
                .buttonStyle(.plain)
                .disabled(overviewVM.isGeneratingSummary)
            }

            if let error = overviewVM.summaryError {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 10))
                        .foregroundColor(.orange)
                    Text(error)
                        .font(.system(size: 11))
                        .foregroundColor(AppTheme.textSecondary)
                }
            }

            if let summary = overviewVM.summaryText {
                Text(summary)
                    .font(.system(size: 13))
                    .foregroundColor(AppTheme.textPrimary)
                    .lineSpacing(4)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.surface)
                    .cornerRadius(10)
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(AppTheme.border, lineWidth: 1)
                    )
            } else if !overviewVM.isGeneratingSummary {
                Text("Generate a summary of recent session activity and key topics covered in this project.")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.textSecondary)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(AppTheme.backgroundElevated)
                    .cornerRadius(10)
            }
        }
    }

    // MARK: - Recent Sessions

    private var recentSessionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("RECENT SESSIONS")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppTheme.textSecondary)
                .textCase(.uppercase)
                .kerning(0.04 * 11)

            if overviewVM.recentSessions.isEmpty {
                Text("No sessions yet. Start a session to see it here.")
                    .font(.system(size: 12))
                    .foregroundColor(AppTheme.textTertiary)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(spacing: 4) {
                    ForEach(overviewVM.recentSessions) { session in
                        OverviewSessionRow(
                            session: session,
                            messageCount: overviewVM.recentMessageCounts[session.id] ?? 0,
                            onSelect: { onSelectSession(session) }
                        )
                    }
                }
            }
        }
    }

    // MARK: - Key Topics

    private var keyTopicsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("KEY TOPICS")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(AppTheme.textSecondary)
                .textCase(.uppercase)
                .kerning(0.04 * 11)

            Text("Topic tracking requires Agent Memory. Coming in a future update.")
                .font(.system(size: 12))
                .foregroundColor(AppTheme.textTertiary)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(AppTheme.backgroundElevated)
                .cornerRadius(10)
        }
    }
}

// MARK: - Stat Card

struct StatCard: View {
    let title: String
    let value: String
    let icon: String

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(AppTheme.accent)

            Text(value)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(AppTheme.textPrimary)

            Text(title)
                .font(.system(size: 11))
                .foregroundColor(AppTheme.textSecondary)
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(AppTheme.surface)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.border, lineWidth: 1)
        )
    }
}

// MARK: - Overview Session Row

struct OverviewSessionRow: View {
    let session: SessionHeader
    let messageCount: Int
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.displayName)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(AppTheme.textPrimary)
                        .lineLimit(1)

                    HStack(spacing: 8) {
                        Text(session.lastActivity, style: .relative)
                            .font(.system(size: 11))
                            .foregroundColor(AppTheme.textSecondary)

                        Text("· \(messageCount) messages")
                            .font(.system(size: 11))
                            .foregroundColor(AppTheme.textSecondary)
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 10))
                    .foregroundColor(AppTheme.textMuted)
            }
            .padding(12)
            .background(AppTheme.surface)
            .cornerRadius(8)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(AppTheme.border, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}