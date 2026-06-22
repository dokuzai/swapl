import SwiftUI
import Observation
import SwaplDesignTokens

// The Messages tab (DOK-221): one unified list of conversations across both
// swap- and stay-backed threads, newest activity first. Tapping a row opens the
// unified ConversationView; swap threads link on to the swap detail (where
// Accept/Decline live) from inside the chat. Swipe to archive/restore per-user.
@MainActor
@Observable
final class MessagesListViewModel {
    var threads: [UnifiedConversation] = []
    var isLoading = false
    var hasLoaded = false
    var error: String?

    var active: [UnifiedConversation] { threads.filter { !$0.isArchived } }
    var archived: [UnifiedConversation] { threads.filter { $0.isArchived } }
    var isEmpty: Bool { threads.isEmpty }

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
            .background(SwaplSemanticLight.background)
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
                Text("Messages")
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h1, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 8, leading: 22, bottom: 4, trailing: 22))
            .listRowBackground(Color.clear)

            ForEach(vm.active) { c in
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
        guard let date = SwaplDateText.parse(conversation.lastMessageAt) else { return "" }
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
