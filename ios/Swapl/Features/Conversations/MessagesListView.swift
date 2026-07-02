import SwiftUI
import Observation
import SwaplDesignTokens

// The Messages tab (DOK-221): one unified list of conversations across both
// swap- and stay-backed threads, newest activity first. Tapping a row opens the
// unified ConversationView; swap threads link on to the swap detail (where
// Accept/Decline live) from inside the chat. Swipe to archive/restore per-user.
// One titled group of threads in the Messages list (Group-by). `title` is nil
// when grouping is off (a single flat section).
struct ConversationSection: Identifiable {
    let id: String
    let title: String?
    let items: [UnifiedConversation]
}

@MainActor
@Observable
final class MessagesListViewModel {
    var threads: [UnifiedConversation] = []
    var isLoading = false
    var hasLoaded = false
    var error: String?

    // Pill controls (DOK-221): Filter / Order by / Group by — restored on the
    // unified Messages list. Filter narrows by my role, Order sorts the flat
    // list, Group splits it into titled sections.
    var filter: ConvFilter = .all
    var sort: ConvSort = .recent
    var grouping: ConvGrouping = .none

    enum ConvFilter: String, CaseIterable {
        case all, hosting, traveling
        var label: String {
            switch self {
            case .all: return String(localized: "All")
            case .hosting: return String(localized: "Hosting")
            case .traveling: return String(localized: "Traveling")
            }
        }
    }

    enum ConvSort: String, CaseIterable {
        case recent, unread, checkIn, name
        var label: String {
            switch self {
            case .recent: return String(localized: "Last message")
            case .unread: return String(localized: "Unread first")
            case .checkIn: return String(localized: "Check-in date")
            case .name: return String(localized: "Name")
            }
        }
    }

    enum ConvGrouping: String, CaseIterable {
        case none, type, status, role
        var label: String {
            switch self {
            case .none: return String(localized: "None")
            case .type: return String(localized: "Type")
            case .status: return String(localized: "Status")
            case .role: return String(localized: "Role")
            }
        }
    }

    var active: [UnifiedConversation] { threads.filter { !$0.isArchived } }
    var archived: [UnifiedConversation] { threads.filter { $0.isArchived } }
    var isEmpty: Bool { threads.isEmpty }

    // Active threads after Filter + Order by (grouping applied separately).
    var visible: [UnifiedConversation] {
        var base = active
        switch filter {
        case .all: break
        case .hosting: base = base.filter { $0.role == "hosting" }
        case .traveling: base = base.filter { $0.role == "traveling" }
        }
        return base.sorted(by: ordered)
    }

    private func ordered(_ a: UnifiedConversation, _ b: UnifiedConversation) -> Bool {
        switch sort {
        case .recent:
            return a.lastMessageAt > b.lastMessageAt
        case .unread:
            if (a.unreadCount > 0) != (b.unreadCount > 0) { return a.unreadCount > 0 }
            return a.lastMessageAt > b.lastMessageAt
        case .checkIn:
            // Soonest upcoming check-in first; threads without a date sort last.
            switch (a.dateFrom, b.dateFrom) {
            case let (x?, y?): return x < y
            case (_?, nil): return true
            case (nil, _?): return false
            case (nil, nil): return a.lastMessageAt > b.lastMessageAt
            }
        case .name:
            let an = (a.counterpartName ?? a.title).lowercased()
            let bn = (b.counterpartName ?? b.title).lowercased()
            return an == bn ? a.lastMessageAt > b.lastMessageAt : an < bn
        }
    }

    // `visible`, split into titled sections per the Group-by selection. Groups
    // appear in a stable, meaningful order; an empty selection is a single
    // untitled section.
    var sections: [ConversationSection] {
        let items = visible
        switch grouping {
        case .none:
            return [ConversationSection(id: "all", title: nil, items: items)]
        case .type:
            return orderedSections(items, keys: ["stay", "swap"],
                titles: ["stay": String(localized: "Stays"), "swap": String(localized: "Swaps")],
                key: { $0.kind })
        case .role:
            return orderedSections(items, keys: ["hosting", "traveling"],
                titles: ["hosting": String(localized: "Hosting"), "traveling": String(localized: "Traveling")],
                key: { $0.role })
        case .status:
            // Group by raw status, ordered by first appearance in the sorted list.
            var order: [String] = []
            var byStatus: [String: [UnifiedConversation]] = [:]
            for c in items {
                if byStatus[c.status] == nil { order.append(c.status) }
                byStatus[c.status, default: []].append(c)
            }
            return order.map { s in
                ConversationSection(id: "status-\(s)", title: statusTitle(s), items: byStatus[s] ?? [])
            }
        }
    }

