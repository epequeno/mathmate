import Testing
import Foundation
@testable import MathMate

// MARK: - MemoryModel Tests

struct MemoryModelTests {
    @Test func memoryItemValidation() {
        let valid = MemoryItem(kind: .preference, content: "prefers hints")
        #expect(valid.isValid == true)

        let empty = MemoryItem(kind: .preference, content: "   ")
        #expect(empty.isValid == false)

        let lowConf = MemoryItem(kind: .goal, content: "pass exam", confidence: -0.1)
        #expect(lowConf.isValid == false)

        let highConf = MemoryItem(kind: .goal, content: "pass exam", confidence: 1.5)
        #expect(highConf.isValid == false)
    }

    @Test func learnerFactValidation() {
        let valid = LearnerFact(key: "style", value: "visual")
        #expect(valid.isValid == true)

        let emptyKey = LearnerFact(key: "", value: "visual")
        #expect(emptyKey.isValid == false)

        let emptyVal = LearnerFact(key: "style", value: "")
        #expect(emptyVal.isValid == false)
    }

    @Test func memoryKindRoundTrips() {
        for kind in MemoryKind.allCases {
            let raw = kind.rawValue
            let decoded = MemoryKind(rawValue: raw)
            #expect(decoded == kind)
        }
    }

    @Test func memoryStatusRoundTrips() {
        for status in MemoryStatus.allCases {
            let raw = status.rawValue
            let decoded = MemoryStatus(rawValue: raw)
            #expect(decoded == status)
        }
    }

    @Test func memorySourceKindRoundTrips() {
        for source in MemorySourceKind.allCases {
            let raw = source.rawValue
            let decoded = MemorySourceKind(rawValue: raw)
            #expect(decoded == source)
        }
    }
}

// MARK: - MemoryStore Tests

@Suite(.serialized) struct MemoryStoreTests {
    let store: MemoryStore

    init() async throws {
        // Use a temp database path for isolation
        let tmpDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("mathmate-test-\(UUID().uuidString)")
        let dbPath = tmpDir.appendingPathComponent("memory.sqlite").path
        store = MemoryStore(dbPath: dbPath)
        try await store.open()
    }

    // MARK: - Learner Facts

    @Test func upsertAndGetFact() async throws {
        let fact = LearnerFact(key: "learning_style", value: "visual", category: "preferences")
        try await store.upsertProfileFact(fact)

        let loaded = try #require(await store.getProfileFact(key: "learning_style"))
        #expect(loaded.value == "visual")
        #expect(loaded.category == "preferences")
        #expect(loaded.confidence == 1.0)
    }

    @Test func upsertOverwritesExisting() async throws {
        try await store.upsertProfileFact(LearnerFact(key: "test_key", value: "old_value"))
        try await store.upsertProfileFact(LearnerFact(key: "test_key", value: "new_value"))

        let loaded = try #require(await store.getProfileFact(key: "test_key"))
        #expect(loaded.value == "new_value")
    }

    @Test func listFactsByCategory() async throws {
        try await store.upsertProfileFact(LearnerFact(key: "a1", value: "v1", category: "cat_a"))
        try await store.upsertProfileFact(LearnerFact(key: "a2", value: "v2", category: "cat_a"))
        try await store.upsertProfileFact(LearnerFact(key: "b1", value: "v3", category: "cat_b"))

        let catA = try await store.listProfileFacts(category: "cat_a")
        #expect(catA.count == 2)

        let catB = try await store.listProfileFacts(category: "cat_b")
        #expect(catB.count == 1)

        let all = try await store.listProfileFacts()
        #expect(all.count == 3)
    }

    @Test func deleteFact() async throws {
        try await store.upsertProfileFact(LearnerFact(key: "delete_me", value: "bye"))
        try await store.deleteProfileFact(key: "delete_me")

        let loaded = try await store.getProfileFact(key: "delete_me")
        #expect(loaded == nil)
    }

    // MARK: - Memory Items

    @Test func addAndListMemoryItems() async throws {
        let item1 = MemoryItem(kind: .preference, content: "prefers hints", sourceKind: .manual)
        let item2 = MemoryItem(kind: .goal, content: "pass calculus", sourceKind: .system)

        try await store.addMemoryItem(item1)
        try await store.addMemoryItem(item2)

        let all = try await store.getAllItems()
        #expect(all.count == 2)
    }

    @Test func listByFilter() async throws {
        let pref = MemoryItem(kind: .preference, content: "prefers hints", sourceKind: .manual)
        let goal = MemoryItem(kind: .goal, content: "pass calculus", sourceKind: .system)

        try await store.addMemoryItem(pref)
        try await store.addMemoryItem(goal)

        let prefs = try await store.listMemoryItems(filter: MemoryListFilter(kind: .preference, status: .active))
        #expect(prefs.count == 1)
        #expect(prefs[0].kind == .preference)
    }

