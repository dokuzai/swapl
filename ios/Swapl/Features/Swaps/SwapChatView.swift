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
    @Environment(\.dismiss) private var dismiss
    // People roster expansion, owned here so scrolling the thread can collapse it.
    @State private var peopleExpanded = false

    let otherName: String?
    // Whether the current user is one of the two swap principals (proposer or
    // target-listing owner). Drives the People panel's invite/remove controls
    // (DOK-187) — guests see the roster but none of the management affordances.
    let isPrincipal: Bool

    // When opened from the inbox we carry the trip summary so the conversation
    // can pin a tappable trip header on top (→ the full Trip screen). Nil when
    // opened from inside the Trip screen itself (no need to link back to it).
    let tripSummary: ProposalSummary?

    init(proposalId: String, otherName: String?, isPrincipal: Bool, tripSummary: ProposalSummary? = nil) {
        _vm = State(initialValue: SwapChatViewModel(proposalId: proposalId))
        self.otherName = otherName
        self.isPrincipal = isPrincipal
        self.tripSummary = tripSummary
    }

    var body: some View {
        VStack(spacing: 0) {
            if let trip = tripSummary { pinnedListingBanner(trip) }
            thread
            composer
        }
        // Hide the bottom tab bar inside a conversation so the composer sits
        // flush at the bottom, like other messaging apps (WhatsApp etc.).
        .toolbar(.hidden, for: .tabBar)
        // No system nav bar — a floating glass header sits over the thread
        // (same treatment as the listing/trip detail). Swipe-back is preserved
        // via the gesture delegate restored in SwaplApp.
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        // Floating glass header reserves its own space (so messages aren't
        // hidden) but reads as pills on the cream — no opaque bar.
        .safeAreaInset(edge: .top) { chatFloatingHeader }
        // Cream background applied AFTER the header inset so it fills the whole
        // screen — including behind the floating header — with no stray band.
        .background(SwaplSemanticLight.background.ignoresSafeArea())
        .task { await vm.load() }
        .task(id: scenePhase) { await pollLoop() }
        .onChange(of: photoItems) { _, items in
            Task { await upload(items) }
        }
    }

    // Floating header over the thread: back on the left, the existing name +
    // dates glass pill centered, counterparty avatar on the right.
    private var chatFloatingHeader: some View {
        ZStack {
            chatTitle

            HStack(spacing: 0) {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .frame(width: 44, height: 44)
                        .glassEffect(.regular.interactive(), in: .circle)
                }
                .accessibilityLabel("Back")

                Spacer(minLength: 0)

                if let trip = tripSummary {
                    chatHeaderAvatar(trip)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func chatHeaderAvatar(_ trip: ProposalSummary) -> some View {
        if let uid = trip.otherUserId {
            NavigationLink {
                PublicProfileView(userId: uid)
            } label: {
                CounterpartyAvatar(name: trip.otherName, avatarUrl: trip.otherAvatar, size: 44)
            }
            .accessibilityLabel(Text("View \(trip.otherName ?? String(localized: "host"))'s profile"))
        } else {
            // Older deploys without otherUserId: fall back to the trip.
            NavigationLink(value: trip.id) {
                CounterpartyAvatar(name: trip.otherName, avatarUrl: trip.otherAvatar, size: 44)
            }
            .accessibilityLabel(Text("Open trip"))
        }
    }

    @ViewBuilder
    private var chatTitle: some View {
        let name = otherName ?? String(localized: "Messages")
        if let trip = tripSummary {
            NavigationLink(value: trip.id) {
                VStack(spacing: 1) {
                    Text(name)
                        .font(.swaplBody(16, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
                    Text(SwaplDateText.range(from: trip.dateFrom, to: trip.dateTo))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(1)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .glassEffect(.regular, in: .capsule)
            }
            .buttonStyle(.plain)
        } else {
            Text(name)
                .font(.swaplBody(16, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .glassEffect(.regular, in: .capsule)
        }
    }

    // Telegram-style pinned message: a fixed banner under the header showing the
    // home being swapped. Tap → the Trip (home & photos).
    private func pinnedListingBanner(_ trip: ProposalSummary) -> some View {
        NavigationLink(value: trip.id) {
            HStack(spacing: 12) {
                ProposalCoverImage(proposal: trip, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(String(localized: "View home & photos"))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
                    Text("\(trip.theirNeighbourhood), \(trip.theirCity)")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Image(systemName: "pin.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            // Liquid Glass pinned bar, matching the floating header / composer.
            .glassEffect(.regular, in: .rect(cornerRadius: SwaplDesignSystem.CornerRadius.large))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .padding(.bottom, 4)
        .accessibilityLabel(Text("Pinned: view home and photos"))
    }

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 10, pinnedViews: [.sectionHeaders]) {
                    Section {
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
                    } header: {
                        // People panel (DOK-187): pinned, collapsed by default —
                        // it sticks just under the pinned listing and the messages
                        // dissolve underneath it as the thread scrolls.
                        ConversationPeopleView(proposalId: vm.proposalId, isPrincipal: isPrincipal, isExpanded: $peopleExpanded)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            // As soon as the user starts scrolling the thread, collapse the
            // People roster so it doesn't sit over the messages.
            .onScrollPhaseChange { _, newPhase in
                if newPhase == .interacting, peopleExpanded {
                    withAnimation(.snappy) { peopleExpanded = false }
                }
            }
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

    private var photoPickerButton: some View {
        // Read the MainActor state into a local so it isn't referenced inside the
        // PhotosPicker label closure (which is nonisolated → concurrency warning).
        let uploading = vm.isUploading
        return PhotosPicker(selection: $photoItems, maxSelectionCount: 6, matching: .images) {
            Group {
                if uploading {
                    ProgressView()
                } else {
                    Image(systemName: "photo.on.rectangle")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                }
            }
            .frame(width: 44, height: 44)
            // Solid fill (not glass) since it sits inside the glass bar.
            .background(SwaplSemanticLight.card, in: Circle())
        }
        .accessibilityLabel("Add photo")
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
                photoPickerButton

                TextField("Message", text: $vm.draft, axis: .vertical)
                    .lineLimit(1...5)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                    .foregroundStyle(AirbnbPalette.text)
                    .focused($composerFocused)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 11)
                    .frame(minHeight: 44)
                    // Solid fill (not glass) since it sits inside the glass bar.
                    .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))

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
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        // Floating Liquid Glass bar, inset from the edges — no opaque material
        // band, no hairline divider (same treatment as the detail-screen CTAs).
        .glassEffect(.regular, in: .rect(cornerRadius: 28))
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
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
                vm.sendError = String(localized: "Couldn't upload a photo. Check your connection and try again.")
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
