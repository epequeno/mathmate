import Foundation

@Observable
final class SessionStore {
    let sessionDirectory = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".mathmate/sessions")
    let snapshotDirectory = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".mathmate/sessions/snapshots")

    init() {
        try? FileManager.default.createDirectory(at: sessionDirectory, withIntermediateDirectories: true)
        try? FileManager.default.createDirectory(at: snapshotDirectory, withIntermediateDirectories: true)
    }

    func createSession(header: SessionHeader) throws {
        let fileURL = sessionDirectory.appendingPathComponent("\(header.id.uuidString).jsonl")
        let data = try JSONEncoder().encode(header)
        let line = String(data: data, encoding: .utf8)! + "\n"
        try line.write(to: fileURL, atomically: true, encoding: .utf8)
    }

    func appendMessage(_ message: Message, to sessionId: UUID) throws {
        let fileURL = sessionDirectory.appendingPathComponent("\(sessionId.uuidString).jsonl")
        let line = try _encodeMessageLine(message)

        if let handle = try? FileHandle(forWritingTo: fileURL) {
            handle.seekToEndOfFile()
            handle.write(line.data(using: .utf8)!)
            handle.closeFile()
        }
    }

    func replaceMessages(_ messages: [Message], to sessionId: UUID, header: SessionHeader? = nil) throws {
        let fileURL = sessionDirectory.appendingPathComponent("\(sessionId.uuidString).jsonl")

        let existingHeader: SessionHeader
        if let header {
            existingHeader = header
        } else if let decoded = loadHeader(for: sessionId) {
            existingHeader = decoded
        } else {
            return
        }

        let headerData = try JSONEncoder().encode(existingHeader)
        var lines: [String] = [String(data: headerData, encoding: .utf8)!]
        for message in messages {
            let line = try _encodeMessageLine(message).trimmingCharacters(in: .newlines)
            lines.append(line)
        }

        let payload = lines.joined(separator: "\n") + "\n"
        try payload.write(to: fileURL, atomically: true, encoding: .utf8)
    }

    @discardableResult
    func createCompactionSnapshot(for sessionId: UUID) throws -> URL {
        let sessionFileURL = sessionDirectory.appendingPathComponent("\(sessionId.uuidString).jsonl")
        let timestamp = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
        let snapshotURL = snapshotDirectory.appendingPathComponent("\(sessionId.uuidString)-\(timestamp).jsonl")
        try FileManager.default.copyItem(at: sessionFileURL, to: snapshotURL)
        return snapshotURL
    }

    @discardableResult
    func restoreLatestCompactionSnapshot(for sessionId: UUID) throws -> URL? {
        let prefix = "\(sessionId.uuidString)-"
        let snapshots = try FileManager.default.contentsOfDirectory(at: snapshotDirectory, includingPropertiesForKeys: [.contentModificationDateKey])
            .filter { $0.lastPathComponent.hasPrefix(prefix) }

        guard let latest = snapshots.max(by: { lhs, rhs in
            let lDate = (try? lhs.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let rDate = (try? rhs.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return lDate < rDate
        }) else {
            return nil
        }

        let sessionFileURL = sessionDirectory.appendingPathComponent("\(sessionId.uuidString).jsonl")
        if FileManager.default.fileExists(atPath: sessionFileURL.path) {
            try FileManager.default.removeItem(at: sessionFileURL)
        }
        try FileManager.default.copyItem(at: latest, to: sessionFileURL)
        return latest
    }

    func appendCompactionEntry(_ entry: SessionCompactionEntry, to sessionId: UUID) throws {
        let fileURL = sessionDirectory.appendingPathComponent("\(sessionId.uuidString).jsonl")
        let data = try JSONEncoder().encode(entry)
        let line = String(data: data, encoding: .utf8)! + "\n"
        if let handle = try? FileHandle(forWritingTo: fileURL) {
            handle.seekToEndOfFile()
            handle.write(line.data(using: .utf8)!)
            handle.closeFile()
        }
    }

    /// Reads only the first line (~header) from a session file.
    /// Uses FileHandle to avoid loading the entire JSONL into memory.
    func loadHeader(for sessionId: UUID) -> SessionHeader? {
        let fileURL = sessionDirectory.appendingPathComponent("\(sessionId.uuidString).jsonl")
        guard let handle = try? FileHandle(forReadingFrom: fileURL) else { return nil }
        defer { handle.closeFile() }

        // Headers are small — read up to 4KB to find the first newline
        let headerData = handle.readData(ofLength: 4096)
        guard let lineEnd = headerData.firstIndex(of: UInt8(ascii: "\n")) else { return nil }
        return try? JSONDecoder().decode(SessionHeader.self, from: headerData[..<lineEnd])
    }

    func allHeaders(forProjectId: UUID? = nil) -> [SessionHeader] {
        guard let files = try? FileManager.default.contentsOfDirectory(at: sessionDirectory, includingPropertiesForKeys: nil) else { return [] }
        let headers: [SessionHeader] = files.compactMap { file in
            guard let handle = try? FileHandle(forReadingFrom: file) else { return nil }
            defer { handle.closeFile() }
            let headerData = handle.readData(ofLength: 4096)
            guard let lineEnd = headerData.firstIndex(of: UInt8(ascii: "\n")) else { return nil }
            return try? JSONDecoder().decode(SessionHeader.self, from: headerData[..<lineEnd])
        }
        let filtered = forProjectId == nil
            ? headers
            : headers.filter { $0.projectId == forProjectId }
        return filtered.sorted(by: { $0.lastActivity > $1.lastActivity })
    }
    
    func loadMessages(for sessionId: UUID) -> [Message] {
        let fileURL = sessionDirectory.appendingPathComponent("\(sessionId.uuidString).jsonl")
        guard let handle = try? FileHandle(forReadingFrom: fileURL) else { return [] }
        defer { handle.closeFile() }

        // Skip the header line
        var headerSkipped = false
        var messages: [Message] = []
        messages.reserveCapacity(128)

        var buffer = Data()
        let newline = UInt8(ascii: "\n")

        while true {
            let chunk = handle.readData(ofLength: 65536)
            if chunk.isEmpty { break }
            buffer.append(chunk)

            // Process complete lines in the buffer
            while let nl = buffer.firstIndex(of: newline) {
                let lineRange = 0..<nl
                let lineData = buffer[lineRange]
                buffer.removeSubrange(0...(nl))

                if !headerSkipped {
                    headerSkipped = true
                    continue
                }

                guard !lineData.isEmpty else { continue }

                do {
                    let dict = try JSONSerialization.jsonObject(with: lineData) as? [String: Any]
                    guard dict?["type"] as? String == "message" else { continue }
                    var mDict = dict!
                    mDict.removeValue(forKey: "type")
                    let cleanedData = try JSONSerialization.data(withJSONObject: mDict)
                    if let msg = try? JSONDecoder().decode(Message.self, from: cleanedData) {
                        messages.append(msg)
                    }
                } catch {
                    continue
                }
            }
        }

        return messages
    }

    /// Counts messages by streaming through newline characters.
    /// Avoids loading the entire file into memory.
    func countMessages(for sessionId: UUID) -> Int {
        let fileURL = sessionDirectory.appendingPathComponent("\(sessionId.uuidString).jsonl")
        guard let handle = try? FileHandle(forReadingFrom: fileURL) else { return 0 }
        defer { handle.closeFile() }

        let newline = UInt8(ascii: "\n")
        var count = 0
        while true {
            let chunk = handle.readData(ofLength: 65536) // 64KB chunks
            if chunk.isEmpty { break }
            for byte in chunk where byte == newline {
                count += 1
            }
        }
        return max(0, count - 1) // minus header line
    }

    /// Updates the session header in-place using data-level operations.
    /// Avoids loading/splitting/joining the full file as a string.
    func updateHeader(_ header: SessionHeader) throws {
        let fileURL = sessionDirectory.appendingPathComponent("\(header.id.uuidString).jsonl")
        let headerData = try JSONEncoder().encode(header)
        let newlineData = Data([UInt8(ascii: "\n")])
        let headerLine = headerData + newlineData

        // Find the offset of the first newline to locate where message data starts
        guard let handle = try? FileHandle(forReadingFrom: fileURL) else { return }
        defer { handle.closeFile() }

        let chunkSize = 65536
        var restOffset: UInt64 = 0
        var endOfHeader = false
        while !endOfHeader {
            let chunk = handle.readData(ofLength: chunkSize)
            if chunk.isEmpty { break }
            if let nl = chunk.firstIndex(of: UInt8(ascii: "\n")) {
                restOffset += UInt64(nl + 1)
                endOfHeader = true
            } else {
                restOffset += UInt64(chunk.count)
            }
        }

        guard restOffset > 0 else { return } // empty or malformed file

        try handle.seek(toOffset: restOffset)
        let restData = handle.readDataToEndOfFile()
        handle.closeFile()

        // Rewrite: new header + unchanged rest
        var newData = Data()
        newData.append(headerLine)
        newData.append(restData)
        try newData.write(to: fileURL, options: .atomic)
    }

    func archiveSession(_ id: UUID) throws {
        var header = loadHeader(for: id)
        header?.isArchived = true
        if let header = header {
            try updateHeader(header)
        }
    }

    func deleteSession(_ id: UUID) throws {
        let fileURL = sessionDirectory.appendingPathComponent("\(id.uuidString).jsonl")
        try FileManager.default.removeItem(at: fileURL)
    }

    private func _encodeMessageLine(_ message: Message) throws -> String {
        let data = try JSONEncoder().encode(message)
        return "{\"type\":\"message\"" + "," + String(data: data, encoding: .utf8)!.dropFirst(1) + "\n"
    }
}

struct SessionHeader: Codable, Identifiable {
    let id: UUID
    var name: String
    var customName: String?
    let createdAt: Date
    var lastActivity: Date
    let model: String
    let provider: String
    /// Optional project association. When set, the session belongs to a specific project.
    var projectId: UUID?
    /// Whether the session is archived. Archived sessions persist on disk
    /// but are hidden from the main sidebar UI by default.
    var isArchived: Bool = false
    var displayName: String { customName ?? name }
}

struct SessionCompactionEntry: Codable {
    var type: String = "compaction"
    let id: UUID
    let timestamp: Date
    let summary: String
    let firstKeptMessageIndex: Int
    let tokensBefore: Int
    let customInstructions: String?
    let snapshotPath: String?

    init(summary: String, firstKeptMessageIndex: Int, tokensBefore: Int, customInstructions: String?, snapshotPath: String?) {
        self.id = UUID()
        self.timestamp = Date()
        self.summary = summary
        self.firstKeptMessageIndex = firstKeptMessageIndex
        self.tokensBefore = tokensBefore
        self.customInstructions = customInstructions
        self.snapshotPath = snapshotPath
    }
}
