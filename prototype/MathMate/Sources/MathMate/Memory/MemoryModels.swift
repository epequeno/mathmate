import Foundation

// MARK: - Enums

/// Categories of memory items the system can track about a learner.
enum MemoryKind: String, Codable, Sendable, CaseIterable {
    /// A stated preference (e.g. "prefers hints before full solutions")
    case preference
    /// A learning goal (e.g. "pass Calculus I midterm in 3 weeks")
    case goal
    /// A persistent misunderstanding (e.g. "sign errors during expansion")
    case misconception
    /// A concept the learner has encountered (e.g. "quadratic formula")
    case concept
    /// A study or problem-solving habit
    case habit
    /// Recurring behavior pattern
    case behavior
    /// An agent observation not fitting other categories
    case observation
    /// Free-form custom memory
    case custom
}

/// Lifecycle state of a memory item.
enum MemoryStatus: String, Codable, Sendable, CaseIterable {
    /// Currently active and relevant
    case active
    /// Archived — preserved but not injected into prompts
    case archived
    /// Forgotten — soft-deleted, excluded from retrieval
    case forgotten
}

/// Origin of a memory item.
enum MemorySourceKind: String, Codable, Sendable, CaseIterable {
    /// User explicitly typed `/remember`
    case manual
    /// Extracted from a chat message
    case message
    /// Generated from a session wrap-up
    case session
    /// Created by the system (e.g. inferred patterns)
    case system
    /// Imported from external source
    case `import`
}

// MARK: - Models

/// A discrete item of memory about the learner or session context.
struct MemoryItem: Identifiable, Codable, Sendable, Hashable {
    let id: UUID
    let kind: MemoryKind
    let content: String
    var confidence: Double
    var status: MemoryStatus
    let sourceKind: MemorySourceKind
    /// Optional session ID this memory was extracted from.
    let sessionId: String?
    /// Optional message ID this memory was extracted from.
    let messageId: UUID?
    /// Whether this was extracted from a user-flagged message.
    var isFlaggedReference: Bool
    let createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        kind: MemoryKind,
        content: String,
        confidence: Double = 1.0,
        status: MemoryStatus = .active,
        sourceKind: MemorySourceKind = .system,
        sessionId: String? = nil,
        messageId: UUID? = nil,
        isFlaggedReference: Bool = false,
        createdAt: Date = Date(),
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.kind = kind
        self.content = content
        self.confidence = confidence
        self.status = status
        self.sourceKind = sourceKind
        self.sessionId = sessionId
        self.messageId = messageId
        self.isFlaggedReference = isFlaggedReference
        self.createdAt = createdAt
        self.updatedAt = updatedAt ?? createdAt
    }
}

/// A structured fact about the learner, keyed for easy lookup and overwrite.
struct LearnerFact: Identifiable, Codable, Sendable, Hashable {
    let id: UUID
    /// Unique key for upsert semantics (e.g. "preferred_learning_style").
    let key: String
    let value: String
    /// Optional grouping category (e.g. "preferences", "goals").
    var category: String?
    var confidence: Double
    /// Free-form source descriptor (e.g. "user said during session").
    var source: String?
    let createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        key: String,
        value: String,
        category: String? = nil,
        confidence: Double = 1.0,
        source: String? = nil,
        createdAt: Date = Date(),
        updatedAt: Date? = nil
    ) {
        self.id = id
        self.key = key
        self.value = value
        self.category = category
        self.confidence = confidence
        self.source = source
        self.createdAt = createdAt
        self.updatedAt = updatedAt ?? createdAt
    }
}

/// Provenance link between a memory item and its source.
struct MemorySource: Identifiable, Codable, Sendable, Hashable {
    let id: UUID
    let memoryItemId: UUID
    /// Type of source (e.g. "message", "note", "command").
    let sourceType: String
    /// Identifier within the source type (e.g. message UUID string).
    let sourceId: String
    let createdAt: Date

    init(
        id: UUID = UUID(),
        memoryItemId: UUID,
        sourceType: String,
        sourceId: String,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.memoryItemId = memoryItemId
        self.sourceType = sourceType
        self.sourceId = sourceId
        self.createdAt = createdAt
    }
}

// MARK: - Query / Filter Types

/// Filter for listing memory items.
struct MemoryListFilter: Sendable {
    var kind: MemoryKind?
    var status: MemoryStatus = .active
    var sortBy: SortField = .createdAt
    var sortOrder: SortOrder = .descending
    var limit: Int = 50
    var offset: Int = 0

    enum SortField: String, Sendable {
        case createdAt, updatedAt, confidence
    }

    enum SortOrder: String, Sendable {
        case ascending, descending
    }

    init(
        kind: MemoryKind? = nil,
        status: MemoryStatus = .active,
        sortBy: SortField = .createdAt,
        sortOrder: SortOrder = .descending,
        limit: Int = 50,
        offset: Int = 0
    ) {
        self.kind = kind
        self.status = status
        self.sortBy = sortBy
        self.sortOrder = sortOrder
        self.limit = limit
        self.offset = offset
    }
}

/// Query for relevance-based memory retrieval.
struct MemoryRetrievalQuery: Sendable {
    var query: String
    var limit: Int = 10
    var kindFilter: [MemoryKind]?
    var minimumConfidence: Double = 0.3

    init(
        query: String,
        limit: Int = 10,
        kindFilter: [MemoryKind]? = nil,
        minimumConfidence: Double = 0.3
    ) {
        self.query = query
        self.limit = limit
        self.kindFilter = kindFilter
        self.minimumConfidence = minimumConfidence
    }
}

// MARK: - Validation

extension MemoryItem {
    var isValid: Bool {
        !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && confidence >= 0.0 && confidence <= 1.0
    }
}

extension LearnerFact {
    var isValid: Bool {
        !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && confidence >= 0.0 && confidence <= 1.0
    }
}