import SwiftUI
import SwaplDesignTokens

@main
struct SwaplApp: App {
    @State private var auth = AuthService()
    @State private var pushService = PushService()

    init() {
        SwaplFonts.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .environment(pushService)
                .tint(AirbnbPalette.accent)
        }
    }
}

struct RootView: View {
    @Environment(AuthService.self) private var auth

    var body: some View {
        Group {
            if auth.isBootstrapping {
                LaunchLoadingView()
            } else if auth.session == nil {
                LoginView()
            } else {
                MainTabView()
            }
        }
        .task { await auth.bootstrap() }
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
                    AirbnbPlaceholderView(title: "Wishlists", systemImage: "heart", message: "Saved homes will appear here.")
                case .trips:
                    AirbnbPlaceholderView(title: "Trips", systemImage: "a.circle", message: "Accepted swaps will become trips.")
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
                AirbnbPlaceholderView(title: "Wishlists", systemImage: "heart", message: "Saved homes will appear here.")
                    .tabItem { Label("Wishlists", systemImage: "heart") }
                AirbnbPlaceholderView(title: "Trips", systemImage: "a.circle", message: "Accepted swaps will become trips.")
                    .tabItem { Label("Trips", systemImage: "a.circle") }
                SwapsInboxView()
                    .tabItem { Label("Messages", systemImage: "message") }
                AccountView()
                    .tabItem { Label("Profile", systemImage: "person.crop.circle") }
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
        case .trips: "a.circle"
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
                        .foregroundStyle(selection == section ? AirbnbPalette.accent : AirbnbPalette.text)
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
            ContentUnavailableView {
                Label(title, systemImage: systemImage)
            } description: {
                Text(message)
            }
            .navigationTitle(title)
            .background(Color(.systemBackground))
        }
    }
}
