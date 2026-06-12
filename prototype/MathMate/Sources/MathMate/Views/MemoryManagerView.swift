import SwiftUI

struct MemoryManagerView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Memory Manager")
                .font(.title2.bold())

            Text("Agent Memory UI is temporarily unavailable in this build.")
                .foregroundStyle(.secondary)

            HStack {
                Spacer()
                Button("Close") {
                    dismiss()
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(24)
        .frame(minWidth: 520, minHeight: 280)
    }
}
