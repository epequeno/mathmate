import SwiftUI
import UniformTypeIdentifiers

// MARK: - Image Thumbnail Component

struct ImageThumbnail: View {
    let imageAttachment: ImageAttachment
    let onRemove: () -> Void

    @State private var nsImage: NSImage?
    @State private var showFullSize: Bool = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            if let image = nsImage {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: 120, maxHeight: 120)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(AppTheme.border, lineWidth: 0.5)
                    )
                    .onTapGesture { showFullSize = true }
                    .help("Click to preview")
            } else {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.secondary.opacity(0.2))
                    .frame(width: 80, height: 80)
                    .overlay(
                        ProgressView()
                            .controlSize(.small)
                    )
            }

            Button(action: onRemove) {
                Image(systemName: "xmark.circle.fill")
                    .font(.caption)
                    .foregroundColor(.white)
                    .background(Circle().fill(Color.black.opacity(0.4)))
                    .shadow(radius: 1)
            }
            .offset(x: 6, y: -6)
            .help("Remove image")
        }
        .frame(width: 120, height: 120)
        .onAppear { loadImage() }
        .sheet(isPresented: $showFullSize) {
            FullSizeImageSheet(imageAttachment: imageAttachment)
        }
    }

    private func loadImage() {
        if let loaded = ImageDiskCache.shared.loadNSImage(for: imageAttachment) {
            nsImage = loaded
        } else if case .base64(let data, _) = imageAttachment.source {
            nsImage = NSImage(data: data)
        }
    }
}

// MARK: - Image in Message

struct ImageMessageView: View {
    let imageAttachment: ImageAttachment
    @State private var nsImage: NSImage?
    @State private var showFullSize: Bool = false

    var body: some View {
        Group {
            if let image = nsImage {
                let imageSize = image.size
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(
                        maxWidth: min(imageSize.width, 480),
                        maxHeight: min(imageSize.height, 480)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(AppTheme.border, lineWidth: 0.5)
                    )
                    .onTapGesture { showFullSize = true }
                    .help("Click to enlarge")
            } else {
                ProgressView()
                    .controlSize(.small)
                    .frame(maxWidth: 100, maxHeight: 80)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
        .onAppear { loadImage() }
        .sheet(isPresented: $showFullSize) {
            FullSizeImageSheet(imageAttachment: imageAttachment)
        }
    }

    private func loadImage() {
        if let loaded = ImageDiskCache.shared.loadNSImage(for: imageAttachment) {
            nsImage = loaded
        } else if case .base64(let data, _) = imageAttachment.source {
            nsImage = NSImage(data: data)
        }
    }
}

struct FullSizeImageSheet: View {
    let imageAttachment: ImageAttachment
    @Environment(\.dismiss) private var dismiss: DismissAction
    @State private var nsImage: NSImage?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Image Preview")
                    .font(.headline)
                Spacer()
                Button("Close") { dismiss() }
                    .buttonStyle(.borderless)
            }
            .padding()

            Divider()

            if let image = nsImage {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Text("Could not load image")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(width: 700, height: 600)
        .onAppear { loadImage() }
    }

    private func loadImage() {
        if let loaded = ImageDiskCache.shared.loadNSImage(for: imageAttachment) {
            nsImage = loaded
        } else if case .base64(let data, _) = imageAttachment.source {
            nsImage = NSImage(data: data)
        }
    }
}

// MARK: - Drop Delegate

struct ImageDropDelegate: DropDelegate {
    @Bindable var viewModel: ChatViewModel

    func performDrop(info: DropInfo) -> Bool {
        guard info.hasItemsConforming(to: [UTType.image]) else { return false }

        for provider in info.itemProviders(for: [UTType.image]) {
            _ = provider.loadObject(ofClass: URL.self) { item, _ in
                if let url = item {
                    Task { @MainActor in
                        viewModel.attachImage(from: url)
                    }
                }
            }
        }
        return true
    }

