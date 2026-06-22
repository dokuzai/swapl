import SwiftUI
import PhotosUI
import Observation
import SwaplDesignTokens

// Unified per-transaction chat (DOK-221). Keyed by conversationId so it serves
// both swap- and stay-backed threads. The timeline mixes member bubbles with
// centered system-event rows ("Request sent", "Confirmed", "Checked in", …), so
// the chat reads as the activity log the user asked for. Same composer, photo
// attach, auto-scroll, and foreground poll as the swap chat.
@MainActor
@Observable
final class ConversationViewModel {
    let conversationId: String
    var messages: [UnifiedMessage] = []
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

    // Bumps whenever the tail grows so the view can drive auto-scroll.
    var scrollAnchor: String?

    init(conversationId: String) {
        self.conversationId = conversationId
    }

    var canSend: Bool {
        !isSending && !isUploading &&
        (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !pendingPhotoURLs.isEmpty)
    }

    func load() async {
        isLoading = true
        loadError = nil
        defer { isLoading = false }
        do {
            let page = try await ConversationRepository.shared.timeline(conversationId: conversationId)
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

    func loadMore() async {
        guard hasMore, !isLoadingMore, let cursor = nextCursor else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let page = try await ConversationRepository.shared.timeline(conversationId: conversationId, before: cursor, markRead: false)
            let known = Set(messages.map(\.id))
            let older = page.messages.filter { !known.contains($0.id) }
            messages.insert(contentsOf: older, at: 0)
            nextCursor = page.nextCursor
            hasMore = page.hasMore
        } catch {
            // Silent: paging failure leaves what we have; the user can retry.
        }
    }

    func poll() async {
        guard hasLoadedOnce, !isSending else { return }
        do {
            let page = try await ConversationRepository.shared.timeline(conversationId: conversationId)
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
            let message = try await ConversationRepository.shared.send(conversationId: conversationId, body: text, photos: photos)
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

    private func merge(_ incoming: [UnifiedMessage]) {
        guard !incoming.isEmpty else { return }
        var byId = Dictionary(messages.map { ($0.id, $0) }, uniquingKeysWith: { _, new in new })
        for m in incoming { byId[m.id] = m }
        let merged = byId.values.sorted { $0.createdAt < $1.createdAt }
        let changedTail = merged.last?.id != messages.last?.id
        messages = merged
        if changedTail { scrollAnchor = merged.last?.id }
    }
}

struct ConversationView: View {
    @State private var vm: ConversationViewModel
    @State private var photoItems: [PhotosPickerItem] = []
    @FocusState private var composerFocused: Bool
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    // People roster expansion (swap threads only), owned here so scrolling the
    // thread can collapse it — matches the swap chat.
    @State private var peopleExpanded = false

    let title: String?
    // Swap threads carry their proposalId so the multi-party People panel
    // (DOK-187) can show; nil for stays (always exactly guest + host).
    let proposalId: String?
    let isPrincipal: Bool

    init(conversationId: String, title: String? = nil, proposalId: String? = nil, isPrincipal: Bool = false) {
        _vm = State(initialValue: ConversationViewModel(conversationId: conversationId))
        self.title = title
        self.proposalId = proposalId
        self.isPrincipal = isPrincipal
    }

    var body: some View {
        VStack(spacing: 0) {
            if let proposalId { swapDetailBanner(proposalId) }
            thread
            composer
        }
        .toolbar(.hidden, for: .tabBar)
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        .safeAreaInset(edge: .top) { floatingHeader }
        .background(SwaplSemanticLight.background.ignoresSafeArea())
        .task { await vm.load() }
        .task(id: scenePhase) { await pollLoop() }
        .onChange(of: photoItems) { _, items in
            Task { await upload(items) }
        }
    }

    // Pinned banner (swap threads) → the swap detail, where Accept / Decline /
    // Counter and the trip cockpit live (DOK-221). The unified Messages list is a
    // pure chat list, so this is how a pending swap is acted on from the thread.
    private func swapDetailBanner(_ proposalId: String) -> some View {
        NavigationLink {
            ProposalDetailView(proposalId: proposalId)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "arrow.left.arrow.right.circle.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                VStack(alignment: .leading, spacing: 2) {
                    Text("View swap details")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
                    Text("Dates, home & respond")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .glassEffect(.regular, in: .rect(cornerRadius: SwaplDesignSystem.CornerRadius.large))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .padding(.bottom, 4)
        .accessibilityLabel(Text("View swap details and respond"))
    }

    private var floatingHeader: some View {
        ZStack {
            Text(title ?? String(localized: "Messages"))
                .font(.swaplBody(16, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .glassEffect(.regular, in: .capsule)

            HStack {
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
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
    }

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 10, pinnedViews: proposalId != nil ? [.sectionHeaders] : []) {
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
                            Group {
                                if message.isEvent {
                                    ConversationEventRow(message: message)
                                } else {
                                    UnifiedMessageBubble(message: message)
                                }
                            }
                            .id(message.id)
                        }
                    }
                    } header: {
                        // Multi-party People panel (DOK-187) — swap threads only.
                        if let proposalId {
                            ConversationPeopleView(proposalId: proposalId, isPrincipal: isPrincipal, isExpanded: $peopleExpanded)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            }
            .scrollDismissesKeyboard(.interactively)
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
        .glassEffect(.regular, in: .rect(cornerRadius: 28))
        .padding(.horizontal, 12)
        .padding(.bottom, 6)
    }

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

// A member message bubble — mine right/primary, theirs left/card. Mirrors the
// swap chat's MessageBubble but reads the unified message shape (optional body,
// no read receipt — the unified thread doesn't surface per-message receipts yet).
struct UnifiedMessageBubble: View {
    let message: UnifiedMessage

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

                if let body = message.body, !body.isEmpty {
                    Text(body)
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
                    // Read receipt: a double-check that fills in once the
                    // counterpart has read my message.
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

// A centered system-event row: a small glass pill describing a lifecycle moment
// (request sent, confirmed, checked in, …), so the timeline doubles as a log.
struct ConversationEventRow: View {
    let message: UnifiedMessage

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
            Text(label)
                .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
        }
        .foregroundStyle(AirbnbPalette.secondaryText)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .glassEffect(.regular, in: .capsule)
        .frame(maxWidth: .infinity)
    }

    private var icon: String {
        switch message.eventType {
        case "request_sent": return "paperplane"
        case "preapproved", "confirmed", "accepted", "change_accepted": return "checkmark.circle"
        case "countered", "change_requested": return "calendar"
        case "declined", "withdrawn", "cancelled": return "xmark.circle"
        case "checked_in": return "arrow.down.to.line"
        case "checked_out": return "arrow.up.to.line"
        case "completed": return "flag.checkered"
        default: return "info.circle"
        }
    }

    private var label: String {
        let by = message.eventMeta?.by
        switch message.eventType {
        case "request_sent": return String(localized: "Request sent")
        case "preapproved": return String(localized: "Pre-approved")
        case "confirmed": return String(localized: "Confirmed")
        case "accepted": return String(localized: "Swap accepted")
        case "countered": return String(localized: "New dates proposed")
        case "declined": return String(localized: "Declined")
        case "withdrawn": return String(localized: "Withdrawn")
        case "cancelled": return String(localized: "Cancelled")
        case "change_requested": return String(localized: "Change requested")
        case "change_accepted": return String(localized: "Change accepted")
        case "checked_in": return by.map { String(localized: "\($0) checked in") } ?? String(localized: "Checked in")
        case "checked_out": return by.map { String(localized: "\($0) checked out") } ?? String(localized: "Checked out")
        case "completed": return String(localized: "Completed")
        default: return String(localized: "Update")
        }
    }
}
