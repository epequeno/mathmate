import Foundation
import SQLite3

/// SQLITE_TRANSIENT constant — tells SQLite to copy the string data.
private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

// MARK: - Error

enum MemoryStoreError: Error, LocalizedError {
    case cannotOpen(path: String)
    case migrationFailed(version: Int)
    case prepareFailed(sql: String)
    case executionFailed(message: String)
    case notFound
    case invalidData
    case invalidConfidence
    case notOpen

    var errorDescription: String? {
        switch self {
        case .cannotOpen(let path): return "Cannot open memory database at \(path)"
        case .migrationFailed(let v): return "Migration to version \(v) failed"
        case .prepareFailed(let sql): return "Failed to prepare SQL: \(sql.prefix(80))"
        case .executionFailed(let msg): return "SQL execution failed: \(msg)"
        case .notFound: return "Memory item not found"
        case .invalidData: return "Invalid data in memory store"
        case .invalidConfidence: return "Confidence must be between 0.0 and 1.0"
        case .notOpen: return "Memory database not open. Call open() first."
        }
    }
}

// MARK: - MemoryStore

/// SQLite-backed persistent store for learner facts and memory items.
///
/// Thread safety is guaranteed by Swift actor isolation — all database access
/// runs sequentially through the actor's executor.
/// Thread-safe wrapper for an SQLite database handle.
///
/// Marked `@unchecked Sendable` because its pointer is only accessed
/// from within the `MemoryStore` actor — never concurrently.
final class DatabaseHandle: @unchecked Sendable {
    var pointer: OpaquePointer?

    deinit {
        guard let pointer else { return }
        sqlite3_close(pointer)
    }
}

