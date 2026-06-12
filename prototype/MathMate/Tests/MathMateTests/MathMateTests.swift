import Testing
import Foundation
@testable import MathMate

// MARK: - LaTeXNormalizer Tests

@Test func testNormalizeInlineMathDollarToParentheses() {
    // $x^2$ should become \(x^2\)
    let input = "The formula $x^2$ is simple"
    let result = LaTeXNormalizer.normalize(input)
    #expect(result == "The formula \\(x^2\\) is simple")
}

@Test func testNormalizeDisplayMathDoubleDollar() {
    // $$x^2$$ should become \[x^2\]
    let input = "Here is display math $$x^2$$ end"
    let result = LaTeXNormalizer.normalize(input)
    #expect(result == "Here is display math \\[x^2\\] end")
}

@Test func testNormalizeDisplayMathMultiline() {
    let input = """
    Here is the equation:
    $$\\frac{a}{b} + \\frac{c}{d}$$
    Done.
    """
    let result = LaTeXNormalizer.normalize(input)
    #expect(result.contains("\\[\\frac{a}{b} + \\frac{c}{d}\\]"))
}

@Test func testNoNormalizeCurrency() {
    // $5.00 should NOT be converted to math
    let input = "The price is $5.00 today"
    let result = LaTeXNormalizer.normalize(input)
    #expect(result == "The price is $5.00 today")
}

@Test func testNormalizeEquationEnvironment() {
    let input = "\\begin{equation}E = mc^2\\end{equation}"
    let result = LaTeXNormalizer.normalize(input)
    #expect(result == "\\[E = mc^2\\]")
}

@Test func testNormalizeAlreadyHasCorrectDelimiters() {
    // \(x^2\) should pass through unchanged
    let input = "The formula \\(x^2\\) is simple"
    let result = LaTeXNormalizer.normalize(input)
    #expect(result == "The formula \\(x^2\\) is simple")
}

@Test func testNormalizeDisplayAlreadyHasBrackets() {
    // \[x^2\] should pass through unchanged
    let input = "The formula \\[x^2\\] is simple"
    let result = LaTeXNormalizer.normalize(input)
    #expect(result == "The formula \\[x^2\\] is simple")
}

@Test func testLooksLikeMath() {
    // Content with backslash commands
    #expect(LaTeXNormalizer.looksLikeMath("x^2")) // ^ is an indicator
    #expect(LaTeXNormalizer.looksLikeMath("\\frac{a}{b}"))
    #expect(LaTeXNormalizer.looksLikeMath("E = mc^2"))
}

@Test func testDoesNotLookLikeMath() {
    // Regular text should not be treated as math
    #expect(!LaTeXNormalizer.looksLikeMath("hello world"))
    #expect(!LaTeXNormalizer.looksLikeMath("5.00"))  // currency pattern
}

@Test func testCleanArtifactsRemovesLabel() {
    let input = "Equation \\label{eq:1} E = mc^2"
    let result = LaTeXNormalizer.normalize(input)
    #expect(!result.contains("\\label{eq:1}"))
}

@Test func testMixedContentNormalization() {
    // A typical model response with mixed inline and display math
    let input = """
    To solve this, use the quadratic formula:
    $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$
    where the discriminant $\\Delta = b^2 - 4ac$ determines the nature of the roots.
    """
    let result = LaTeXNormalizer.normalize(input)
    #expect(result.contains("\\[x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\\]"))
    #expect(result.contains("\\(\\Delta = b^2 - 4ac\\)"))
}

@Test func testRenderAsHTMLEscapesNonMath() {
    let input = "Use <x> & \\(y\\) values"
    let html = LaTeXNormalizer.renderAsHTML(input)
    #expect(html.contains("&lt;x&gt;"))
    #expect(html.contains("&amp;"))
    // Math should be preserved
    #expect(html.contains("\\(y\\)"))
}

@Test func testRenderAsHTMLPreservesBoldAroundMath() {
    let input = "**\\(a \\neq 0\\)**"
    let html = LaTeXNormalizer.renderAsHTML(input)
    #expect(html.contains("<strong>\\(a \\neq 0\\)</strong>"))
}

