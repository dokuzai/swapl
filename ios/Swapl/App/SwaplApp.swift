import SwiftUI
import SwaplDesignTokens

@main
struct SwaplApp: App {
    @State private var auth = AuthService()
    @State private var pushService = PushService()
    @State private var favorites = FavoritesStore()
    @State private var unread = UnreadStore()

    init() {
        SwaplFonts.register()
        Self.configureNavigationBarAppearance()
        // Register App Shortcuts for Siri
        SwaplAppShortcuts.updateAppShortcutParameters()
    }

    // Pushed/presented screens that keep the system navigation bar (listing
    // detail, public profile, saved searches, …) get brand-coherent titles:
    // Fraunces instead of SF Pro, design-system foreground. Must run after
    // SwaplFonts.register() so the named instances of the variable font
    // resolve ("Fraunces-SemiBold" is the bundled font's PostScript name).
    private static func configureNavigationBarAppearance() {
        let foreground = UIColor(SwaplSemanticLight.foreground)
        // Wrap the brand fonts in UIFontMetrics so nav titles scale with the
        // user's Dynamic Type / accessibility text size settings.
        let baseTitleFont = UIFont(name: "Fraunces-SemiBold", size: 17)
            ?? UIFont.systemFont(ofSize: 17, weight: .semibold)
        let baseLargeTitleFont = UIFont(name: "Fraunces-SemiBold", size: 32)
            ?? UIFont.systemFont(ofSize: 32, weight: .semibold)
        let titleFont = UIFontMetrics(forTextStyle: .body).scaledFont(for: baseTitleFont)
        let largeTitleFont = UIFontMetrics(forTextStyle: .largeTitle).scaledFont(for: baseLargeTitleFont)

        let appearance = UINavigationBarAppearance()
        appearance.configureWithDefaultBackground()
        appearance.titleTextAttributes = [.font: titleFont, .foregroundColor: foreground]
        appearance.largeTitleTextAttributes = [.font: largeTitleFont, .foregroundColor: foreground]

        UINavigationBar.appearance().standardAppearance = appearance
        UINavigationBar.appearance().compactAppearance = appearance
        UINavigationBar.appearance().scrollEdgeAppearance = appearance
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .environment(pushService)
                .environment(favorites)
                .environment(unread)
                .tint(SwaplSemanticLight.primary)
        }
    }
}

struct RootView: View {
    @Environment(AuthService.self) private var auth
    @Environment(FavoritesStore.self) private var favorites
    @Environment(PushService.self) private var push
    @Environment(UnreadStore.self) private var unread

    // Centralized deep-link routing: whatever the source (push tap, custom
    // scheme, universal link), the destination is presented as a sheet over
    // the main tabs. `stashedDeepLink` holds links that arrive before the
    // session is ready (cold start from a push, link tapped while logged out)
    // and is flushed once authenticated.
    @State private var activeDeepLink: DeepLinkDestination?
    @State private var stashedDeepLink: DeepLinkDestination?

    var body: some View {
        Group {
            if auth.isBootstrapping {
                LaunchLoadingView()
            } else if auth.session == nil {
                LoginView()
            } else {
                MainTabView()
                    .safeAreaInset(edge: .top) {
                        if !auth.isVerified {
                            VerifyEmailBanner()
                        }
                    }
            }
        }
        .task { await auth.bootstrap() }
        // Sync heart states with the signed-in user: load once per session,
        // clear on sign-out so the next account doesn't inherit them.
        .task(id: auth.session?.id) {
            if auth.session == nil {
                favorites.reset()
                unread.reset()
            } else {
                await favorites.loadIdsIfNeeded()
                await unread.refresh()
            }
            consumePushDeepLink()
            flushStashedDeepLinkIfReady()
        }
        // Custom scheme (swapl://) and universal links (https://app.swapl.fun).
        .onOpenURL { handleDeepLink($0) }
        // Push taps while the app is running; cold-start taps are picked up by
        // the session task above via consumePushDeepLink().
        .onChange(of: push.pendingDeepLink) { _, url in
            guard url != nil else { return }
            consumePushDeepLink()
        }
        // UI-test hook, same spirit as the SWAPL_API_BASE_URL override.
        .onAppear {
            if let raw = ProcessInfo.processInfo.environment["SWAPL_DEEPLINK_URL"],
               let url = URL(string: raw) {
                handleDeepLink(url)
            }
        }
        .sheet(item: $activeDeepLink) { destination in
            NavigationStack {
                switch destination {
                case .listing(let id):
                    ListingDetailView(listingId: id)
                case .proposal(let id):
                    ProposalDetailView(proposalId: id)
                }
            }
        }
    }

    private func handleDeepLink(_ url: URL) {
        guard let destination = DeepLinkDestination.parse(url) else { return }
        if auth.session != nil, !auth.isBootstrapping {
            activeDeepLink = destination
        } else {
            stashedDeepLink = destination
        }
    }

    private func consumePushDeepLink() {
        guard let url = push.pendingDeepLink else { return }
        push.pendingDeepLink = nil
        handleDeepLink(url)
    }