actor MemoryStore {
    private let handle = DatabaseHandle()
    private let dbPath: String

    private var db: OpaquePointer? {
        handle.pointer
    }

    /// Creates a MemoryStore targeting the given path (or the default location).
    ///
    /// Default path: `~/.mathmate/memory/memory.sqlite`
    init(dbPath: String? = nil) {
        let defaultPath = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".mathmate/memory/memory.sqlite").path
        self.dbPath = dbPath ?? defaultPath
    }

    // MARK: - Lifecycle

    /// Opens (or creates) the database, applies PRAGMAs, and runs pending migrations.
    func open() throws {
        let dir = (dbPath as NSString).deletingLastPathComponent
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)

        let flags = SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
        var ptr: OpaquePointer?
        let rc = sqlite3_open_v2(dbPath, &ptr, flags, nil)
        guard rc == SQLITE_OK, let db = ptr else {
            throw MemoryStoreError.cannotOpen(path: dbPath)
        }
        handle.pointer = db

        try executePragma("PRAGMA journal_mode = WAL")
        try executePragma("PRAGMA foreign_keys = ON")

        try runMigrations()
    }

    /// Closes the database connection.
    func close() {
        guard let db = handle.pointer else { return }
        sqlite3_close(db)
        handle.pointer = nil
    }

    // MARK: - PRAGMAs

    private func executePragma(_ sql: String) throws {
        var errMsg: UnsafeMutablePointer<CChar>?
        let rc = sqlite3_exec(db, sql, nil, nil, &errMsg)
        guard rc == SQLITE_OK else {
            let msg = errMsg.map { String(cString: $0) } ?? "unknown error"
            sqlite3_free(errMsg)
            throw MemoryStoreError.executionFailed(message: msg)
        }
    }

    // MARK: - Migrations

    private func runMigrations() throws {
        try execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at REAL NOT NULL
            )
        """)

        let applied = try queryAppliedVersions()
        let currentVersion = applied.max() ?? 0

        guard currentVersion < targetSchemaVersion else { return }

        for version in (currentVersion + 1)...targetSchemaVersion {
            try applyMigration(version)
            try execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                params: [.int(Int64(version)), .real(Date().timeIntervalSince1970)]
            )
        }
    }

    /// The latest schema version. Increment this and add a migration case when the schema changes.
    private let targetSchemaVersion = 1

    private func queryAppliedVersions() throws -> Set<Int> {
        let rows = try query("SELECT version FROM schema_migrations ORDER BY version")
        return Set(rows.compactMap { $0["version"] as? Int })
    }

    private func applyMigration(_ version: Int) throws {
        switch version {
        case 1:
            try execute("""
                CREATE TABLE IF NOT EXISTS learner_facts (
                    id TEXT PRIMARY KEY,
                    key TEXT NOT NULL UNIQUE,
                    value TEXT NOT NULL,
                    category TEXT,
                    confidence REAL NOT NULL DEFAULT 1.0,
                    source TEXT,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                )
            """)
            try execute("""
                CREATE TABLE IF NOT EXISTS memory_items (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    content TEXT NOT NULL,
                    confidence REAL NOT NULL DEFAULT 1.0,
                    status TEXT NOT NULL DEFAULT 'active',
                    source_kind TEXT NOT NULL DEFAULT 'system',
                    session_id TEXT,
                    message_id TEXT,
                    is_flagged_reference INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                )
            """)
            try execute("""
                CREATE TABLE IF NOT EXISTS memory_sources (
                    id TEXT PRIMARY KEY,
                    memory_item_id TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    FOREIGN KEY (memory_item_id) REFERENCES memory_items(id) ON DELETE CASCADE
                )
            """)
            try execute("CREATE INDEX IF NOT EXISTS idx_memory_items_kind ON memory_items(kind)")
            try execute("CREATE INDEX IF NOT EXISTS idx_memory_items_status ON memory_items(status)")
            try execute("CREATE INDEX IF NOT EXISTS idx_memory_items_created ON memory_items(created_at)")
            try execute("CREATE INDEX IF NOT EXISTS idx_memory_sources_item ON memory_sources(memory_item_id)")

        default:
            throw MemoryStoreError.migrationFailed(version: version)
        }
    }

    // MARK: - SQL Helpers

    private enum SQLValue {
        case null
        case int(Int64)
        case real(Double)
        case text(String)
    }

    @discardableResult
    private func execute(_ sql: String, params: [SQLValue] = []) throws -> Int {
        guard let db else { throw MemoryStoreError.notOpen }
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else {
            throw MemoryStoreError.prepareFailed(sql: sql)
        }
        defer { sqlite3_finalize(stmt) }

        try bindParams(stmt, params: params)

        let rc = sqlite3_step(stmt)
        guard rc == SQLITE_DONE else {
            let msg = String(cString: sqlite3_errmsg(db))
            throw MemoryStoreError.executionFailed(message: msg)
        }

        return Int(sqlite3_changes(db))
    }

    private typealias Row = [String: Any]

    private func query(_ sql: String, params: [SQLValue] = []) throws -> [Row] {
        guard let db else { throw MemoryStoreError.notOpen }
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else {
            throw MemoryStoreError.prepareFailed(sql: sql)
        }
        defer { sqlite3_finalize(stmt) }

        try bindParams(stmt, params: params)

        var rows: [Row] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let colCount = sqlite3_column_count(stmt)
            var row: Row = [:]
            for i in 0..<colCount {
                let name = String(cString: sqlite3_column_name(stmt, i))
                let type = sqlite3_column_type(stmt, i)
                switch type {
                case SQLITE_NULL:
                    row[name] = NSNull()
                case SQLITE_INTEGER:
                    row[name] = Int(sqlite3_column_int64(stmt, i))
                case SQLITE_FLOAT:
                    row[name] = sqlite3_column_double(stmt, i)
                case SQLITE_TEXT:
                    row[name] = String(cString: sqlite3_column_text(stmt, i))
                case SQLITE_BLOB:
                    if let blob = sqlite3_column_blob(stmt, i) {
                        let len = Int(sqlite3_column_bytes(stmt, i))
                        row[name] = Data(bytes: blob, count: len)
                    }
                default:
                    break
                }
            }
            rows.append(row)
        }
        return rows
    }

    private func bindParams(_ stmt: OpaquePointer, params: [SQLValue]) throws {
        for (i, param) in params.enumerated() {
            let idx = Int32(i + 1)
            let rc: Int32
            switch param {
            case .null:
                rc = sqlite3_bind_null(stmt, idx)
            case .int(let val):
                rc = sqlite3_bind_int64(stmt, idx, val)
            case .real(let val):
                rc = sqlite3_bind_double(stmt, idx, val)
            case .text(let val):
                rc = sqlite3_bind_text(stmt, idx, val, -1, SQLITE_TRANSIENT)
            }
            guard rc == SQLITE_OK else {
                let msg = String(cString: sqlite3_errmsg(db))
                throw MemoryStoreError.executionFailed(message: msg)
            }
        }
    }

    // MARK: - Learner Facts

    /// Insert or update a profile fact (key-based upsert).
    func upsertProfileFact(_ fact: LearnerFact) throws {
        guard fact.isValid else { throw MemoryStoreError.invalidData }
        let now = Date().timeIntervalSince1970
        let existing = try query("SELECT id FROM learner_facts WHERE key = ?", params: [.text(fact.key)])

        if existing.isEmpty {
            try execute("""
                INSERT INTO learner_facts (id, key, value, category, confidence, source, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, params: [
                .text(fact.id.uuidString),
                .text(fact.key),
                .text(fact.value),
                fact.category.map { .text($0) } ?? .null,
                .real(fact.confidence),
                fact.source.map { .text($0) } ?? .null,
                .real(fact.createdAt.timeIntervalSince1970),
                .real(now)
            ])
        } else {
            try execute("""
                UPDATE learner_facts SET value = ?, category = ?, confidence = ?, source = ?, updated_at = ?
                WHERE key = ?
            """, params: [
                .text(fact.value),
                fact.category.map { .text($0) } ?? .null,
                .real(fact.confidence),
                fact.source.map { .text($0) } ?? .null,
                .real(now),
                .text(fact.key)
            ])
        }
    }

    /// Retrieve a profile fact by its unique key.
    func getProfileFact(key: String) throws -> LearnerFact? {
        let rows = try query("SELECT * FROM learner_facts WHERE key = ?", params: [.text(key)])
        return try rows.first.map { try rowToLearnerFact($0) }
    }

    /// List all profile facts, optionally filtered by category.
    func listProfileFacts(category: String? = nil) throws -> [LearnerFact] {
        if let category = category {
            return try query(
                "SELECT * FROM learner_facts WHERE category = ? ORDER BY updated_at DESC",
                params: [.text(category)]
            ).map { try rowToLearnerFact($0) }
        }
        return try query("SELECT * FROM learner_facts ORDER BY updated_at DESC")
            .map { try rowToLearnerFact($0) }
    }

    /// Delete a profile fact by its key.
    func deleteProfileFact(key: String) throws {
        try execute("DELETE FROM learner_facts WHERE key = ?", params: [.text(key)])
    }

    // MARK: - Memory Items

    /// Add a new memory item.
    func addMemoryItem(_ item: MemoryItem) throws {
        guard item.isValid else { throw MemoryStoreError.invalidData }
        try execute("""
            INSERT INTO memory_items
                (id, kind, content, confidence, status, source_kind, session_id, message_id, is_flagged_reference, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, params: [
            .text(item.id.uuidString),
            .text(item.kind.rawValue),
            .text(item.content),
            .real(item.confidence),
            .text(item.status.rawValue),
            .text(item.sourceKind.rawValue),
            item.sessionId.map { .text($0) } ?? .null,
            item.messageId.map { .text($0.uuidString) } ?? .null,
            .int(item.isFlaggedReference ? 1 : 0),
            .real(item.createdAt.timeIntervalSince1970),
            .real(item.updatedAt.timeIntervalSince1970)
        ])
    }

    /// Update select fields of a memory item by ID.
    func updateMemoryItem(id: UUID, confidence: Double? = nil, status: MemoryStatus? = nil, content: String? = nil) throws {
        guard confidence.map({ $0 >= 0.0 && $0 <= 1.0 }) ?? true else {
            throw MemoryStoreError.invalidConfidence
        }

        var sets: [String] = ["updated_at = ?"]
        var params: [SQLValue] = [.real(Date().timeIntervalSince1970)]

        if let confidence {
            sets.append("confidence = ?")
            params.append(.real(confidence))
        }
        if let status {
            sets.append("status = ?")
            params.append(.text(status.rawValue))
        }
        if let content {
            sets.append("content = ?")
            params.append(.text(content))
        }

        params.append(.text(id.uuidString))
        try execute(
            "UPDATE memory_items SET \(sets.joined(separator: ", ")) WHERE id = ?",
            params: params
        )
    }

    /// Soft-delete a memory item (sets status to `.forgotten`).
    func forgetMemoryItem(id: UUID) throws {
        try updateMemoryItem(id: id, status: .forgotten)
    }

    /// Archive a memory item (excluded from retrieval, but preserved).
    func archiveMemoryItem(id: UUID) throws {
        try updateMemoryItem(id: id, status: .archived)
    }

    /// List memory items with optional filtering and sorting.
    func listMemoryItems(filter: MemoryListFilter = MemoryListFilter()) throws -> [MemoryItem] {
        var conditions: [String] = ["status = ?"]
        var params: [SQLValue] = [.text(filter.status.rawValue)]

        if let kind = filter.kind {
            conditions.append("kind = ?")
            params.append(.text(kind.rawValue))
        }

        let orderClause: String
        switch filter.sortBy {
        case .createdAt: orderClause = "created_at"
        case .updatedAt: orderClause = "updated_at"
        case .confidence: orderClause = "confidence"
        }
        let direction = filter.sortOrder == .descending ? "DESC" : "ASC"

        let sql = """
            SELECT * FROM memory_items
            WHERE \(conditions.joined(separator: " AND "))
            ORDER BY \(orderClause) \(direction)
            LIMIT ? OFFSET ?
        """
        params.append(.int(Int64(filter.limit)))
        params.append(.int(Int64(filter.offset)))

        return try query(sql, params: params).map { try rowToMemoryItem($0) }
    }

    // MARK: - Sources

    /// Link a source to a memory item for provenance tracking.
    func linkSource(_ source: MemorySource) throws {
        try execute("""
            INSERT INTO memory_sources (id, memory_item_id, source_type, source_id, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, params: [
            .text(source.id.uuidString),
            .text(source.memoryItemId.uuidString),
            .text(source.sourceType),
            .text(source.sourceId),
            .real(source.createdAt.timeIntervalSince1970)
        ])
    }

    /// List all provenance sources linked to a memory item.
    func listSources(for memoryItemId: UUID) throws -> [MemorySource] {
        try query(
            "SELECT * FROM memory_sources WHERE memory_item_id = ? ORDER BY created_at",
            params: [.text(memoryItemId.uuidString)]
        ).map { try rowToMemorySource($0) }
    }

    // MARK: - Row Parsing

    private func rowToLearnerFact(_ row: Row) throws -> LearnerFact {
        guard let idStr = row["id"] as? String,
              let key = row["key"] as? String,
              let value = row["value"] as? String,
              let confidence = row["confidence"] as? Double,
              let createdAt = row["created_at"] as? Double,
              let updatedAt = row["updated_at"] as? Double,
              let id = UUID(uuidString: idStr)
        else { throw MemoryStoreError.invalidData }

        return LearnerFact(
            id: id,
            key: key,
            value: value,
            category: row["category"] as? String,
            confidence: confidence,
            source: row["source"] as? String,
            createdAt: Date(timeIntervalSince1970: createdAt),
            updatedAt: Date(timeIntervalSince1970: updatedAt)
        )
    }

    private func rowToMemoryItem(_ row: Row) throws -> MemoryItem {
        guard let idStr = row["id"] as? String,
              let kindRaw = row["kind"] as? String,
              let content = row["content"] as? String,
              let confidence = row["confidence"] as? Double,
              let statusRaw = row["status"] as? String,
              let sourceKindRaw = row["source_kind"] as? String,
              let flaggedInt = row["is_flagged_reference"] as? Int,
              let createdAt = row["created_at"] as? Double,
              let updatedAt = row["updated_at"] as? Double,
              let id = UUID(uuidString: idStr),
              let kind = MemoryKind(rawValue: kindRaw),
              let status = MemoryStatus(rawValue: statusRaw),
              let sourceKind = MemorySourceKind(rawValue: sourceKindRaw)
        else { throw MemoryStoreError.invalidData }

        let messageId: UUID? = (row["message_id"] as? String).flatMap(UUID.init(uuidString:))

        return MemoryItem(
            id: id,
            kind: kind,
            content: content,
            confidence: confidence,
            status: status,
            sourceKind: sourceKind,
            sessionId: row["session_id"] as? String,
            messageId: messageId,
            isFlaggedReference: flaggedInt != 0,
            createdAt: Date(timeIntervalSince1970: createdAt),
            updatedAt: Date(timeIntervalSince1970: updatedAt)
        )
    }

    private func rowToMemorySource(_ row: Row) throws -> MemorySource {
        guard let idStr = row["id"] as? String,
              let itemIdStr = row["memory_item_id"] as? String,
              let sourceType = row["source_type"] as? String,
              let sourceId = row["source_id"] as? String,
              let createdAt = row["created_at"] as? Double,
              let id = UUID(uuidString: idStr),
              let memoryItemId = UUID(uuidString: itemIdStr)
        else { throw MemoryStoreError.invalidData }

        return MemorySource(
            id: id,
            memoryItemId: memoryItemId,
            sourceType: sourceType,
            sourceId: sourceId,
            createdAt: Date(timeIntervalSince1970: createdAt)
        )
    }

    // MARK: - Convenience Queries

    /// Returns all memory items (for testing / debugging).
    func getAllItems() throws -> [MemoryItem] {
        try query("SELECT * FROM memory_items ORDER BY created_at DESC")
            .map { try rowToMemoryItem($0) }
    }

    /// Returns all learner facts (for testing / debugging).
    func getAllFacts() throws -> [LearnerFact] {
        try query("SELECT * FROM learner_facts ORDER BY updated_at DESC")
            .map { try rowToLearnerFact($0) }
    }

    /// Count memory items, optionally filtered by status.
    func countItems(status: MemoryStatus? = nil) throws -> Int {
        if let status = status {
            let rows = try query(
                "SELECT COUNT(*) as cnt FROM memory_items WHERE status = ?",
                params: [.text(status.rawValue)]
            )
            return (rows.first?["cnt"] as? Int) ?? 0
        }
        let rows = try query("SELECT COUNT(*) as cnt FROM memory_items")
        return (rows.first?["cnt"] as? Int) ?? 0
    }

    /// Count all learner facts.
    func countFacts() throws -> Int {
        let rows = try query("SELECT COUNT(*) as cnt FROM learner_facts")
        return (rows.first?["cnt"] as? Int) ?? 0
    }
}