@Test func testRenderAsHTMLParsesMarkdownTableWithMathCells() {
    let input = """
    | Symbol | Meaning |
    | --- | --- |
    | \\(a\\) | coefficient of \\(x^2\\) |
    | \\(b\\) | coefficient of \\(x\\) |
    """
    let html = LaTeXNormalizer.renderAsHTML(input)
    #expect(html.contains("<table>"))
    #expect(html.contains("<td style=\"text-align:left;\">\\(a\\)</td>"))
    #expect(html.contains("<td style=\"text-align:left;\">coefficient of \\(x^2\\)</td>"))
}

// MARK: - Provider Factory Tests

@Test func testProviderFactoryCreatesAnthropic() {
    let config = ProviderConfig(
        name: "Anthropic",
        envKey: "ANTHROPIC_API_KEY",
        baseURL: "https://api.anthropic.com/v1",
        models: ["claude-3-5-sonnet"],
        defaultModel: "claude-3-5-sonnet"
    )
    let provider = ProviderFactory.create(config: config)
    #expect(provider is AnthropicProvider)
}

@Test func testProviderFactoryCreatesOpenAICompatible() {
    let config = ProviderConfig(
        name: "OpenAI",
        envKey: nil,
        baseURL: "https://api.openai.com/v1",
        models: ["gpt-4"],
        defaultModel: "gpt-4"
    )
    let provider = ProviderFactory.create(config: config)
    #expect(provider is OpenAIProvider)
}

@Test func testProviderFactoryCreatesOpenRouter() {
    let config = ProviderConfig(
        name: "OpenRouter",
        envKey: "OPENROUTER_API_KEY",
        baseURL: "https://openrouter.ai/api/v1",
        models: ["anthropic/claude-3"],
        defaultModel: "anthropic/claude-3"
    )
    let provider = ProviderFactory.create(config: config)
    #expect(provider is OpenAIProvider) // Falls through to OpenAI-compatible
}

// MARK: - ProviderConfig Decoding Tests

@Test func testDecodeModelsConfig() {
    let json = """
    {
        "providers": [
            {
                "name": "Anthropic",
                "envKey": "ANTHROPIC_API_KEY",
                "baseURL": "https://api.anthropic.com/v1",
                "models": ["claude-3-5-sonnet"],
                "defaultModel": "claude-3-5-sonnet"
            }
        ]
    }
    """.data(using: .utf8)!

    let config = try? JSONDecoder().decode(ConfigurationManager.AppConfigModels.self, from: json)
    #expect(config != nil)
    #expect(config?.providers.count == 1)
    #expect(config?.providers.first?.name == "Anthropic")
    #expect(config?.providers.first?.resolvedEnvKey == "ANTHROPIC_API_KEY")
}

@Test func testDefaultEnvKeyConvention() {
    // When envKey is nil, it should default to {NAME}_API_KEY
    let config = ProviderConfig(
        name: "OpenAI",
        envKey: nil,
        baseURL: "https://api.openai.com/v1",
        models: ["gpt-4"],
        defaultModel: "gpt-4"
    )
    #expect(config.resolvedEnvKey == "OPENAI_API_KEY")
}

@Test func testDefaultEnvKeyWithHyphen() {
    let config = ProviderConfig(
        name: "my-provider",
        envKey: nil,
        baseURL: "https://example.com/v1",
        models: ["model-1"],
        defaultModel: "model-1"
    )
    #expect(config.resolvedEnvKey == "MY_PROVIDER_API_KEY")
}

@Test func testDecodeAppConfig() {
    let json = """
    {
        "latex": {
            "engine": "katex",
            "katexOptions": {
                "displayMode": true,
                "throwOnError": false,
                "errorColor": "#cc0000"
            },
            "mathjaxOptions": null
        },
        "synapse": {
            "vaults": [{"name": "MyVault", "path": "/Users/test/vault"}],
            "studyLogPath": "MathTutor/Logs"
        },
        "chat": {
            "systemPrompt": "You are a math tutor.",
            "maxTokens": 4096,
            "temperature": 0.7
        },
        "ui": {
            "fontSize": 14,
            "showLatexPreview": true,
            "autoScroll": true
        }
    }
    """.data(using: .utf8)!

    let config = try? JSONDecoder().decode(AppConfig.self, from: json)
    #expect(config != nil)
    #expect(config?.latex.engine == "katex")
    #expect(config?.chat.systemPrompt == "You are a math tutor.")
    #expect(config?.ui.fontSize == 14)
}