    private func orderedSections(
        _ items: [UnifiedConversation],
        keys: [String],
        titles: [String: String],
        key: (UnifiedConversation) -> String
    ) -> [ConversationSection] {
        keys.compactMap { k in
            let group = items.filter { key($0) == k }
            guard !group.isEmpty else { return nil }
            return ConversationSection(id: k, title: titles[k] ?? k.capitalized, items: group)
        }
    }

    private func statusTitle(_ raw: String) -> String {
        // Status strings differ across swaps (PENDING/ACCEPTED/…) and stays
        // (pending/confirmed/…); show a readable, capitalized label either way.
        raw.replacingOccurrences(of: "_", with: " ").capitalized
    }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            threads = try await ConversationRepository.shared.list().conversations
            hasLoaded = true
        } catch {
            self.error = error.localizedDescription
            hasLoaded = true
        }
    }

    func setArchived(_ c: UnifiedConversation, _ archived: Bool) async {
        do {
            try await ConversationRepository.shared.setArchived(conversationId: c.id, archived: archived)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct MessagesListView: View {
    @State private var vm = MessagesListViewModel()
    @State private var navPath = NavigationPath()
    @State private var showArchived = false
    @Environment(UnreadStore.self) private var unread

    var body: some View {
        NavigationStack(path: $navPath) {
            Group {
                if vm.isLoading && !vm.hasLoaded {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel("Loading messages")
                } else if let error = vm.error, vm.isEmpty {
                    SwaplEmptyState(
                        systemImage: "wifi.exclamationmark",
                        title: String(localized: "Messages unavailable"),
                        description: error,
                        actionTitle: String(localized: "Try Again"),
                        action: { Task { await vm.load() } }
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if vm.isEmpty {
                    SwaplEmptyState(
                        systemImage: "message",
                        title: String(localized: "No messages yet"),
                        description: String(localized: "When you book a stay or send a swap, the conversation appears here.")
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    listContent
                }
            }
            .swaplScreenBackground()
            .navigationDestination(for: UnifiedConversation.self) { c in
                ConversationView(
                    conversationId: c.id,
                    title: c.counterpartName ?? c.title,
                    proposalId: c.proposalId,
                    isPrincipal: c.isPrincipal
                )
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .task { await vm.load(); await unread.refresh() }
            .refreshable { await vm.load(); await unread.refresh() }
        }
    }

    private var listContent: some View {
        List {
            Section {
                SwaplPageTitle(String(localized: "Messages")) {
                    headerControls
                }
            }
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)

            ForEach(vm.sections) { section in
                if let title = section.title {
                    Text(title)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .bold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .textCase(.uppercase)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 12, leading: 22, bottom: 2, trailing: 22))
                        .listRowBackground(Color.clear)
                }
                ForEach(section.items) { c in
                    ThreadRow(conversation: c, onOpen: { navPath.append(c) })
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 11, leading: 22, bottom: 11, trailing: 22))
                        .listRowBackground(Color.clear)
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button { Task { await vm.setArchived(c, true) } } label: {
                                Label(String(localized: "Archive"), systemImage: "archivebox")
                            }
                            .tint(AirbnbPalette.secondaryText)
                        }
                }
            }

            if vm.visible.isEmpty && !vm.active.isEmpty {
                Text(String(localized: "No conversations match this filter."))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 24, leading: 22, bottom: 24, trailing: 22))
                    .listRowBackground(Color.clear)
            }

            if !vm.archived.isEmpty {
                Section {
                    Button {
                        withAnimation(.snappy) { showArchived.toggle() }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: showArchived ? "chevron.down" : "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                            Text(String(localized: "Archived (\(vm.archived.count))"))
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                            Spacer()
                        }
                        .foregroundStyle(AirbnbPalette.secondaryText)
                    }
                    .buttonStyle(.plain)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 8, leading: 22, bottom: 4, trailing: 22))
                    .listRowBackground(Color.clear)

                    if showArchived {
                        ForEach(vm.archived) { c in
                            ThreadRow(conversation: c, onOpen: { navPath.append(c) })
                                .opacity(0.6)
                                .listRowSeparator(.hidden)
                                .listRowInsets(EdgeInsets(top: 11, leading: 22, bottom: 11, trailing: 22))
                                .listRowBackground(Color.clear)
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button { Task { await vm.setArchived(c, false) } } label: {
                                        Label(String(localized: "Restore"), systemImage: "tray.and.arrow.up")
                                    }
                                    .tint(SwaplSemanticLight.primary)
                                }
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    // Filter / Order by / Group by — circular glass icon-menus in the page-title
    // trailing slot, matching the other list headers (Wishlists, Explore, Swaps
    // inbox). An active filter/grouping shows a pink dot.
    private var headerControls: some View {
        HStack(spacing: 8) {
            Menu {
                Picker(String(localized: "Show"), selection: Bindable(vm).filter) {
                    ForEach(MessagesListViewModel.ConvFilter.allCases, id: \.self) { f in
                        Text(f.label).tag(f)
                    }
                }
            } label: {
                headerIcon("line.3.horizontal.decrease", active: vm.filter != .all)
            }
            .accessibilityLabel(Text("Filter messages"))

            Menu {
                Picker(String(localized: "Order by"), selection: Bindable(vm).sort) {
                    ForEach(MessagesListViewModel.ConvSort.allCases, id: \.self) { s in
                        Text(s.label).tag(s)
                    }
                }
            } label: {
                headerIcon("arrow.up.arrow.down", active: false)
            }
            .accessibilityLabel(Text("Order by"))

            Menu {
                Picker(String(localized: "Group by"), selection: Bindable(vm).grouping) {
                    ForEach(MessagesListViewModel.ConvGrouping.allCases, id: \.self) { g in
                        Text(g.label).tag(g)
                    }
                }
            } label: {
                headerIcon("rectangle.3.group", active: vm.grouping != .none)
            }
            .accessibilityLabel(Text("Group by"))
        }
    }

    private func headerIcon(_ systemName: String, active: Bool) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(AirbnbPalette.text)
            .frame(width: 44, height: 44)
            .glassEffect(.regular.interactive(), in: .circle)
            .overlay(alignment: .topTrailing) {
                if active {
                    Circle().fill(SwaplSemanticLight.primary).frame(width: 9, height: 9)
                }
            }
    }
}