    private func flushStashedDeepLinkIfReady() {
        guard auth.session != nil, let destination = stashedDeepLink else { return }
        stashedDeepLink = nil
        activeDeepLink = destination
    }
}

struct VerifyEmailBanner: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.scenePhase) private var scenePhase
    @State private var status: String?
    @State private var busy = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "envelope.badge")
                .foregroundStyle(SwaplSemanticLight.primary)
            VStack(alignment: .leading, spacing: 2) {
                Text("Verify your email")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.foreground)
                Text(status ?? String(localized: "Required before you can publish a home."))
                    .font(.swaplBody(12))
                    .foregroundStyle(SwaplSemanticLight.mutedForeground)
            }
            Spacer()
            if busy {
                ProgressView()
            } else {
                Button {
                    resend()
                } label: {
                    Text("Resend")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
        .overlay(alignment: .bottom) { Divider() }
        // Re-check verification when returning to the app (e.g. after tapping
        // the email link, which verifies server-side on the web page).
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await auth.refreshSession() } }
        }
    }

    private func resend() {
        busy = true
        Task {
            let ok = await auth.resendVerification()
            status = ok ? "Sent — check your inbox, then return here." : "Couldn't send. Try again."
            busy = false
        }
    }
}

struct LaunchLoadingView: View {
    var body: some View {
        ZStack {
            SwaplSemanticLight.background.ignoresSafeArea()
            ProgressView()
                .tint(SwaplSemanticLight.primary)
                .accessibilityLabel("Loading Swapl")
        }
    }
}

struct MainTabView: View {
    @Environment(\.horizontalSizeClass) private var size
    @Environment(UnreadStore.self) private var unread
    @Environment(\.scenePhase) private var scenePhase
    @State private var selection: AppSection = .explore

    var body: some View {
        content
            // Lightweight foreground poll so the Messages badge stays fresh
            // without a WebSocket — suspends when the app isn't active.
            .task(id: scenePhase) {
                guard scenePhase == .active else { return }
                await unread.refresh()
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(20))
                    guard scenePhase == .active else { break }
                    await unread.refresh()
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        if size == .regular {
            NavigationSplitView {
                SidebarView(selection: $selection)
            } detail: {
                switch selection {
                case .explore:
                    BrowseListView()
                case .wishlists:
                    WishlistsView()
                case .trips:
                    TripsView()
                case .messages:
                    SwapsInboxView()
                case .profile:
                    AccountView()
                }
            }
        } else {
            TabView {
                BrowseListView()
                    .tabItem { Label("Explore", systemImage: "magnifyingglass") }
                WishlistsView()
                    .tabItem { Label("Wishlists", systemImage: "heart") }
                TripsView()
                    .tabItem { Label("Trips", systemImage: "suitcase.rolling") }
                SwapsInboxView()
                    .tabItem { Label("Messages", systemImage: "message") }
                    .badge(unread.totalUnread)
                AccountView()
                    .tabItem { Label("Profile", systemImage: "person.crop.circle") }
            }
            .tint(SwaplSemanticLight.primary)
            .onAppear {
                let appearance = UITabBarAppearance()
                appearance.configureWithDefaultBackground()
                appearance.backgroundColor = UIColor(SwaplSemanticLight.background)
                
                // Customize icon colors
                let itemAppearance = UITabBarItemAppearance()
                itemAppearance.normal.iconColor = UIColor(AirbnbPalette.secondaryText)
                itemAppearance.normal.titleTextAttributes = [.foregroundColor: UIColor(AirbnbPalette.secondaryText)]
                itemAppearance.selected.iconColor = UIColor(SwaplSemanticLight.primary)
                itemAppearance.selected.titleTextAttributes = [.foregroundColor: UIColor(SwaplSemanticLight.primary)]
                
                appearance.stackedLayoutAppearance = itemAppearance
                appearance.inlineLayoutAppearance = itemAppearance
                appearance.compactInlineLayoutAppearance = itemAppearance
                
                UITabBar.appearance().standardAppearance = appearance
                UITabBar.appearance().scrollEdgeAppearance = appearance
            }
        }
    }
}

enum AppSection: String, CaseIterable, Identifiable {
    case explore
    case wishlists
    case trips
    case messages
    case profile

    var id: String { rawValue }

    var title: String {
        switch self {
        case .explore: "Explore"
        case .wishlists: "Wishlists"
        case .trips: "Trips"
        case .messages: "Messages"
        case .profile: "Profile"
        }
    }

    var systemImage: String {
        switch self {
        case .explore: "magnifyingglass"
        case .wishlists: "heart"
        case .trips: "suitcase.rolling"
        case .messages: "message"
        case .profile: "person.crop.circle"
        }
    }
}

struct SidebarView: View {
    @Binding var selection: AppSection

    var body: some View {
        List {
            ForEach(AppSection.allCases) { section in
                Button {
                    selection = section
                } label: {
                    Label(section.title, systemImage: section.systemImage)
                        .foregroundStyle(selection == section ? SwaplSemanticLight.primary : AirbnbPalette.text)
                }
            }
        }
        .navigationTitle("swapl")
    }
}