    func validateDrop(info: DropInfo) -> Bool {
        info.hasItemsConforming(to: [UTType.image])
    }
}

// MARK: - Chat View

struct ChatView: View {
    @Bindable var viewModel: ChatViewModel
    @State private var showSnippetPalette = false
    private let snippetRepository = LaTeXSnippetRepository.load()
    @FocusState private var inputFocused: Bool

    /// Captured cursor position when the LaTeX palette opens.
    @State private var paletteInsertCaret = 0
    @State private var paletteInsertSelection = 0

    // Slash command autocomplete
    @State private var showSlashPopup = false
    @State private var slashQuery = ""
    @State private var slashSelectedIndex = 0

    /// Optional project context.
    var activeProject: MathProject?

    /// Tracks whether the scroll view is at (or near) the bottom.
    @State private var isAtBottom = true

    private var lastMessageContentSignature: String {
        guard let last = viewModel.messages.last else { return "" }
        let textLen = last.parts.reduce(0) { sum, partItem in
            if case .text(let t) = partItem.part {
                return sum + t.count
            }
            return sum
        }
        return "\(last.id.uuidString)-\(textLen)-\(last.thinkingText.count)"
    }

    var body: some View {
        VStack(spacing: 0) {
            // Message list
            messageList
                .frame(maxHeight: .infinity)

            Divider()

            // Error banner
            if let error = viewModel.errorMessage {
                errorBanner(error)
            }

            // Input bar
            inputBar
                .layoutPriority(1)
        }
        // Slash command popup — floats above the input bar
        .overlay(alignment: .bottom) {
            if showSlashPopup {
                SlashCommandPopup(
                    query: slashQuery,
                    selectedIndex: $slashSelectedIndex,
                    onSelect: { commandName in
                        viewModel.input = commandName + " "
                        showSlashPopup = false
                        slashQuery = ""
                        slashSelectedIndex = 0
                        inputFocused = true
                    },
                    onDismiss: {
                        showSlashPopup = false
                        slashQuery = ""
                        slashSelectedIndex = 0
                    }
                )
                // Lift above the input bar (~80pt) with an 8pt gap
                .offset(y: -88)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 16)
            }
        }
        .onDrop(of: [.image, .png, .jpeg, .tiff], delegate: ImageDropDelegate(viewModel: viewModel))
        .onAppear {
            inputFocused = true
        }
        .onChange(of: viewModel.isLoading) {
            if !viewModel.isLoading {
                inputFocused = true
            }
        }
        // Esc cancels generation when streaming
        .onKeyPress(.escape) {
            if viewModel.isLoading {
                viewModel.cancelGeneration()
                return .handled
            }
            return .ignored
        }
        // Quick wrap-up confirmation alert
        .alert("Wrap Up Session", isPresented: $viewModel.showWrapUpConfirmation) {
            Button("Wrap Up") {
                Task { await viewModel.autoWrapUp() }
            }
            .keyboardShortcut(.return)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Generate a structured summary of this session and save it to your Synapse vault?")
        }
        // Wrap-up result notification
        .alert(
            viewModel.wrapUpResultIsSuccess ? "Wrap-Up Saved" : "Wrap-Up Failed",
            isPresented: Binding(
                get: { viewModel.wrapUpResult != nil },
                set: { if !$0 { viewModel.wrapUpResult = nil } }
            )
        ) {
            Button("OK") { viewModel.wrapUpResult = nil }
            if viewModel.wrapUpResultIsSuccess {
                Button("Open in Synapse") {
                    if let path = viewModel.wrapUpResult?.replacing("Saved to ", with: ""),
                       let url = URL(string: "synapse://open?file=\(path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? path)") {
                        NSWorkspace.shared.open(url)
                    }
                }
            }
        } message: {
            Text(viewModel.wrapUpResult ?? "")
        }
        // Progress HUD while auto-wrapping
        .overlay {
            if viewModel.isAutoWrappingUp {
                ZStack {
                    Color.black.opacity(0.3).ignoresSafeArea()
                    VStack(spacing: 12) {
                        ProgressView()
                            .controlSize(.large)
                        Text("Generating wrap-up…")
                            .font(.body)
                            .foregroundColor(.white)
                    }
                    .padding(32)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                }
            }
        }
        // Legacy sheet — accessible via toolbar if needed
        .sheet(isPresented: $viewModel.isShowingWrapUpSheet) {
            WrapUpSheetView(viewModel: viewModel)
        }
    }