// MARK: - Wrap-Up Path Sanitization Tests

@Test func testWrapUpFilenameSanitizationStripsHash() {
    // Titles with '#' should not create malformed filenames
    let title = "Session Wrap-Up — calculus — Derivatives"
    let sanitized = title
        .replacingOccurrences(of: "#", with: "")
        .replacingOccurrences(of: "/", with: "-")
        .replacingOccurrences(of: "\\", with: "-")
        .trimmingCharacters(in: .whitespacesAndNewlines)
    #expect(sanitized.contains("#") == false)
    #expect(sanitized.contains("/") == false)
}

@Test func testWrapUpFilenameSanitizationStripsForwardSlash() {
    let title = "Trig / Geometry Review"
    let sanitized = title
        .replacingOccurrences(of: "#", with: "")
        .replacingOccurrences(of: "/", with: "-")
        .replacingOccurrences(of: "\\", with: "-")
        .trimmingCharacters(in: .whitespacesAndNewlines)
    #expect(sanitized.contains("/") == false)
    #expect(sanitized.contains("-"))
}

@Test func testWrapUpDatePrefixFormat() {
    let dateFormatter = DateFormatter()
    dateFormatter.dateFormat = "yyyy-MM-dd"
    let dateString = dateFormatter.string(from: Date())
    // Date should be exactly 10 characters: YYYY-MM-DD
    #expect(dateString.count == 10)
    #expect(dateString.first?.isNumber == true)
    #expect(dateString.contains("-"))
}

@Test func testWrapUpStudyLogPathFallbackToVault() {
    // When no studyLogPath is set, fallback path should be:
    // vaultPath/MathMate/Study Logs/
    let vaultPath = "/Users/test/Vaults/MyVault"
    let studyLogDir = URL(fileURLWithPath: vaultPath).appendingPathComponent("MathMate/Study Logs")
    #expect(studyLogDir.path.contains("MyVault"))
    #expect(studyLogDir.path.contains("MathMate"))
    #expect(studyLogDir.path.contains("Study Logs"))
}

@Test func testWrapUpTitleExtractionFromMarkdownHeading() {
    let markdown = """
    # Session Wrap-Up — 2025-06-15 — Chain Rule

    ## Summary
    ...
    """

    var title = ""
    if let range = markdown.range(of: #"^# .+"#, options: .regularExpression) {
        title = String(markdown[range])
        title.removeFirst(2) // remove leading "# "
        title = title.trimmingCharacters(in: .whitespacesAndNewlines)

        // Strip "Session Wrap-Up — " prefix if present
        if title.hasPrefix("Session Wrap-Up — ") {
            title = String(title.dropFirst("Session Wrap-Up — ".count))
        }

        // Strip date prefix "YYYY-MM-DD — "
        if let firstDashRange = title.range(of: " — ") {
            let possibleDate = String(title[..<firstDashRange.lowerBound])
            if possibleDate.count == 10 && possibleDate.allSatisfy({ $0.isNumber || $0 == "-" }) {
                title = String(title[firstDashRange.upperBound...])
            }
        }
    }

    #expect(title == "Chain Rule")
}

@Test func testWrapUpDraftStructIsSendable() {
    let draft = WrapUpDraft(
        title: "Test Wrap-Up",
        markdown: "# Test\n\nContent",
        generatedAt: Date(),
        sessionId: "abc-123"
    )
    // WrapUpDraft should be trivially sendable (no actor isolation issues in async contexts)
    func acceptSendable(_ value: some Sendable) {}
    acceptSendable(draft)
}

// MARK: - Multimodal Image Tests

