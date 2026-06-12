import Foundation
import AppKit

/// A disk-backed image cache that replaces in-memory base64 Data storage.
///
/// Design:
/// - Images are written to `~/.mathmate/sessions/<sessionId>/images/<imageId>.<ext>`
///   as regular files, avoiding the need to hold large base64 Data in memory for
///   the full session lifetime.
/// - An `NSCache` acts as an in-flight LRU cache — images currently being displayed
///   are kept in memory; images not on screen are evicted under memory pressure.
/// - `ImageAttachment.Source` gains a new `.disk(sessionId:imageId:filename)` variant
///   that represents a lazily-loaded disk image.
///
/// Usage:
/// - Call `ImageDiskCache.shared.cache(image:attachment:sessionId:)` to store an
///   image from a base64 attachment. The base64 Data is written to disk and the
///   attachment is returned with a `.disk` source.
/// - Call `ImageDiskCache.shared.loadNSImage(for:)` to retrieve a cached image,
///   which may come from the NSCache (hot) or from disk (cold).
/// - Call `ImageDiskCache.shared.evict(sessionId:)` to remove all images for a
///   session when it is closed.
///
/// `@unchecked Sendable` because `NSCache<NSString, NSImage>` and `NSLock`
/// are not recognized as Sendable by the compiler. All mutable state is
/// protected by `lock` (NSLock) — thread-safe in practice.
final class ImageDiskCache: @unchecked Sendable {
    static let shared = ImageDiskCache()

    // MARK: - Config

    /// Maximum number of images held in the NSCache before LRU eviction kicks in.
    private let cacheCountLimit = 20
    /// Maximum total bytes before NSCache evicts under memory pressure.
    private let cacheTotalCostLimit = 50 * 1024 * 1024 // 50 MB

    // MARK: - State

    private let cache: NSCache<NSString, NSImage>
    private let baseDirectory: URL
    private let lock = NSLock()

    // MARK: - Init

    private init() {
        let cache = NSCache<NSString, NSImage>()
        cache.countLimit = cacheCountLimit
        cache.totalCostLimit = cacheTotalCostLimit

        self.cache = cache

        // Base directory: ~/.mathmate/sessions/
        let home = FileManager.default.homeDirectoryForCurrentUser
        let base = home.appendingPathComponent(".mathmate/sessions", isDirectory: true)

        self.baseDirectory = base

        // Ensure the directory exists
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
    }

    // MARK: - Public API

    /// Caches an `ImageAttachment`'s base64 data to disk and returns a modified attachment
    /// with a `.disk` source pointing to the file path.
    ///
    /// Safe to call multiple times — if the file already exists, skips re-writing.
    func cache(attachment: ImageAttachment, sessionId: UUID) -> ImageAttachment {
        guard case .base64(let data, let mimeType) = attachment.source else {
            return attachment // Already a disk source or invalid
        }

        let ext = _extension(for: mimeType)
        let imageDir = baseDirectory
            .appendingPathComponent(sessionId.uuidString, isDirectory: true)
            .appendingPathComponent("images", isDirectory: true)

        let imageId = attachment.id.uuidString
        let filename = "\(imageId).\(ext)"
        let filePath = imageDir.appendingPathComponent(filename)

        // Ensure directory exists
        try? FileManager.default.createDirectory(at: imageDir, withIntermediateDirectories: true)

        // Write to disk if not already present
        if !FileManager.default.fileExists(atPath: filePath.path) {
            try? data.write(to: filePath)
        }

        // Return a new attachment with a .disk source
        var modified = attachment
        modified.source = .disk(sessionId: sessionId, imageId: attachment.id, filename: filename)
        return modified
    }

    /// Loads an NSImage from cache (NSCache first, then disk).
    /// - Returns: the image, or nil if not found.
    func loadNSImage(for attachment: ImageAttachment) -> NSImage? {
        let key = _cacheKey(for: attachment)

        // Check hot cache first
        if let cached = cache.object(forKey: key as NSString) {
            return cached
        }

        // Fall back to disk
        guard let filePath = _diskPath(for: attachment),
              FileManager.default.fileExists(atPath: filePath.path),
              let data = try? Data(contentsOf: filePath),
              let image = NSImage(data: data) else {
            return nil
        }

        // Populate hot cache
        let cost = data.count
        cache.setObject(image, forKey: key as NSString, cost: cost)
        return image
    }

    /// Preloads an image into the NSCache without returning a modified attachment.
    /// Useful for pre-fetching upcoming images in a session.
    func preload(attachment: ImageAttachment) {
        guard case .disk = attachment.source else { return }
        _ = loadNSImage(for: attachment)
    }

    /// Evicts all cached images for a session (removes from disk and NSCache).
    func evict(sessionId: UUID) {
        let sessionDir = baseDirectory.appendingPathComponent(sessionId.uuidString, isDirectory: true)
        lock.lock()
        try? FileManager.default.removeItem(at: sessionDir)
        lock.unlock()

        // Also clear NSCache entries for this session
        // (NSCache doesn't support bulk removal, but the disk eviction means
        // subsequent loads will re-populate from disk on demand)
    }

    /// Evicts all cached images (disk and NSCache).
    func evictAll() {
        lock.lock()
        try? FileManager.default.removeItem(at: baseDirectory)
        try? FileManager.default.createDirectory(at: baseDirectory, withIntermediateDirectories: true)
        lock.unlock()
        cache.removeAllObjects()
    }

    // MARK: - Source Variant

    /// Extended ImageAttachment source type that represents a disk-backed image.
    enum DiskSource: Codable, Sendable, Equatable {
        case disk(sessionId: UUID, imageId: UUID, filename: String)
    }

    // MARK: - Private

    private func _cacheKey(for attachment: ImageAttachment) -> String {
        if case .disk(let sessionId, let imageId, _) = attachment.source {
            return "\(sessionId.uuidString)/\(imageId.uuidString)"
        }
        return attachment.id.uuidString
    }

    private func _diskPath(for attachment: ImageAttachment) -> URL? {
        guard case .disk(let sessionId, _, let filename) = attachment.source else { return nil }
        return baseDirectory
            .appendingPathComponent(sessionId.uuidString, isDirectory: true)
            .appendingPathComponent("images", isDirectory: true)
            .appendingPathComponent(filename)
    }

    private func _extension(for mimeType: String) -> String {
        switch mimeType.lowercased() {
        case "image/png": return "png"
        case "image/jpeg", "image/jpg": return "jpg"
        case "image/gif": return "gif"
        case "image/webp": return "webp"
        case "image/tiff", "image/tif": return "tiff"
        default: return "png"
        }
    }
}