    // MARK: - Message List

    private var messageList: some View {
        GeometryReader { geometry in
            ScrollViewReader { proxy in
                ZStack(alignment: .bottomTrailing) {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(viewModel.messages) { message in
                                MessageRow(message: message, onToggleFlag: { unitId in viewModel.toggleFlag(for: message.id, unitId: unitId) })
                                    .equatable()
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .id(message.id)
                            }
                            // Sentinel — visible only when scroll is at the bottom.
                            Color.clear
                                .frame(height: 1)
                                .id("bottom-anchor")
                                .onAppear  { isAtBottom = true }
                                .onDisappear { isAtBottom = false }
                        }
                        .padding()
                        .frame(minHeight: geometry.size.height - 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .onChange(of: lastMessageContentSignature) {
                        if isAtBottom || viewModel.isLoading {
                            proxy.scrollTo("bottom-anchor", anchor: .bottom)
                        }
                    }
                    .onDrop(of: [.image, .png, .jpeg, .tiff], delegate: ImageDropDelegate(viewModel: viewModel))

                    // Scroll-to-bottom button — shown only when scrolled up.
                    if !isAtBottom {
                        Button {
                            withAnimation(.easeInOut(duration: 0.25)) {
                                proxy.scrollTo("bottom-anchor", anchor: .bottom)
                            }
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(AppTheme.accent)
                                    .frame(width: 34, height: 34)
                                    .shadow(color: Color.black.opacity(0.18), radius: 6, x: 0, y: 3)
                                Image(systemName: "arrow.down")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(.white)
                            }
                        }
                        .buttonStyle(.plain)
                        .padding(.bottom, 14)
                        .padding(.trailing, 14)
                        .transition(.opacity.combined(with: .scale(scale: 0.85, anchor: .bottomTrailing)))
                    }
                }
                .animation(.easeInOut(duration: 0.18), value: isAtBottom)
            }
        }
    } // <-- fix: closes messageList (was missing, causing ChatView to never close)

    // MARK: - Error Banner

    private func errorBanner(_ error: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.orange)
            Text(error)
                .font(.caption)
                .foregroundColor(.secondary)

            Spacer()

            Button {
                Task {
                    await viewModel.retryLastTurn()
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 10, weight: .bold))
                    Text("Retry")
                        .font(.system(size: 11, weight: .semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(AppTheme.accentFill)
                .cornerRadius(4)
            }
            .buttonStyle(.plain)
            .help("Retry the last user turn")

            Button {
                viewModel.errorMessage = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(AppTheme.textSecondary)
            }
            .buttonStyle(.plain)
            .help("Dismiss error")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color.red.opacity(0.05))
    }

    // MARK: - Input Bar

    private var inputBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Regenerate button (above input textfield but inside inputBar)
            if !viewModel.messages.isEmpty && !viewModel.isLoading && viewModel.errorMessage == nil {
                HStack {
                    Spacer()
                    Button {
                        Task {
                            await viewModel.regenerateLastResponse()
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.clockwise")
                                .font(.system(size: 10))
                            Text("Regenerate response")
                                .font(.system(size: 11, weight: .medium))
                        }
                        .foregroundColor(AppTheme.textSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(AppTheme.backgroundElevated)
                        .cornerRadius(12)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(AppTheme.border, lineWidth: 0.5)
                        )
                    }
                    .buttonStyle(.plain)
                    .help("Regenerate the last AI response (⌘⌥R)")
                    .keyboardShortcut("r", modifiers: [.command, .option])
                    Spacer()
                }
                .padding(.bottom, 2)
            }

            // Pending image strip
            if !viewModel.pendingImages.isEmpty {
                pendingImageStrip

                // Warn if current model doesn't support vision
                if let model = viewModel.currentModel, !ModelVisionRegistry.supportsVision(model: model) {
                    HStack(spacing: 6) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.orange)
                        Text("Current model does not support vision — images will not be sent")
                            .font(.system(size: 10))
                            .foregroundColor(.orange)
                    }
                    .padding(.vertical, 2)
                }
            }

            // Input row
            HStack(alignment: .bottom, spacing: 8) {
                // Paperclip attach button
                Button {
                    attachImageFromPicker()
                } label: {
                    Image(systemName: "paperclip")
                        .font(.title3)
                }
                .buttonStyle(.borderless)
                .help("Attach image")

                // LaTeX palette trigger button
                Button {
                    if let window = NSApplication.shared.keyWindow,
                       let textView = window.firstResponder as? NSTextView {
                        paletteInsertCaret = textView.selectedRange().location
                        paletteInsertSelection = textView.selectedRange().length
                    }
                    showSnippetPalette = true
                } label: {
                    Text("ƒx")
                        .font(.system(size: 14, weight: .semibold, design: .serif))
                }
                .buttonStyle(.borderless)
                .help("Insert LaTeX symbol (⌘\\)")
                .keyboardShortcut("\\", modifiers: .command)
                .popover(isPresented: $showSnippetPalette) {
                    LaTeXPaletteView(repository: snippetRepository) { snippet in
                        let result = LaTeXInsertionEngine.insert(
                            snippet,
                            into: viewModel.input,
                            at: paletteInsertCaret,
                            selectionLength: paletteInsertSelection
                        )
                        viewModel.input = result.text
                    }
                }

                MathComposerView(
                    source: $viewModel.input,
                    disabled: viewModel.isLoading,
                    placeholder: "Ask a math question... (/help for commands)",
                    onSend: {
                        if !viewModel.input.isEmpty || !viewModel.pendingImages.isEmpty {
                            Task { @MainActor in
                                await viewModel.sendMessage()
                            }
                        }
                    },
                    slashKeyHandler: showSlashPopup ? { key in
                        let filtered = SlashCommandRegistry.filter(slashQuery)
                        switch key {
                        case .downArrow:
                            slashSelectedIndex = min(slashSelectedIndex + 1, filtered.count - 1)
                            return true
                        case .upArrow:
                            slashSelectedIndex = max(slashSelectedIndex - 1, 0)
                            return true
                        case .escape:
                            showSlashPopup = false
                            slashQuery = ""
                            return true
                        case .returnKey:
                            if slashSelectedIndex < filtered.count {
                                let cmd = filtered[slashSelectedIndex]
                                viewModel.input = cmd.displayName(for: slashQuery) + " "
                                showSlashPopup = false
                                slashQuery = ""
                                slashSelectedIndex = 0
                                inputFocused = true
                            }
                            return true
                        }
                    } : nil,
                    isFocused: $inputFocused
                )

                Button {
                    if viewModel.isLoading {
                        viewModel.cancelGeneration()
                    } else {
                        Task { await viewModel.sendMessage() }
                    }
                } label: {
                    Image(systemName: viewModel.isLoading ? "stop.circle" : "arrow.up.circle.fill")
                        .font(.title2)
                        .foregroundColor(viewModel.isLoading ? .secondary : .accentColor)
                }
                .buttonStyle(.borderless)
                .disabled(viewModel.input.isEmpty && viewModel.pendingImages.isEmpty && !viewModel.isLoading)
                .help(viewModel.isLoading ? "Stop generation (Esc)" : "Send message (↩)")
            }
        }
        .padding(12)
        .background(AppTheme.background)
        // Detect slash command typing
        .onChange(of: viewModel.input) { _, newValue in
            let trimmed = newValue.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("/") {
                let query = String(trimmed.dropFirst())
                let isValidPartial = query.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }
                if isValidPartial {
                    if slashQuery != query { slashSelectedIndex = 0 }
                    slashQuery = query
                    showSlashPopup = true
                } else {
                    showSlashPopup = false
                    slashQuery = ""
                }
            } else {
                showSlashPopup = false
                slashQuery = ""
            }
        }
    }

    // MARK: - Pending Image Strip

    private var pendingImageStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(viewModel.pendingImages) { item in
                    ImageThumbnail(
                        imageAttachment: item,
                        onRemove: {
                            viewModel.removePendingImage(item)
                        }
                    )
                }
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: - Image Picker

    private func attachImageFromPicker() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.png, .jpeg, .gif, .tiff, .heic, .webP]
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.message = "Select image(s) to attach"

        if panel.runModal() == .OK {
            for url in panel.urls {
                viewModel.attachImage(from: url)
            }
        }
    }
}

