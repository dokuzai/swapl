import SwiftUI
import PhotosUI
import Observation
import SwaplDesignTokens

// First-class swap chat (DOK-154). Mobile-first thread: bubbles, a composer
// that's always ready (TextField + one-tap send), photo attach in two taps
// (PhotosPicker → existing listing-photo upload), read receipts, auto-scroll to
// the newest message, and a lightweight foreground poll. The thread is bound to
// the proposal and keeps flowing after it becomes an agreement.
@MainActor
@Observable
final class SwapChatViewModel {
    let proposalId: String
    var messages: [SwapMessage] = []
    var draft = ""
    var pendingPhotoURLs: [String] = []
    var isLoading = false
    var isSending = false
    var isUploading = false
    var loadError: String?
    var sendError: String?
    var hasLoadedOnce = false
    var nextCursor: String?
    var hasMore = false
    var isLoadingMore = false

    // Bumps whenever the message list grows so the view can drive auto-scroll.
    var scrollAnchor: String?

    init(proposalId: String) {
        self.proposalId = proposalId
    }

    var canSend: Bool {
        !isSending && !isUploading &&
        (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !pendingPhotoURLs.isEmpty)
    }

    // Initial / pull-to-refresh load. Marks inbound messages read.
    func load() async {
        isLoading = true
        loadError = nil
        defer { isLoading = false }
        do {
            let page = try await ChatRepository.shared.messages(proposalId: proposalId)
            messages = page.messages
            nextCursor = page.nextCursor
            hasMore = page.hasMore
            hasLoadedOnce = true
            scrollAnchor = messages.last?.id
        } catch {
            loadError = error.localizedDescription
            hasLoadedOnce = true
        }
    }

    // Older history: page backwards from the oldest message we hold.
    func loadMore() async {
        guard hasMore, !isLoadingMore, let cursor = nextCursor else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            // Peek (markRead:false) — paging history shouldn't change receipts.
            let page = try await ChatRepository.shared.messages(proposalId: proposalId, before: cursor, markRead: false)
            let known = Set(messages.map(\.id))
            let older = page.messages.filter { !known.contains($0.id) }
            messages.insert(contentsOf: older, at: 0)
            nextCursor = page.nextCursor
            hasMore = page.hasMore
        } catch {
            // Silent: paging failure leaves what we have; the user can retry.
        }
    }

    // Lightweight foreground poll: merge in anything new without disturbing the
    // composer. Marks inbound read so the badge stays current while viewing.
    func poll() async {
        guard hasLoadedOnce, !isSending else { return }
        do {
            let page = try await ChatRepository.shared.messages(proposalId: proposalId)
            merge(page.messages)
        } catch {
            // Transient poll failures are ignored; the next tick retries.
        }
    }

    func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let photos = pendingPhotoURLs
        guard !text.isEmpty || !photos.isEmpty else { return }
        isSending = true
        sendError = nil
        defer { isSending = false }
        do {
            let message = try await ChatRepository.shared.send(proposalId: proposalId, body: text, photos: photos)
            // Clear the composer immediately on success — immediacy first.
            draft = ""
            pendingPhotoURLs = []
            merge([message])
        } catch {
            sendError = error.localizedDescription
        }
    }

    func addUploadedPhoto(_ url: String) {
        if !pendingPhotoURLs.contains(url) { pendingPhotoURLs.append(url) }
    }

    func removePendingPhoto(_ url: String) {
        pendingPhotoURLs.removeAll { $0 == url }
    }

    // Merge by id, preserving createdAt order, and refresh the scroll anchor
    // only when the tail actually changed (avoids fighting the user's scroll).
    private func merge(_ incoming: [SwapMessage]) {
        guard !incoming.isEmpty else { return }
        var byId = Dictionary(messages.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new })
        for m in incoming { byId[m.id] = m }
        let merged = byId.values.sorted { $0.createdAt < $1.createdAt }
        let changedTail = merged.last?.id != messages.last?.id
        messages = merged
        if changedTail { scrollAnchor = merged.last?.id }
    }
}

struct SwapChatView: View {
    @State private var vm: SwapChatViewModel
    @State private var photoItems: [PhotosPickerItem] = []
    @FocusState private var composerFocused: Bool
    @Environment(\.scenePhase) private var scenePhase

    let otherName: String?

    init(proposalId: String, otherName: String?) {
        _vm = State(initialValue: SwapChatViewModel(proposalId: proposalId))
        self.otherName = otherName
    }