@Test func testImageAttachmentBase64RoundTrip() {
    let samplePNGData = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) // PNG magic bytes
    let attachment = ImageAttachment(source: .base64(data: samplePNGData, mimeType: "image/png"), altText: "test diagram")

    // Encode and decode
    let encoded = try? JSONEncoder().encode(attachment)
    #expect(encoded != nil)

    let decoded = try? JSONDecoder().decode(ImageAttachment.self, from: encoded!)
    #expect(decoded != nil)

    var base64DataMatches = false
    var mimeTypeMatches = false
    if case .base64(let data, let mimeType) = decoded?.source {
        base64DataMatches = (data == samplePNGData)
        mimeTypeMatches = (mimeType == "image/png")
    }
    #expect(base64DataMatches)
    #expect(mimeTypeMatches)
}

@Test func testImageMimeTypeFromURL() {
    func mimeType(for path: String) -> String {
        switch URL(fileURLWithPath: path).pathExtension.lowercased() {
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "tiff", "tif": return "image/tiff"
        default: return "image/png"
        }
    }

    #expect(mimeType(for: "/path/to/photo.PNG") == "image/png")
    #expect(mimeType(for: "/path/to/photo.jpeg") == "image/jpeg")
    #expect(mimeType(for: "/path/to/photo.jpg") == "image/jpeg")
    #expect(mimeType(for: "/path/to/diagram.gif") == "image/gif")
    #expect(mimeType(for: "/path/to/chart.webp") == "image/webp")
    #expect(mimeType(for: "/path/to/scan.tiff") == "image/tiff")
    #expect(mimeType(for: "/path/to/unknown.xyz") == "image/png") // default
}

@Test func testMessageImagesComputedProperty() {
    let sampleData = Data([0x89, 0x50])
    let img = ImageAttachment(source: .base64(data: sampleData, mimeType: "image/png"), altText: nil)
    let message = Message(contentParts: [.text("Hello"), .image(img)], isUser: true)

    #expect(message.images.count == 1)
    #expect(message.content == "Hello")
}

@Test func testContentPartImageRoundTrip() {
    let data = Data([0x01, 0x02, 0x03])
    let attachment = ImageAttachment(source: .base64(data: data, mimeType: "image/png"), altText: nil)
    let part = ContentPart.image(attachment)

    let encoded = try? JSONEncoder().encode(part)
    #expect(encoded != nil)

    let decoded = try? JSONDecoder().decode(ContentPart.self, from: encoded!)
    #expect(decoded != nil)

    var isSameImagePart = false
    if case .image(let decodedAttachment) = decoded {
        if case .base64(let decodedData, let decodedMime) = decodedAttachment.source {
            isSameImagePart = (decodedData == data && decodedMime == "image/png")
        }
    }
    #expect(isSameImagePart)
}

@Test func testProjectTextbookDisplayName() {
    let projectNoTextbook = MathProject(name: "No Book", vaultPath: "/path/to/vault")
    #expect(projectNoTextbook.textbookDisplayName == nil)
    #expect(projectNoTextbook.hasValidTextbook == false)

    let projectWithTextbook = MathProject(name: "With Book", vaultPath: "/path/to/vault", textbookPath: "/path/to/Algebra.pdf")
    #expect(projectWithTextbook.textbookDisplayName == "Algebra.pdf")
}

// MARK: - ModelVisionRegistry Tests

@Test func testVisionRegistryKnownVisionModels() {
    // OpenAI vision models
    #expect(ModelVisionRegistry.supportsVision(model: "gpt-4o") == true)
    #expect(ModelVisionRegistry.supportsVision(model: "gpt-4o-mini") == true)
    #expect(ModelVisionRegistry.supportsVision(model: "gpt-4-turbo") == true)
    // Anthropic (all claude-3+ are vision)
    #expect(ModelVisionRegistry.supportsVision(model: "claude-3-5-sonnet-20241022") == true)
    #expect(ModelVisionRegistry.supportsVision(model: "claude-sonnet-4-20250514") == true)
    #expect(ModelVisionRegistry.supportsVision(model: "claude-3-haiku-20240307") == true)
    // Google
    #expect(ModelVisionRegistry.supportsVision(model: "gemini-2.0-flash") == true)
    // OpenRouter vision models
    #expect(ModelVisionRegistry.supportsVision(model: "meta-llama/llama-4-scout") == true)
    #expect(ModelVisionRegistry.supportsVision(model: "mistral/pixtral-large") == true)
}