// MARK: - Message Row

struct MessageRow: View {
    let message: Message
    var onToggleFlag: (UUID?) -> Void = { _ in }
    @State private var partHeights: [UUID: CGFloat] = [:]
    @State private var thinkingExpanded = false
    @State private var toolEventsExpanded = false
    @ObservedObject private var snapshotStore = SnapshotStore.shared
    @State private var isHovering = false
    @State private var hoveringUnitID: UUID? = nil

    /// Derives a binding for a specific part's height, defaulting to 40.
    private func heightBinding(for partId: UUID) -> Binding<CGFloat> {
        Binding(
            get: { partHeights[partId, default: 40] },
            set: { partHeights[partId] = $0 }
        )
    }

    /// Measures the rendered width of text using the same font metrics as the LaTeXView WebView.
    private func measureTextWidth(_ text: String, fontSize: Int) -> CGFloat {
        let font = NSFont.systemFont(ofSize: CGFloat(fontSize))
        let attrs: [NSAttributedString.Key: Any] = [.font: font]
        let attrString = NSAttributedString(string: text, attributes: attrs)
        let rect = attrString.boundingRect(
            with: CGSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            context: nil
        )
        return min(rect.width, 700)
    }

    var body: some View {
        Group {
            if message.isUser {
                userContent
                    .frame(maxWidth: .infinity, alignment: .trailing)
            } else {
                assistantContent
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - User content (right-aligned)

    @ViewBuilder
    private var userContent: some View {
        VStack(alignment: .trailing, spacing: 6) {
            // Show image thumbnails above text
            if !message.images.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(message.images) { img in
                            ImageThumbnail(
                                imageAttachment: img,
                                onRemove: {}
                            )
                        }
                    }
                }
            }
            if !message.content.isEmpty {
                let userContentId = message.id
                let measuredWidth = measureTextWidth(message.content, fontSize: 14)
                let bubbleWidth = min(measuredWidth + 24, 820)
                LaTeXView(
                    content: message.content,
                    fontSize: 14,
                    contentHeight: heightBinding(for: userContentId)
                )
                .frame(width: bubbleWidth, height: partHeights[userContentId, default: 40])
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(AppTheme.userBubble)
                .cornerRadius(14)
                .overlay(alignment: .topLeading) {
                    flagButton(isFlagged: message.isFlagged, isHovering: isHovering) {
                        onToggleFlag(nil)
                    }
                    .offset(x: -22, y: -2)
                }
            }
        }
        .frame(maxWidth: 820, alignment: .trailing)
        .onHover { hovering in
            isHovering = hovering
        }
    }

