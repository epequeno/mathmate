import SwiftUI

/// A searchable popover that lets the user browse and insert LaTeX snippets.
///
/// Usage:
/// ```swift
/// @State private var showPalette = false
/// @State private var paletteCaretOffset = 0
/// @State private var paletteSelectionLength = 0
///
/// Button("ƒx") { showPalette = true }
///     .popover(isPresented: $showPalette) {
///         LaTeXPaletteView(
///             repository: snippetRepo,
///             onInsert: { snippet in
///                 // parent captures source + cursor position at open time
///                 let result = LaTeXInsertionEngine.insert(
///                     snippet, into: capturedSource, at: capturedCaret,
///                     selectionLength: capturedSelection
///                 )
///             }
///         )
///     }
/// ```
struct LaTeXPaletteView: View {
    let repository: LaTeXSnippetRepository
    /// Called when the user picks a snippet. The parent closure should capture the
    /// cursor position and source text at popover-open time to perform insertion.
    let onInsert: (LaTeXSnippet) -> Void

    /// Search service — held as let, not @State (it's never mutated).
    private let searchService: LaTeXSnippetSearchService

    @State private var searchText = ""
    @State private var selectedIndex = 0
    @State private var results: [ScoredSnippet] = []

    /// Forces the results list to refresh when search text changes.
    @State private var renderEpoch = 0

    @Environment(\.dismiss) private var dismiss

    init(repository: LaTeXSnippetRepository, onInsert: @escaping (LaTeXSnippet) -> Void) {
        self.repository = repository
        self.onInsert = onInsert
        self.searchService = LaTeXSnippetSearchService(repository: repository)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Search field
            searchField

            Divider()

            // Results list
            if results.isEmpty {
                emptyState
            } else {
                resultsList
                    .id(renderEpoch) // Force re-create when search text changes
            }
        }
        .frame(width: 380, height: 420)
        .onChange(of: searchText) { _, newValue in
            runSearch(newValue)
        }
        .onAppear {
            // Seed initial results (empty search → all snippets)
            results = searchService.search("")
        }
    }

    // MARK: - Search

    private func runSearch(_ query: String) {
        results = searchService.search(query)
        selectedIndex = 0
        renderEpoch &+= 1
    }

    // MARK: - Search field

    private var searchField: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)
                .font(.system(size: 12))

            TextField("Search symbols, operators...", text: $searchText)
                .textFieldStyle(.plain)
                .font(.system(size: 13))
                .autocorrectionDisabled()
                .onSubmit {
                    insertSelected()
                }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: 8) {
            Spacer()
            Image(systemName: "magnifyingglass")
                .font(.system(size: 24))
                .foregroundColor(.secondary.opacity(0.5))
            Text("No matches")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Results list

    private var resultsList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(groupedResults.enumerated()), id: \.offset) { groupIdx, group in
                        // Category header
                        categoryHeader(group.category)
                            .id("cat-\(groupIdx)")

                        // Snippets in this category
                        ForEach(Array(group.snippets.enumerated()), id: \.element.id) { itemIdx, scored in
                            let flatIdx = groupedToFlat(group: groupIdx, item: itemIdx)
                            snippetRow(scored.snippet, isSelected: flatIdx == selectedIndex)
                                .id("item-\(flatIdx)")
                                .onTapGesture {
                                    selectedIndex = flatIdx
                                    insertSnippet(scored.snippet)
                                }
                        }
                    }
                }
            }
            .onChange(of: selectedIndex) { _, newVal in
                withAnimation(.easeInOut(duration: 0.1)) {
                    proxy.scrollTo("item-\(newVal)", anchor: .center)
                }
            }
        }
    }

    // MARK: - Category header

    private func categoryHeader(_ category: String) -> some View {
        Text(category)
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(.secondary)
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 4)
    }

    // MARK: - Snippet row

    private func snippetRow(_ snippet: LaTeXSnippet, isSelected: Bool) -> some View {
        HStack(spacing: 10) {
            // Example preview (rendered symbol)
            Text(snippet.title)
                .font(.system(size: 13, weight: .medium))
                .frame(width: 120, alignment: .leading)
                .lineLimit(1)

            Spacer()

            // Template preview
            Text(stripPlaceholders(snippet.template))
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.secondary)
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(isSelected ? Color.accentColor.opacity(0.12) : Color.clear)
        .cornerRadius(4)
    }

    // MARK: - Actions

    private func insertSelected() {
        guard selectedIndex < results.count else { return }
        insertSnippet(results[selectedIndex].snippet)
    }

    private func insertSnippet(_ snippet: LaTeXSnippet) {
        onInsert(snippet)
        dismiss()
    }

    // MARK: - Grouping

    /// Group results by category, preserving category order from the repository.
    /// Uses a plain dictionary approach — no redundant `seen` set.
    private var groupedResults: [(category: String, snippets: [ScoredSnippet])] {
        var groups: [String: [ScoredSnippet]] = [:]
        var catOrder: [String] = []
        for result in results {
            let cat = result.snippet.category
            if groups[cat] == nil {
                groups[cat] = []
                catOrder.append(cat)
            }
            groups[cat]?.append(result)
        }
        return catOrder.map { ($0, groups[$0]!) }
    }

    /// Flat index → (groupIndex, itemIndex) mapping for keyboard nav
    private func flatToGrouped(_ flat: Int) -> (Int, Int)? {
        var remaining = flat
        for (gi, group) in groupedResults.enumerated() {
            if remaining < group.snippets.count {
                return (gi, remaining)
            }
            remaining -= group.snippets.count
        }
        return nil
    }

    private func groupedToFlat(group: Int, item: Int) -> Int {
        var flat = 0
        for (gi, g) in groupedResults.enumerated() {
            if gi == group { return flat + item }
            flat += g.snippets.count
        }
        return flat
    }

    // MARK: - Helpers

    /// Strip placeholder tokens like `${1:text}` → `text` for a cleaner display.
    private func stripPlaceholders(_ template: String) -> String {
        template.replacingOccurrences(
            of: #"\$\{\d+:([^}]+)\}"#,
            with: "$1",
            options: .regularExpression
        )
    }
}
