import SwiftUI
import SwaplDesignTokens

@main
struct SwaplApp: App {
    @State private var auth = AuthService()
    @State private var pushService = PushService()
    @State private var favorites = FavoritesStore()

    init() {
        SwaplFonts.register()
        // Register App Shortcuts for Siri
        SwaplAppShortcuts.updateAppShortcutParameters()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .environment(pushService)
                .environment(favorites)
                .tint(SwaplSemanticLight.primary)
        }
    }
}

struct RootView: View {
    @Environment(AuthService.self) private var auth
    @Environment(FavoritesStore.self) private var favorites

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
            } else {
                await favorites.loadIdsIfNeeded()
            }
        }
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
                Text(status ?? "Required before you can publish a home.")
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
    @State private var selection: AppSection = .explore

    var body: some View {
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
                    AirbnbPlaceholderView(title: "Trips", systemImage: "suitcase.rolling", message: "Accepted swaps will become trips.")
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
                AirbnbPlaceholderView(title: "Trips", systemImage: "suitcase.rolling", message: "Accepted swaps will become trips.")
                    .tabItem { Label("Trips", systemImage: "suitcase.rolling") }
                SwapsInboxView()
                    .tabItem { Label("Messages", systemImage: "message") }
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

struct AirbnbPlaceholderView: View {
    let title: String
    let systemImage: String
    let message: String

    var body: some View {
        NavigationStack {
            SwaplEmptyState(systemImage: systemImage, title: title, description: message)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .navigationTitle(title)
                .background(SwaplSemanticLight.background)
        }
    }
}