// One conversation row: cover thumbnail, counterpart + last line, time, unread.
private struct ThreadRow: View {
    let conversation: UnifiedConversation
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 12) {
                thumbnail
                VStack(alignment: .leading, spacing: 3) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(conversation.counterpartName ?? conversation.title)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: conversation.unreadCount > 0 ? .bold : .semibold))
                            .foregroundStyle(AirbnbPalette.text)
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        Text(timeLabel)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                    }
                    HStack(spacing: 6) {
                        methodBadge
                        Text(conversation.lastLine ?? conversation.title)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                            .foregroundStyle(conversation.unreadCount > 0 ? AirbnbPalette.text : AirbnbPalette.secondaryText)
                            .lineLimit(1)
                        Spacer(minLength: 6)
                        if conversation.unreadCount > 0 {
                            Text("\(conversation.unreadCount)")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .bold))
                                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                                .frame(minWidth: 20, minHeight: 20)
                                .background(SwaplSemanticLight.primary, in: Circle())
                        }
                    }
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var thumbnail: some View {
        let shape = RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
        Group {
            if let photo = conversation.photo, let url = URL(string: photo) {
                AsyncImage(url: url) { img in
                    img.resizable().scaledToFill()
                } placeholder: {
                    SwaplSemanticLight.muted
                }
            } else {
                ZStack {
                    SwaplSemanticLight.muted
                    Text(String((conversation.city ?? conversation.title).prefix(1)))
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
            }
        }
        .frame(width: 60, height: 60)
        .clipShape(shape)
        .overlay(shape.stroke(AirbnbPalette.hairline))
    }

    // A tiny tag distinguishing a stay from a swap thread.
    private var methodBadge: some View {
        Image(systemName: conversation.kind == "stay" ? "key.fill" : "arrow.left.arrow.right")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(AirbnbPalette.secondaryText)
    }

    private var timeLabel: String {
        guard let date = SwaplDateText.parseInstant(conversation.lastMessageAt) else { return "" }
        let cal = Calendar.current
        if cal.isDateInToday(date) {
            let f = DateFormatter(); f.setLocalizedDateFormatFromTemplate("jm"); return f.string(from: date)
        }
        if cal.isDateInYesterday(date) { return String(localized: "Yesterday") }
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate(cal.isDate(date, equalTo: Date(), toGranularity: .year) ? "MMM d" : "MMM d yyyy")
        return f.string(from: date)
    }
}