    var body: some View {
        VStack(spacing: 0) {
            thread
            composer
        }
        .background(SwaplSemanticLight.background.ignoresSafeArea())
        // Hide the bottom tab bar inside a conversation so the composer sits
        // flush at the bottom, like other messaging apps (WhatsApp etc.).
        .toolbar(.hidden, for: .tabBar)
        .navigationTitle(otherName ?? "Messages")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .task(id: scenePhase) { await pollLoop() }
        .onChange(of: photoItems) { _, items in
            Task { await upload(items) }
        }
    }

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 10) {
                    if vm.isLoading && !vm.hasLoadedOnce {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.top, 40)
                            .accessibilityLabel("Loading messages")
                    } else if let error = vm.loadError, vm.messages.isEmpty {
                        SwaplEmptyState(
                            systemImage: "wifi.exclamationmark",
                            title: "Messages unavailable",
                            description: error,
                            actionTitle: "Try Again",
                            action: { Task { await vm.load() } }
                        )
                        .padding(.top, 60)
                    } else if vm.messages.isEmpty {
                        SwaplEmptyState(
                            systemImage: "bubble.left.and.bubble.right",
                            title: "Say hello",
                            description: "Start the conversation — ask about dates, the neighbourhood, or anything you'd like to know."
                        )
                        .padding(.top, 60)
                    } else {
                        if vm.hasMore {
                            Button { Task { await vm.loadMore() } } label: {
                                if vm.isLoadingMore {
                                    ProgressView()
                                } else {
                                    Text("Load earlier messages")
                                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                                        .foregroundStyle(AirbnbPalette.secondaryText)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                        }
                        ForEach(vm.messages) { message in
                            MessageBubble(message: message, isLast: message.id == vm.messages.last?.id)
                                .id(message.id)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await vm.load() }
            .onChange(of: vm.scrollAnchor) { _, anchor in
                guard let anchor else { return }
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(anchor, anchor: .bottom)
                }
            }
            .onChange(of: composerFocused) { _, focused in
                guard focused, let last = vm.messages.last?.id else { return }
                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(last, anchor: .bottom)
                }
            }
        }
    }

    private var composer: some View {
        VStack(spacing: 8) {
            if let sendError = vm.sendError {
                Text(sendError)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.destructive)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if !vm.pendingPhotoURLs.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(vm.pendingPhotoURLs, id: \.self) { url in
                            AsyncImage(url: URL(string: url)) { img in
                                img.resizable().scaledToFill()
                            } placeholder: {
                                SwaplSemanticLight.muted
                            }
                            .frame(width: 64, height: 64)
                            .clipShape(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.small, style: .continuous))
                            .overlay(alignment: .topTrailing) {
                                Button { vm.removePendingPhoto(url) } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 17, weight: .semibold))
                                        .symbolRenderingMode(.palette)
                                        .foregroundStyle(SwaplSemanticLight.primaryForeground, Color.black.opacity(0.55))
                                        .padding(3)
                                }
                                .accessibilityLabel("Remove photo")
                            }
                        }
                    }
                }
            }

            HStack(alignment: .bottom, spacing: 10) {
                PhotosPicker(selection: $photoItems, maxSelectionCount: 6, matching: .images) {
                    Group {
                        if vm.isUploading {
                            ProgressView()
                        } else {
                            Image(systemName: "photo.on.rectangle")
                                .font(.system(size: 20, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                        }
                    }
                    .frame(width: 44, height: 44)
                    .background(SwaplSemanticLight.card, in: Circle())
                    .overlay(Circle().stroke(AirbnbPalette.hairline))
                }
                .accessibilityLabel("Add photo")

                TextField("Message", text: $vm.draft, axis: .vertical)
                    .lineLimit(1...5)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                    .foregroundStyle(AirbnbPalette.text)
                    .focused($composerFocused)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                    .frame(minHeight: 44)
                    .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(AirbnbPalette.hairline))

                Button {
                    Task { await vm.send() }
                } label: {
                    Group {
                        if vm.isSending {
                            ProgressView().tint(SwaplSemanticLight.primaryForeground)
                        } else {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        }
                    }
                    .frame(width: 44, height: 44)
                    .background(vm.canSend ? SwaplSemanticLight.primary : SwaplSemanticLight.primary.opacity(0.4), in: Circle())
                }
                .disabled(!vm.canSend)
                .accessibilityLabel("Send message")
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(.ultraThinMaterial)
        .overlay(alignment: .top) { Divider() }
    }

    // Foreground poll loop: re-runs whenever scenePhase changes. Only polls
    // while active, then suspends — no WebSocket, just a light periodic GET.
    private func pollLoop() async {
        guard scenePhase == .active else { return }
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(5))
            guard scenePhase == .active else { break }
            await vm.poll()
        }
    }

    private func upload(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        vm.isUploading = true
        defer { vm.isUploading = false }
        for item in items {
            guard
                let data = try? await item.loadTransferable(type: Data.self),
                let jpeg = SwaplImage.downscaledJPEG(from: data)
            else { continue }
            do {
                let url = try await APIClient.shared.uploadListingPhoto(jpeg)
                vm.addUploadedPhoto(url)
            } catch {
                vm.sendError = "Couldn't upload a photo. Check your connection and try again."
            }
        }
        photoItems = []
    }
}

struct MessageBubble: View {
    let message: SwapMessage
    let isLast: Bool

    var body: some View {
        HStack {
            if message.mine { Spacer(minLength: 48) }
            VStack(alignment: message.mine ? .trailing : .leading, spacing: 6) {
                if !message.photos.isEmpty {
                    VStack(spacing: 6) {
                        ForEach(message.photos, id: \.self) { url in
                            AsyncImage(url: URL(string: url)) { img in
                                img.resizable().scaledToFill()
                            } placeholder: {
                                SwaplSemanticLight.muted
                            }
                            .frame(maxWidth: 220, maxHeight: 220)
                            .clipShape(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                        }
                    }
                }

                if !message.body.isEmpty {
                    Text(message.body)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                        .foregroundStyle(message.mine ? SwaplSemanticLight.primaryForeground : AirbnbPalette.text)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            message.mine ? SwaplSemanticLight.primary : SwaplSemanticLight.card,
                            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .stroke(message.mine ? Color.clear : AirbnbPalette.hairline)
                        )
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 4) {
                    Text(timeLabel)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                    // Read receipt: a double-check that fills in once the other
                    // party has read my message.
                    if message.mine {
                        Image(systemName: message.readAt != nil ? "checkmark.circle.fill" : "checkmark.circle")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(message.readAt != nil ? SwaplSemanticLight.primary : AirbnbPalette.secondaryText)
                            .accessibilityLabel(message.readAt != nil ? "Read" : "Sent")
                    }
                }
            }
            if !message.mine { Spacer(minLength: 48) }
        }
    }

    private var timeLabel: String {
        guard let date = SwaplDateText.parse(message.createdAt) else { return "" }
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate("jm")
        return formatter.string(from: date)
    }
}
