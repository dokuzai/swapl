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
    // In-flight date-change request (DOK-221 Phase 3), surfaced by the timeline.
    var pendingChange: PendingDateChange?
    var changeBusy = false
    var changeError: String?
    // Role-aware header context (DOK-221): participants + the concrete
    // transaction this thread is about. Best-effort; a nil context just hides
    // the header.
    var context: ConversationContext?

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
            pendingChange = page.pendingChange
            hasLoadedOnce = true
            scrollAnchor = messages.last?.id
        } catch {
            loadError = error.localizedDescription
            hasLoadedOnce = true
        }
    }

    func loadContext() async {
        context = try? await ConversationRepository.shared.context(conversationId: conversationId)
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
            pendingChange = page.pendingChange
        } catch {
            // Transient poll failures are ignored; the next tick retries.
        }
    }

    // Propose new dates (DOK-221 Phase 3). ISO yyyy-MM-dd strings.
    func requestChange(dateFrom: String, dateTo: String) async -> Bool {
        changeBusy = true
        changeError = nil
        defer { changeBusy = false }
        do {
            try await ConversationRepository.shared.requestDateChange(conversationId: conversationId, dateFrom: dateFrom, dateTo: dateTo)
            await load()
            await loadContext()
            return true
        } catch {
            changeError = error.localizedDescription
            return false
        }
    }

    // Accept / decline (or withdraw) the pending date change.
    func respondChange(accept: Bool) async {
        changeBusy = true
        changeError = nil
        defer { changeBusy = false }
        do {
            try await ConversationRepository.shared.respondDateChange(conversationId: conversationId, accept: accept)
            await load()
            await loadContext()
        } catch {
            changeError = error.localizedDescription
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
    @State private var showDateChange = false

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
            thread
            if let pc = vm.pendingChange { pendingChangeCard(pc) }
            composer
        }
        .toolbar(.hidden, for: .tabBar)
        .toolbar(.hidden, for: .navigationBar)
        .navigationBarBackButtonHidden(true)
        // The page header + the transaction banner float together as Liquid
        // Glass; the timeline scrolls beneath them (no opaque background).
        .safeAreaInset(edge: .top) {
            VStack(spacing: 0) {
                floatingHeader
                if let ctx = vm.context { contextHeader(ctx) }
            }
        }
        .background(SwaplSemanticLight.background.ignoresSafeArea())
        .task { await vm.load() }
        .task { await vm.loadContext() }
        .task(id: scenePhase) { await pollLoop() }
        .onChange(of: photoItems) { _, items in
            Task { await upload(items) }
        }
        .sheet(isPresented: $showDateChange) {
            DateChangeSheet(conversationId: vm.conversationId) { from, to in
                let ok = await vm.requestChange(dateFrom: from, dateTo: to)
                if ok { showDateChange = false }
                return vm.changeError
            }
        }
    }

    // Role-aware header shown on EVERY thread (DOK-221): a concrete reference to
    // the transaction (which home(s), dates, status, Keys) plus — for stays —
    // the participants bar. Swap threads carry the richer multi-party People
    // panel inside the timeline, so the participants bar is rendered for stays
    // only to avoid duplicating the roster.
    @ViewBuilder
    private func contextHeader(_ ctx: ConversationContext) -> some View {
        VStack(spacing: 8) {
            transactionCard(ctx)
            if ctx.proposalId == nil {
                participantsBar(ctx)
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .padding(.bottom, 4)
    }

    @ViewBuilder
    private func transactionCard(_ ctx: ConversationContext) -> some View {
        if ctx.isSwap, let proposalId = ctx.proposalId {
            NavigationLink { ProposalDetailView(proposalId: proposalId) } label: {
                swapCardBody(ctx)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Swap details — tap to respond"))
        } else {
            stayCardBody(ctx)
        }
    }

    private func swapCardBody(_ ctx: ConversationContext) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                homeThumb(ctx.myHome, size: 40)
                Image(systemName: "arrow.left.arrow.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                homeThumb(ctx.home, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(homeTitle(ctx.home, fallback: String(localized: "Home exchange")))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
                    Text(exchangeSubtitle(ctx))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(1)
                }
                Spacer(minLength: 4)
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            HStack(spacing: 8) {
                statusBadge(ctx.status)
                Text(datesLine(ctx))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .glassEffect(.regular, in: .rect(cornerRadius: SwaplDesignSystem.CornerRadius.large))
    }

    private func stayCardBody(_ ctx: ConversationContext) -> some View {
        HStack(spacing: 12) {
            homeThumb(ctx.home, size: 52)
            VStack(alignment: .leading, spacing: 3) {
                Text(homeTitle(ctx.home, fallback: String(localized: "Stay")))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                    .lineLimit(1)
                Text(staySubtitle(ctx))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .lineLimit(1)
                HStack(spacing: 8) {
                    statusBadge(ctx.status)
                    if let keys = ctx.keys {
                        Label(
                            keys.kind == "couchsurf" ? String(localized: "Couchsurf") : String(localized: "\(keys.cost) Keys"),
                            systemImage: keys.kind == "couchsurf" ? "figure.wave" : "key.fill"
                        )
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .glassEffect(.regular, in: .rect(cornerRadius: SwaplDesignSystem.CornerRadius.large))
    }

    // The 2-party people bar (stays). Each party shows avatar, name (or "You"),
    // their role, and a verified seal.
    private func participantsBar(_ ctx: ConversationContext) -> some View {
        HStack(spacing: 8) {
            ForEach(ctx.participants) { p in
                HStack(spacing: 7) {
                    participantAvatar(p)
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 3) {
                            Text(p.isMe ? String(localized: "You") : (p.name ?? (p.isHost ? String(localized: "Host") : String(localized: "Guest"))))
                                .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                                .lineLimit(1)
                            if p.verified {
                                Image(systemName: "checkmark.seal.fill")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(SwaplSemanticLight.primary)
                            }
                        }
                        Text(p.isHost ? String(localized: "Host") : String(localized: "Guest"))
                            .font(.swaplBody(SwaplDesignSystem.FontSize.tiny))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .glassEffect(.regular, in: .capsule)
            }
            Spacer(minLength: 0)
        }
    }

    private func participantAvatar(_ p: ConversationContext.Participant) -> some View {
        let initials = String((p.name ?? (p.isHost ? "H" : "G")).prefix(1)).uppercased()
        return Group {
            if let avatar = p.avatar, let url = URL(string: avatar) {
                AsyncImage(url: url) { img in
                    img.resizable().scaledToFill()
                } placeholder: {
                    SwaplSemanticLight.muted
                }
            } else {
                ZStack {
                    SwaplSemanticLight.muted
                    Text(initials)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.tiny, weight: .bold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
            }
        }
        .frame(width: 26, height: 26)
        .clipShape(Circle())
        .overlay(Circle().stroke(AirbnbPalette.hairline))
    }

    private func homeThumb(_ home: ConversationContext.Home?, size: CGFloat) -> some View {
        let shape = RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.small, style: .continuous)
        return Group {
            if let photo = home?.photo, let url = URL(string: photo) {
                AsyncImage(url: url) { img in
                    img.resizable().scaledToFill()
                } placeholder: {
                    SwaplSemanticLight.muted
                }
            } else {
                ZStack {
                    SwaplSemanticLight.muted
                    Image(systemName: "house.fill")
                        .font(.system(size: size * 0.4, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(shape)
        .overlay(shape.stroke(AirbnbPalette.hairline))
    }

    private func statusBadge(_ status: String) -> some View {
        let s = status.lowercased()
        let positive = ["confirmed", "accepted", "active", "completed"].contains(s)
        let negative = ["declined", "cancelled", "withdrawn"].contains(s)
        let color: Color = positive ? SwaplSemanticLight.primary : (negative ? AirbnbPalette.secondaryText : AirbnbPalette.text)
        return Text(status.replacingOccurrences(of: "_", with: " ").capitalized)
            .font(.swaplBody(SwaplDesignSystem.FontSize.tiny, weight: .bold))
            .foregroundStyle(color)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(color.opacity(0.12), in: Capsule())
    }

    private func homeTitle(_ home: ConversationContext.Home?, fallback: String) -> String {
        guard let home else { return fallback }
        let t = home.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? (home.city ?? fallback) : t
    }

    private func datesLine(_ ctx: ConversationContext) -> String {
        SwaplDateText.range(from: ctx.dateFrom, to: ctx.dateTo)
    }

    private func exchangeSubtitle(_ ctx: ConversationContext) -> String {
        let mine = ctx.myHome?.city
        let theirs = ctx.home?.city
        if let mine, let theirs { return "\(mine) ⇄ \(theirs)" }
        return String(localized: "Home exchange")
    }

    private func staySubtitle(_ ctx: ConversationContext) -> String {
        let nightsText = ctx.nights == 1 ? String(localized: "1 night") : String(localized: "\(ctx.nights) nights")
        if let city = ctx.home?.city, !city.isEmpty {
            return "\(city) · \(datesLine(ctx)) · \(nightsText)"
        }
        return "\(datesLine(ctx)) · \(nightsText)"
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
                // Principals can propose new dates (DOK-221 Phase 3) when none is
                // already in flight.
                if isPrincipal && vm.pendingChange == nil {
                    Button {
                        showDateChange = true
                    } label: {
                        Image(systemName: "calendar.badge.clock")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.text)
                            .frame(width: 44, height: 44)
                            .glassEffect(.regular.interactive(), in: .circle)
                    }
                    .accessibilityLabel("Propose new dates")
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
    }

    // Pending date-change action card, pinned above the composer. The counterpart
    // sees Accept / Decline; the proposer sees a waiting note + Withdraw.
    private func pendingChangeCard(_ pc: PendingDateChange) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "calendar.badge.clock")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                Text(pc.mine ? String(localized: "New dates proposed") : String(localized: "New dates requested"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
            }
            Text(SwaplDateText.range(from: pc.from, to: pc.to))
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            if let err = vm.changeError {
                Text(err)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.destructive)
            }

            if pc.mine {
                Button { Task { await vm.respondChange(accept: false) } } label: {
                    Text("Withdraw")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .overlay(Capsule().stroke(AirbnbPalette.text.opacity(0.18)))
                }
                .buttonStyle(.plain).disabled(vm.changeBusy)
                .foregroundStyle(AirbnbPalette.text)
            } else {
                HStack(spacing: 10) {
                    Button { Task { await vm.respondChange(accept: false) } } label: {
                        Text("Decline")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                            .frame(maxWidth: .infinity).frame(height: 44)
                            .overlay(Capsule().stroke(AirbnbPalette.text.opacity(0.18)))
                    }
                    .buttonStyle(.plain).foregroundStyle(AirbnbPalette.text)
                    Button { Task { await vm.respondChange(accept: true) } } label: {
                        Group {
                            if vm.changeBusy { ProgressView().tint(SwaplSemanticLight.primaryForeground) }
                            else { Text("Accept new dates") }
                        }
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        .frame(maxWidth: .infinity).frame(height: 44)
                        .background(SwaplSemanticLight.primary, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                .disabled(vm.changeBusy)
            }
        }
        .padding(14)
        .glassEffect(.regular, in: .rect(cornerRadius: SwaplDesignSystem.CornerRadius.large))
        .padding(.horizontal, 12)
        .padding(.bottom, 4)
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
                    Text(conversationTimestamp(message.createdAt))
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
}

// Propose a new booking range (DOK-221 Phase 3) on the SAME availability-aware
// range calendar the booking flow uses: taken dates greyed out (excluding this
// booking's own), tap check-in then check-out. onSubmit returns an error string
// to show in place, or nil on success (the caller dismisses).
struct DateChangeSheet: View {
    @Environment(\.dismiss) private var dismiss
    let conversationId: String
    let onSubmit: (_ dateFrom: String, _ dateTo: String) async -> String?

    @State private var context: DateChangeContext?
    @State private var dateFrom = Calendar.current.startOfDay(for: Date())
    @State private var dateTo = Calendar.current.date(byAdding: .day, value: 2, to: Calendar.current.startOfDay(for: Date())) ?? Date()
    @State private var loading = true
    @State private var loadError: String?
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                if let context {
                    Section {
                        AvailabilityCalendar(
                            days: AvailabilityDays(availability: context.availability),
                            mode: .range,
                            selectionStart: Binding(get: { dateFrom }, set: { if let v = $0 { dateFrom = v } }),
                            selectionEnd: Binding(get: { dateTo }, set: { dateTo = $0 ?? dateFrom }),
                            onSelectionChange: { from, to in
                                if let from { dateFrom = from }
                                dateTo = to ?? Calendar.current.date(byAdding: .day, value: 1, to: from ?? dateFrom) ?? dateFrom
                            }
                        )
                        .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                    } footer: {
                        Text("Tap a check-in then a check-out inside the availability. The other party will be asked to accept; Keys adjust if the number of nights changes.")
                    }
                } else if loading {
                    Section { ProgressView().frame(maxWidth: .infinity).padding(.vertical, 24) }
                } else if let loadError {
                    Section { Text(loadError).foregroundStyle(AirbnbPalette.destructive) }
                }
                if let error {
                    Section {
                        Text(error)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                            .foregroundStyle(AirbnbPalette.destructive)
                    }
                }
            }
            .navigationTitle(String(localized: "Propose new dates"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Cancel")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "Send")) {
                        Task {
                            busy = true
                            defer { busy = false }
                            error = await onSubmit(isoDay(dateFrom), isoDay(dateTo))
                        }
                    }
                    .disabled(busy || context == nil)
                }
            }
            .task {
                do {
                    let ctx = try await ConversationRepository.shared.changeContext(conversationId: conversationId)
                    context = ctx
                    if let f = SwaplDateText.parse(ctx.currentFrom) { dateFrom = f }
                    if let t = SwaplDateText.parse(ctx.currentTo) { dateTo = t }
                } catch {
                    loadError = error.localizedDescription
                }
                loading = false
            }
        }
    }

    // The picked calendar day as yyyy-MM-dd (device calendar), matching how the
    // booking flows send dates to the API.
    private func isoDay(_ d: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }
}

// Localized date + time for a timeline item (DOK-221), e.g. "Jun 22, 3:04 PM"
// (year added only when it differs from the current one). Shared by message
// bubbles and event rows so both carry the same stamp.
func conversationTimestamp(_ iso: String) -> String {
    guard let date = SwaplDateText.parseInstant(iso) else { return "" }
    let formatter = DateFormatter()
    let sameYear = Calendar.current.isDate(date, equalTo: Date(), toGranularity: .year)
    formatter.setLocalizedDateFormatFromTemplate(sameYear ? "MMMd jm" : "MMMdyyyy jm")
    return formatter.string(from: date)
}

// A centered system-event row: a small glass pill describing a lifecycle moment
// (request sent, confirmed, checked in, …), so the timeline doubles as a log.
struct ConversationEventRow: View {
    let message: UnifiedMessage

    var body: some View {
        VStack(spacing: 3) {
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

            Text(conversationTimestamp(message.createdAt))
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText.opacity(0.75))
        }
        .frame(maxWidth: .infinity)
    }

    private var icon: String {
        switch message.eventType {
        case "request_sent": return "paperplane"
        case "preapproved", "confirmed", "accepted", "change_accepted": return "checkmark.circle"
        case "countered", "change_requested": return "calendar"
        case "declined", "withdrawn", "cancelled", "change_declined": return "xmark.circle"
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
        case "change_requested": return String(localized: "New dates proposed")
        case "change_accepted": return String(localized: "New dates accepted")
        case "change_declined": return String(localized: "New dates declined")
        case "checked_in": return by.map { String(localized: "\($0) checked in") } ?? String(localized: "Checked in")
        case "checked_out": return by.map { String(localized: "\($0) checked out") } ?? String(localized: "Checked out")
        case "completed": return String(localized: "Completed")
        default: return String(localized: "Update")
        }
    }
}