    // MARK: - Assistant content (left-aligned)

    @ViewBuilder
    private var assistantContent: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Render units (new ResponseUnit-based rendering)
            ForEach(message.units) { unit in
                VStack(alignment: .leading, spacing: 6) {
                    // Render unit parts
                    ForEach(unit.parts.indices, id: \.self) { partIdx in
                        let part = unit.parts[partIdx]
                        switch part {
                        case .text(let text):
                            if !text.isEmpty {
                                textUnitContent(
                                    text: text,
                                    unitId: unit.id,
                                    isStreaming: message.isStreaming
                                )
                            }
                        case .image(let img):
                            ImageMessageView(imageAttachment: img)
                        }
                    }
                    // Render unit tool events
                    if !unit.toolEvents.isEmpty {
                        ForEach(unit.toolEvents, id: \.id) { event in
                            toolTimelineRow(event)
                        }
                    }
                }
                .overlay(alignment: .topTrailing) {
                    flagButton(isFlagged: unit.isFlagged, isHovering: hoveringUnitID == unit.id) {
                        onToggleFlag(unit.id)
                    }
                    .offset(x: 22, y: -2)
                }
                .onHover { hovering in
                    hoveringUnitID = hovering ? unit.id : nil
                }
            }
            // Backward compat: render flat parts for old messages without units
            if message.units.isEmpty {
                ForEach(message.parts) { partItem in
                    switch partItem.part {
                    case .text(let text):
                        if !text.isEmpty {
                            textUnitContent(
                                text: text,
                                unitId: partItem.id,
                                isStreaming: message.isStreaming
                            )
                        }
                    case .image(let img):
                        ImageMessageView(imageAttachment: img)
                    }
                }
                .overlay(alignment: .topTrailing) {
                    flagButton(isFlagged: message.isFlagged, isHovering: isHovering) {
                        onToggleFlag(nil)
                    }
                    .offset(x: 22, y: -2)
                }
            }