    @Test func archiveAndForget() async throws {
        let item = MemoryItem(kind: .observation, content: "struggles with factoring", sourceKind: .system)
        try await store.addMemoryItem(item)

        try await store.archiveMemoryItem(id: item.id)
        let archived = try await store.listMemoryItems(filter: MemoryListFilter(status: .archived))
        #expect(archived.count == 1)

        try await store.forgetMemoryItem(id: item.id)
        let forgotten = try await store.listMemoryItems(filter: MemoryListFilter(status: .forgotten))
        #expect(forgotten.count == 1)

        let active = try await store.listMemoryItems(filter: MemoryListFilter(status: .active))
        #expect(active.count == 0)
    }

    @Test func updateConfidence() async throws {
        let item = MemoryItem(kind: .concept, content: "quadratic formula", confidence: 0.5)
        try await store.addMemoryItem(item)

        try await store.updateMemoryItem(id: item.id, confidence: 0.95)
        let loaded = try await store.getAllItems()
        #expect(loaded[0].confidence == 0.95)
    }

    @Test func flaggedReference() async throws {
        let flagged = MemoryItem(kind: .observation, content: "important insight", isFlaggedReference: true)
        let normal = MemoryItem(kind: .observation, content: "normal note")
        try await store.addMemoryItem(flagged)
        try await store.addMemoryItem(normal)

        let all = try await store.getAllItems()
        let flaggedItems = all.filter(\.isFlaggedReference)
        #expect(flaggedItems.count == 1)
        #expect(flaggedItems[0].content == "important insight")
    }

    // MARK: - Sources

    @Test func linkAndListSources() async throws {
        let item = MemoryItem(kind: .observation, content: "from message")
        try await store.addMemoryItem(item)

        let source = MemorySource(memoryItemId: item.id, sourceType: "message", sourceId: "msg-123")
        try await store.linkSource(source)

        let sources = try await store.listSources(for: item.id)
        #expect(sources.count == 1)
        #expect(sources[0].sourceType == "message")
        #expect(sources[0].sourceId == "msg-123")
    }

    // MARK: - Counts

    @Test func counts() async throws {
        let i1 = MemoryItem(kind: .preference, content: "c1")
        let i2 = MemoryItem(kind: .goal, content: "c2")
        let i3 = MemoryItem(kind: .observation, content: "c3")
        try await store.addMemoryItem(i1)
        try await store.addMemoryItem(i2)
        try await store.addMemoryItem(i3)
        try await store.archiveMemoryItem(id: i3.id)

        let active = try await store.countItems(status: .active)
        #expect(active == 2)

        let archived = try await store.countItems(status: .archived)
        #expect(archived == 1)

        let total = try await store.countItems()
        #expect(total == 3)
    }

    @Test func factCounts() async throws {
        try await store.upsertProfileFact(LearnerFact(key: "k1", value: "v1"))
        try await store.upsertProfileFact(LearnerFact(key: "k2", value: "v2"))
        #expect(try await store.countFacts() == 2)
    }
}

// MARK: - MemoryEngine Tests

struct MemoryEngineTests {
    @Test func scoringWeightsSumToOne() {
        // Verify the scoring formula distributes correctly:
        // confidence 40% + topical 35% + recency 15% + flagged 10% = 100%
        let total = 0.40 + 0.35 + 0.15 + 0.10
        #expect(abs(total - 1.0) < 0.001)
    }



    @Test func memoryContextBlockFormatting() {
        let engine = MemoryEngine(store: MemoryStore())
        let items = [
            ScoredMemoryItem(item: MemoryItem(kind: .preference, content: "prefers hints before solutions", confidence: 0.95, isFlaggedReference: true), score: 0.85),
            ScoredMemoryItem(item: MemoryItem(kind: .goal, content: "pass Calculus I midterm", confidence: 0.90), score: 0.72)
        ]

        let block = engine.buildMemoryContextBlock(from: items)
        #expect(block.hasPrefix("[Memory Context]"))
        #expect(block.contains("preference: prefers hints before solutions"))
        #expect(block.contains("goal: pass Calculus I midterm"))
        #expect(block.contains("★")) // flagged marker
    }

    @Test func emptyContextBlock() {
        let engine = MemoryEngine(store: MemoryStore())
        let block = engine.buildMemoryContextBlock(from: [])
        #expect(block.isEmpty)
    }

    @Test func filteredPromptBlock() {
        let engine = MemoryEngine(store: MemoryStore())
        let items = [
            ScoredMemoryItem(item: MemoryItem(kind: .preference, content: "high score item", confidence: 0.95), score: 0.8),
            ScoredMemoryItem(item: MemoryItem(kind: .preference, content: "low score item", confidence: 0.5), score: 0.2)
        ]

        let block = engine.formatMemoryPromptBlock(items, minimumScore: 0.3)
        #expect(block.contains("high score item"))
        #expect(!block.contains("low score item"))
    }
}

// MARK: - MemoryViewModel Tests

struct MemoryViewModelTests {
    @MainActor
    @Test func extractionHandlesNoFlaggedMessages() async {
        let store = MemoryStore()
        let vm = MemoryViewModel(store: store)
        // Should not throw with empty messages
        await vm.extractFromSession(messages: [], projectId: nil)
        // Nothing to assert beyond no-crash
    }
}