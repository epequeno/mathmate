import SwiftUI

// MARK: - Color + Hex Init

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 6:
            (a, r, g, b) = (255, (int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = ((int >> 24) & 0xFF, (int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB,
                  red:     Double(r) / 255,
                  green:   Double(g) / 255,
                  blue:    Double(b) / 255,
                  opacity: Double(a) / 255)
    }
}

// MARK: - Color + Dynamic

extension Color {
    /// Returns a `Color` that automatically resolves to `light` or `dark`
    /// based on the current macOS appearance (including when the app appearance
    /// is forced via `NSApplication.shared.appearance`).
    static func dynamic(light: Color, dark: Color) -> Color {
        Color(NSColor(name: nil) { appearance in
            switch appearance.bestMatch(from: [.darkAqua, .aqua]) {
            case .darkAqua: return NSColor(dark)
            default:        return NSColor(light)
            }
        })
    }
}

// MARK: - App Theme
//
// Semantic design tokens.
//
// Light mood: "bookish" — warm parchment, ink, deep navy
// Dark mood:  "subterranean" — cave floor, worn slate, lapis lazuli
//
// Usage rules:
//   • `accent`     — text, icons, thin strokes, progress bar fills
//   • `accentFill` — solid button / row / avatar backgrounds
//   • `accentSubtle` — tinted formula boxes, user message bubbles, chip backgrounds

enum AppTheme {

    // MARK: - Backgrounds

    /// Main content area (message list, main panel)
    static let background = Color.dynamic(
        light: Color(hex: "#F7F4EE"),
        dark:  Color(hex: "#232120")
    )

    /// Chrome surfaces (sidebar, toolbar, tab bar, context panel, input bar)
    static let backgroundElevated = Color.dynamic(
        light: Color(hex: "#EDEAE2"),
        dark:  Color(hex: "#1C1A18")
    )

    /// Card / input field surfaces (popovers, modal sheets, text inputs, rows)
    static let surface = Color.dynamic(
        light: .white,
        dark:  Color(hex: "#2C2926")
    )

    // MARK: - Borders

    /// Dividers, separators, strokes
    static let border = Color.dynamic(
        light: Color(hex: "#D2CEBC"),
        dark:  Color(hex: "#3C3834")
    )

    // MARK: - Text

    static let textPrimary = Color.dynamic(
        light: Color(hex: "#1A1714"),
        dark:  Color(hex: "#E8E3D9")
    )

    static let textSecondary = Color.dynamic(
        light: Color(hex: "#7A7167"),
        dark:  Color(hex: "#9A9088")
    )

    static let textTertiary = Color.dynamic(
        light: Color(hex: "#A89F95"),
        dark:  Color(hex: "#6E6860")
    )

    static let textMuted = Color.dynamic(
        light: Color(hex: "#C0BAB0"),
        dark:  Color(hex: "#4A4640")
    )

    // MARK: - Accent (lapis lazuli / deep navy)

    /// For text, icons, thin strokes, progress bar fills — lightens in dark mode
    static let accent = Color.dynamic(
        light: Color(hex: "#2B4B8C"),
        dark:  Color(hex: "#5A7ED4")
    )

    /// For solid button / selected-row / avatar backgrounds — stays recognisably blue
    static let accentFill = Color.dynamic(
        light: Color(hex: "#2B4B8C"),
        dark:  Color(hex: "#3A5CA8")
    )

    /// Tinted background for formula boxes, user bubbles, topic chips
    static let accentSubtle = Color.dynamic(
        light: Color(hex: "#EBF0FA"),
        dark:  Color(hex: "#1A2845")
    )

    /// Border for accentSubtle-backed elements
    static let accentSubtleBorder = Color.dynamic(
        light: Color(hex: "#C5D3EF"),
        dark:  Color(hex: "#2A4078")
    )

    /// User message bubble — clearly identifiable in both modes
    static let userBubble = Color.dynamic(
        light: Color(hex: "#EBF0FA"),
        dark:  Color(hex: "#3A5CA8")
    )

    // MARK: - Semantic states

    static let green = Color.dynamic(
        light: Color(hex: "#4A9E6A"),
        dark:  Color(hex: "#4CAF7A")
    )

    static let red = Color.dynamic(
        light: Color(hex: "#B5473E"),
        dark:  Color(hex: "#D45B52")
    )

    static let amber = Color.dynamic(
        light: Color(hex: "#B8956A"),
        dark:  Color(hex: "#C9A97A")
    )
}