            if message.isStreaming {
                HStack(spacing: 4) {
                    ProgressView().controlSize(.small)
                    Text(message.thinkingText.isEmpty ? "Thinking..." : "Generating...")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .onHover { hovering in
            isHovering = hovering
        }
    }

    /// A small flag icon that appears on hover (or always when flagged).
    private func flagButton(isFlagged: Bool, isHovering: Bool, onToggle: @escaping () -> Void) -> some View {
        let visible = isHovering || isFlagged
        return Group {
            if visible {
                Button {
                    onToggle()
                } label: {
                    Image(systemName: isFlagged ? "flag.fill" : "flag")
                        .font(.system(size: 12))
                        .foregroundColor(isFlagged ? .orange : .secondary)
                        .frame(width: 18, height: 18)
                }
                .buttonStyle(.plain)
                .help(isFlagged ? "Remove importance flag" : "Mark as important")
                .transition(.opacity.combined(with: .scale(scale: 0.85)))
            }
        }
        .animation(.easeInOut(duration: 0.15), value: visible)
    }

    /// Raw thinking/reasoning trace — displayed as plain text (not LaTeX-rendered).
    private var thinkingSection: some View {
        DisclosureGroup(isExpanded: .init(
            get: { thinkingExpanded || message.isStreaming },
            set: { thinkingExpanded = $0 }
        )) {
            ScrollView {
                Text(message.thinkingText)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
            }
            .frame(maxHeight: 200)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "brain")
                Text("Thinking")
                    .font(.caption)
                    .fontWeight(.semibold)
            }
            .foregroundColor(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color.secondary.opacity(0.08))
        .cornerRadius(10)
    }