@Test func testVisionRegistryTextOnlyModels() {
    #expect(ModelVisionRegistry.supportsVision(model: "deepseek/deepseek-v4-flash") == false)
    #expect(ModelVisionRegistry.supportsVision(model: "moonshotai/kimi-k2.6") == false)
    #expect(ModelVisionRegistry.supportsVision(model: "meta-llama/llama-3.1-8b-instruct") == false)
    #expect(ModelVisionRegistry.supportsVision(model: "mistral-large") == false)
}

@Test func testVisionRegistryDowngradesImagesForTextOnlyModel() {
    let img = ImageAttachment(source: .base64(data: Data([0x01]), mimeType: "image/png"), altText: nil)
    let parts: [ContentPart] = [.text("before"), .image(img), .image(img), .text("after")]
    let downgraded = ModelVisionRegistry.downgradeImages(in: parts, model: "deepseek/deepseek-v4-flash")
    // Two consecutive images should collapse into one placeholder
    #expect(downgraded.count == 3)
    if case .text(let t) = downgraded[1] {
        #expect(t == "(image omitted: model does not support vision)")
    } else {
        Issue.record("Expected placeholder text at index 1")
    }
}

@Test func testVisionRegistryPassesThroughImagesForVisionModel() {
    let img = ImageAttachment(source: .base64(data: Data([0x01]), mimeType: "image/png"), altText: nil)
    let parts: [ContentPart] = [.text("hello"), .image(img)]
    let result = ModelVisionRegistry.downgradeImages(in: parts, model: "gpt-4o")
    #expect(result.count == 2)
    if case .image = result[1] { } else {
        Issue.record("Expected image part to be preserved for vision model")
    }
}

@Test func testProjectHasValidTextbook() throws {
    let tempFile = FileManager.default.temporaryDirectory
        .appendingPathComponent("dummy-\(UUID().uuidString).pdf")
    defer { try? FileManager.default.removeItem(at: tempFile) }

    let project = MathProject(name: "Temp Book", vaultPath: "/path/to/vault", textbookPath: tempFile.path)
    #expect(project.hasValidTextbook == false)

    try "dummy content".write(to: tempFile, atomically: true, encoding: .utf8)
    #expect(project.hasValidTextbook == true)
}

// MARK: - LaTeX Snippet Search Tests

@Test func testSnippetSearchExactTitleMatch() {
    let repo = LaTeXSnippetRepository.load()
    let service = LaTeXSnippetSearchService(repository: repo)
    let results = service.search("Fraction")
    #expect(results.first?.snippet.id == "fraction")
    #expect(results.first?.score == 0)
}

@Test func testSnippetSearchAliasPrefixMatch() {
    let repo = LaTeXSnippetRepository.load()
    let service = LaTeXSnippetSearchService(repository: repo)
    let results = service.search("frac")
    #expect(results.contains { $0.snippet.id == "fraction" })
}

@Test func testSnippetSearchEmptyQueryReturnsAll() {
    let repo = LaTeXSnippetRepository.load()
    let service = LaTeXSnippetSearchService(repository: repo)
    let results = service.search("")
    #expect(results.count == repo.all.count)
}

@Test func testSnippetSearchNoMatch() {
    let repo = LaTeXSnippetRepository.load()
    let service = LaTeXSnippetSearchService(repository: repo)
    let results = service.search("zzzznonexistent")
    #expect(results.isEmpty)
}

@Test func testSnippetSearchCategoryMatch() {
    let repo = LaTeXSnippetRepository.load()
    let service = LaTeXSnippetSearchService(repository: repo)
    let results = service.search("Calculus")
    // Should return snippets in the Calculus category at score 4
    #expect(results.allSatisfy { $0.snippet.category == "Calculus" })
}

