import Foundation

/// A high-level organization unit in MathMate.
/// Each project binds together:
/// - a Synapse vault directory,
/// - a scoped set of session logs,
/// - and optionally a PDF textbook.
struct MathProject: Codable, Identifiable, Hashable, Sendable {
    let id: UUID
    var name: String
    var vaultPath: String
    var textbookPath: String?
    var defaultModel: String
    var defaultChatMode: ChatMode
    let createdAt: Date
    var archivedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, name, vaultPath, textbookPath, defaultModel, defaultChatMode, createdAt, archivedAt
    }

    init(
        id: UUID = UUID(),
        name: String,
        vaultPath: String,
        textbookPath: String? = nil,
        defaultModel: String = "google/gemini-3.1-flash-lite",
        defaultChatMode: ChatMode = .socratic,
        createdAt: Date = Date(),
        archivedAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.vaultPath = vaultPath
        self.textbookPath = textbookPath
        self.defaultModel = defaultModel
        self.defaultChatMode = defaultChatMode
        self.createdAt = createdAt
        self.archivedAt = archivedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(UUID.self, forKey: .id)
        self.name = try container.decode(String.self, forKey: .name)
        self.vaultPath = try container.decode(String.self, forKey: .vaultPath)
        self.textbookPath = try container.decodeIfPresent(String.self, forKey: .textbookPath)
        self.defaultModel = try container.decodeIfPresent(String.self, forKey: .defaultModel) ?? "google/gemini-3.1-flash-lite"
        self.defaultChatMode = try container.decodeIfPresent(ChatMode.self, forKey: .defaultChatMode) ?? .socratic
        self.createdAt = try container.decode(Date.self, forKey: .createdAt)
        self.archivedAt = try container.decodeIfPresent(Date.self, forKey: .archivedAt)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(name, forKey: .name)
        try container.encode(vaultPath, forKey: .vaultPath)
        try container.encodeIfPresent(textbookPath, forKey: .textbookPath)
        try container.encode(defaultModel, forKey: .defaultModel)
        try container.encode(defaultChatMode, forKey: .defaultChatMode)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encodeIfPresent(archivedAt, forKey: .archivedAt)
    }

    /// The absolute URL for the vault, resolving relative paths from the home directory.
    var resolvedVaultURL: URL {
        let path = vaultPath.trimmingCharacters(in: .whitespacesAndNewlines)
        if path.hasPrefix("/") {
            return URL(fileURLWithPath: path)
        }
        return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(path)
    }

    /// Whether the vault directory actually exists on disk.
    var vaultExists: Bool {
        var isDir: ObjCBool = false
        return FileManager.default.fileExists(
            atPath: resolvedVaultURL.path,
            isDirectory: &isDir
        ) && isDir.boolValue
    }

    /// The display name for the optional textbook.
    var textbookDisplayName: String? {
        guard let path = textbookPath else { return nil }
        return URL(fileURLWithPath: path).lastPathComponent
    }

    /// Whether a textbook PDF is configured and exists.
    var hasValidTextbook: Bool {
        guard let path = textbookPath else { return false }
        return FileManager.default.fileExists(atPath: path)
    }

    /// The directory where MathMate stores project-level caches (textbook index, etc.)
    var mathmateDirectoryURL: URL {
        resolvedVaultURL.appendingPathComponent(".mathmate", isDirectory: true)
    }

    /// Whether the textbook has been processed and an index exists.
    var hasTextbookIndex: Bool {
        let indexFile = mathmateDirectoryURL.appendingPathComponent("textbook_index.md")
        return FileManager.default.fileExists(atPath: indexFile.path)
    }

    /// The textbook metadata from the last processing run, if available.
    var textbookIndexMetadata: TextbookIndexMetadata? {
        let metaFile = mathmateDirectoryURL.appendingPathComponent("textbook_metadata.json")
        guard let data = try? Data(contentsOf: metaFile),
              let decoded = try? JSONDecoder().decode(TextbookIndexMetadata.self, from: data) else {
            return nil
        }
        return decoded
    }
}

/// Cached metadata from textbook PDF processing.
struct TextbookIndexMetadata: Codable, Sendable {
    let metadata: PdfMetadata
    let tocEntries: Int
    let chapters: [ChapterSummary]

    struct PdfMetadata: Codable, Sendable {
        let title: String
        let author: String
        let pageCount: Int

        enum CodingKeys: String, CodingKey {
            case title, author
            case pageCount = "page_count"
        }
    }

    struct ChapterSummary: Codable, Sendable {
        let title: String
        let startPage: Int

        enum CodingKeys: String, CodingKey {
            case title
            case startPage = "start_page"
        }
    }
}