    private var toolsSection: some View {
        DisclosureGroup(isExpanded: $toolEventsExpanded) {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(message.allToolEvents, id: \.id) { event in
                    toolTimelineRow(event)
                }
            }
            .padding(.top, 2)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "wrench.and.screwdriver")
                Text("Tools")
                    .font(.caption)
                    .fontWeight(.semibold)
                Spacer()
                if !message.toolEvents.isEmpty {
                    let completed = message.toolEvents.filter { $0.status == .success || $0.status == .failure }
                    let totalDuration = completed.compactMap { $0.duration }.reduce(0, +)
                    Text("\(completed.count) call\(completed.count == 1 ? "" : "s") · \(formatDuration(totalDuration))")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            .foregroundColor(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(AppTheme.accent.opacity(0.08))
        .cornerRadius(10)
    }

    // MARK: - Tool timeline row

    @State private var expandedToolEventID: UUID? = nil

    private func toolTimelineRow(_ event: ToolEvent) -> some View {
        let isExpanded = expandedToolEventID == event.id
        return VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.15)) {
                    expandedToolEventID = isExpanded ? nil : event.id
                }
            } label: {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: icon(for: event.status))
                        .foregroundColor(color(for: event.status))
                        .font(.system(size: 12))
                        .frame(width: 16)

                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 6) {
                            Text(event.toolName)
                                .font(.caption)
                                .fontWeight(.semibold)
                            if !event.durationText.isEmpty {
                                Text(event.durationText)
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(Color.secondary.opacity(0.12))
                                    .cornerRadius(3)
                            }
                        }
                        Text(event.summary)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                            .lineLimit(isExpanded ? nil : 2)
                            .textSelection(.enabled)
                    }

                    Spacer()

                    if event.input != nil || event.output != nil {
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(.secondary.opacity(0.6))
                    }
                }
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: 6) {
                    if let input = event.input, !input.isEmpty {
                        detailBlock(title: "Input", content: input)
                    }
                    if let output = event.output, !output.isEmpty {
                        detailBlock(title: "Output", content: output)
                    }
                }
                .padding(.leading, 24)
                .padding(.top, 4)
                .padding(.bottom, 2)
            }
        }
    }

    private func detailBlock(title: String, content: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundColor(.secondary)
            Text(content)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(.secondary)
                .textSelection(.enabled)
                .padding(6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.secondary.opacity(0.08))
                .cornerRadius(4)
        }
    }

    private func formatDuration(_ seconds: TimeInterval) -> String {
        if seconds < 1.0 { return String(format: "%.0fms", seconds * 1000) }
        return String(format: "%.1fs", seconds)
    }

    private func icon(for status: ToolEvent.Status) -> String {
        switch status {
        case .pending: return "clock"
        case .running: return "gearshape.2"
        case .success: return "checkmark.circle.fill"
        case .failure: return "xmark.octagon.fill"
        }
    }

    private func color(for status: ToolEvent.Status) -> Color {
        switch status {
        case .pending: return .secondary
        case .running: return .accentColor
        case .success: return .green
        case .failure: return .red
        }
    }

    /// Renders text content: shows a static SnapshotView if available and not streaming,
    /// otherwise falls back to the live LaTeXView (which holds a WKWebView during streaming).
    private func textUnitContent(text: String, unitId: UUID, isStreaming: Bool) -> some View {
        let snapshotAvailable = snapshotStore.snapshot(for: unitId) != nil
        let showSnapshot = !isStreaming && snapshotAvailable

        if showSnapshot, let (image, height) = snapshotStore.snapshot(for: unitId) {
            return AnyView(
                SnapshotView(image: image, height: height)
                    .frame(height: height)
            )
        } else {
            return AnyView(
                LaTeXView(
                    content: text,
                    fontSize: 14,
                    contentHeight: heightBinding(for: unitId)
                )
                .frame(height: partHeights[unitId, default: 40])
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color(nsColor: .windowBackgroundColor).opacity(0.0))
                .cornerRadius(14)
            )
        }
    }
}

// MARK: - MessageRow Equatable (skip re-evaluation of unchanged rows)

extension MessageRow: Equatable {
    nonisolated static func == (lhs: MessageRow, rhs: MessageRow) -> Bool {
        lhs.message == rhs.message
    }
}