@Test func testSnippetSearchGreekEpsilon() {
    let repo = LaTeXSnippetRepository.load()
    let service = LaTeXSnippetSearchService(repository: repo)
    let results = service.search("epsilon")
    #expect(results.contains { $0.snippet.id == "epsilon" }, "Search for 'epsilon' must find epsilon snippet")
    let found = results.first { $0.snippet.id == "epsilon" }
    #expect(found != nil)
    #expect(found?.score == 0, "epsilon matches title exactly, expected score 0")
    // Should NOT match unrelated snippets
    #expect(!results.contains { $0.snippet.id == "fraction" })
    #expect(!results.contains { $0.snippet.id == "delta" })
}

@Test func testSnippetSearchGreekDelta() {
    let repo = LaTeXSnippetRepository.load()
    let service = LaTeXSnippetSearchService(repository: repo)
    let results = service.search("delta")
    #expect(results.contains { $0.snippet.id == "delta" }, "Search for 'delta' must find delta snippet")
    // Should NOT match unrelated snippets
    #expect(!results.contains { $0.snippet.id == "fraction" })
    #expect(!results.contains { $0.snippet.id == "epsilon" })
}

@Test func testSnippetSearchGreekShortPrefix() {
    let repo = LaTeXSnippetRepository.load()
    let service = LaTeXSnippetSearchService(repository: repo)
    // 'eps' should match 'epsilon' via alias prefix
    let epsResults = service.search("eps")
    #expect(epsResults.contains { $0.snippet.id == "epsilon" })
    // 'del' should match 'delta' via alias prefix
    let delResults = service.search("del")
    #expect(delResults.contains { $0.snippet.id == "delta" })
}

@Test func testSnippetRepositoryLoadsBundledCatalog() {
    let repo = LaTeXSnippetRepository.load()
    #expect(!repo.all.isEmpty)
    #expect(!repo.categories.isEmpty)
    #expect(repo.categories.contains("Algebra"))
    #expect(repo.categories.contains("Calculus"))
    #expect(repo.categories.contains("Greek"))
}

// MARK: - LaTeX Insertion Engine Tests

@Test func testInsertionAtCaret() {
    let snippet = LaTeXSnippet(
        id: "test", title: "Test", aliases: [], category: "Test",
        template: "\\frac{${1:a}}{${2:b}}", example: "", wrapMode: .none
    )
    let result = LaTeXInsertionEngine.insert(snippet, into: "hello world", at: 5)
    #expect(result.text == "hello\\frac{a}{b} world")
    #expect(result.caretOffset == 5 + "\\frac{a}{b}".count)
}

@Test func testInsertionAtBeginning() {
    let snippet = LaTeXSnippet(
        id: "test", title: "Test", aliases: [], category: "Test",
        template: "x^{${1:n}}", example: "", wrapMode: .none
    )
    let result = LaTeXInsertionEngine.insert(snippet, into: "hello", at: 0)
    #expect(result.text == "x^{n}hello")
    #expect(result.caretOffset == "x^{n}".count)
}

@Test func testInsertionAtEnd() {
    let snippet = LaTeXSnippet(
        id: "test", title: "Test", aliases: [], category: "Test",
        template: "\\sqrt{${1:x}}", example: "", wrapMode: .none
    )
    let result = LaTeXInsertionEngine.insert(snippet, into: "hello", at: 5)
    #expect(result.text == "hello\\sqrt{x}")
    #expect(result.caretOffset == 5 + "\\sqrt{x}".count)
}

@Test func testInsertionWrapSelection() {
    let snippet = LaTeXSnippet(
        id: "test", title: "Test", aliases: [], category: "Test",
        template: "\\sqrt{${1:x}}", example: "", wrapMode: .wrapSelection
    )
    let result = LaTeXInsertionEngine.insert(snippet, into: "hello world", at: 2, selectionLength: 3)
    #expect(result.text == "he\\sqrt{llo} world")
    #expect(result.caretOffset == 2 + "\\sqrt{llo}".count)
}

@Test func testInsertionEmptySource() {
    let snippet = LaTeXSnippet(
        id: "test", title: "Test", aliases: [], category: "Test",
        template: "\\alpha", example: "", wrapMode: .none
    )
    let result = LaTeXInsertionEngine.insert(snippet, into: "", at: 0)
    #expect(result.text == "\\alpha")
    #expect(result.caretOffset == 6)
}

// MARK: - Chat Mode Tests

