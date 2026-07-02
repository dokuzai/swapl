import SwiftUI
import SwaplDesignTokens

// Keep the interactive swipe-to-go-back gesture working on screens that hide
// the system navigation bar for a full-bleed look (e.g. the listing detail,
// where the hero photo must reach the top edge). Without this, hiding the bar
// also disables the edge-swipe pop. The gesture only begins when there's
// something to pop, so root screens are unaffected.
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}

@main
struct SwaplApp: App {
    @State private var auth = AuthService()
    @State private var pushService = PushService()
    @State private var favorites = FavoritesStore()
    @State private var unread = UnreadStore()
    @State private var language = LanguageManager.shared

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
        // Transparent everywhere — no solid/translucent header bar. Floating
        // glass controls (back / title pill / avatar) sit over the content.
        appearance.configureWithTransparentBackground()
        appearance.backgroundColor = .clear
        appearance.shadowColor = .clear
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
                .environment(language)
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
    // Navigation requested by a Siri / App Intent (e.g. tapping a result card).
    @State private var siri = SiriRouter.shared

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
        // Resolve the brand-vs-Apple appearance for the whole tree and inject the
        // matching theme. Pinned to Light for now (content colors aren't yet
        // tokenized for Dark — see SwaplAppearance).
        .swaplTheme()
        .preferredColorScheme(.light)
        .task { await auth.bootstrap() }
        // Sync heart states with the signed-in user: load once per session,
        // clear on sign-out so the next account doesn't inherit them.
        .task(id: auth.session?.id) {
            if auth.session == nil {
                favorites.reset()
                unread.reset()
                // Drop the previous member's homes/swaps from Spotlight so the
                // next account on this device doesn't inherit them.
                await SwaplSpotlightIndex.clear()
            } else {
                await favorites.loadIdsIfNeeded()
                await unread.refresh()
                // Index this member's own homes and live swaps into Spotlight /
                // Apple Intelligence. Runs detached so it never delays the UI.
                Task { await SwaplSpotlightIndex.reindexAll() }
                // Daily coarse location ping (Swapalitics "days abroad"). Sends a
                // device fix when permission is granted, else an empty body so
                // the server falls back to geo-IP. Guarded to once per day.
                await LocationPingService.shared.pingIfDue()
            }
            consumePushDeepLink()
            consumeSiriRoute()
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
        // App Intent asked to navigate (e.g. tapped a Siri result card).
        .onChange(of: siri.pending) { _, dest in
            guard dest != nil else { return }
            consumeSiriRoute()
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

    private func consumeSiriRoute() {
        guard let destination = siri.pending else { return }
        siri.pending = nil
        if auth.session != nil, !auth.isBootstrapping {
            activeDeepLink = destination
        } else {
            stashedDeepLink = destination
        }
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
    @Environment(\.swaplTheme) private var theme
    var body: some View {
        ZStack {
            theme.background.ignoresSafeArea()
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
    @AppStorage(SwaplAppearance.storageKey) private var appearanceRaw = SwaplAppearance.swapl.rawValue
    @State private var selection: AppSection = .explore
    // When a city pill is tapped anywhere (e.g. a listing detail or the swap
    // page), jump to the Explore tab so its map can recenter there (DOK-216).
    @State private var exploreRouter = ExploreRouter.shared

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
            .onChange(of: exploreRouter.pendingMapCity) { _, city in
                if city != nil { selection = .explore }
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
                    MessagesListView()
                case .profile:
                    AccountView()
                }
            }
        } else {
            TabView(selection: $selection) {
                BrowseListView()
                    .tabItem { Label("Explore", systemImage: "magnifyingglass") }
                    .tag(AppSection.explore)
                WishlistsView()
                    .tabItem { Label("Wishlists", systemImage: "heart") }
                    .tag(AppSection.wishlists)
                TripsView()
                    .tabItem { Label("Trips", systemImage: "suitcase.rolling") }
                    .tag(AppSection.trips)
                MessagesListView()
                    .tabItem { Label("Messages", systemImage: "message") }
                    .badge(unread.totalUnread)
                    .tag(AppSection.messages)
                AccountView()
                    .tabItem { Label("Profile", systemImage: "person.crop.circle") }
                    .tag(AppSection.profile)
            }
            .tint(SwaplSemanticLight.primary)
            .onAppear { Self.configureTabBarAppearance(for: SwaplAppearance.resolve(appearanceRaw)) }
            // Re-skin the bar live when the user flips Swapl ↔ Apple in Settings.
            .onChange(of: appearanceRaw) { _, raw in
                Self.configureTabBarAppearance(for: SwaplAppearance.resolve(raw))
            }
        }
    }

    // The tab bar can't read the SwiftUI theme environment (it's a UIKit
    // appearance proxy), so it resolves the same SwaplAppearance directly.
    // `.swapl` tints the bar cream; `.apple` keeps the system default background.
    static func configureTabBarAppearance(for choice: SwaplAppearance) {
        let theme = SwaplTheme(appearance: choice)
        let appearance = UITabBarAppearance()
        appearance.configureWithDefaultBackground()
        if let bar = theme.barBackgroundUIColor {
            appearance.backgroundColor = bar
        }

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
