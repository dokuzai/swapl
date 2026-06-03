import SwiftUI
import SwaplDesignTokens

@main
struct SwaplApp: App {
    @State private var auth = AuthService()
    @State private var pushService = PushService()
    @State private var router = AppRouter()

    init() {
        SwaplFonts.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .environment(pushService)
                .environment(router)
                .tint(SwaplSemanticLight.primary)
                .onOpenURL { router.handle(url: $0) }
        }
    }
}

// Holds the next navigation request from a push tap or universal link.
@Observable
final class AppRouter {
    enum Destination: Hashable {
        case listing(String)
        case swapThread(String)
    }
    var pendingDestination: Destination?
    var selectedTab: HomeTab = .browse

    enum HomeTab: Hashable { case browse, swaps, account }

    // Parses both swapl://swaps/<id> and https://swapl.app/swaps/<id> URLs.
    func handle(url: URL) {
        let path = url.path
        let host = url.host ?? ""
        let firstSegment = host.isEmpty ? path.split(separator: "/").first.map(String.init) ?? "" : host
        let segments = path.split(separator: "/").map(String.init)
        let head = host.isEmpty ? segments.first ?? "" : host
        let id = host.isEmpty ? segments.dropFirst().first : segments.first

        switch head {
        case "swaps":
            if let id { pendingDestination = .swapThread(id); selectedTab = .swaps }
        case "listings":
            if let id { pendingDestination = .listing(id); selectedTab = .browse }
        default:
            _ = firstSegment  // unused; placeholder for future deep links
        }
    }

    func consume() -> Destination? {
        let dest = pendingDestination
        pendingDestination = nil
        return dest
    }
}

struct RootView: View {
    @Environment(AuthService.self) private var auth
    @Environment(PushService.self) private var push
    @Environment(AppRouter.self) private var router

    var body: some View {
        Group {
            if auth.session == nil {
                LoginView()
            } else {
                MainTabView()
            }
        }
        .task { await auth.bootstrap() }
        // Forward incoming push deep-links into the router.
        .onChange(of: push.pendingDeepLink) { _, url in
            if let url {
                router.handle(url: url)
                push.pendingDeepLink = nil
            }
        }
    }
}

// On iPhone: a TabView with Browse / Swaps / Account.
// On iPad regular: NavigationSplitView with the same destinations as the
// sidebar; SwiftUI's adaptive sizing class promotes it automatically.
struct MainTabView: View {
    @Environment(\.horizontalSizeClass) private var size
    @Environment(AppRouter.self) private var router

    var body: some View {
        if size == .regular {
            NavigationSplitView {
                SidebarView()
            } content: {
                BrowseListView()
            } detail: {
                Text("Pick a listing")
                    .foregroundStyle(SwaplSemanticLight.mutedForeground)
            }
        } else {
            TabView(selection: tabBinding) {
                BrowseListView()
                    .tabItem { Label("Browse", systemImage: "house") }
                    .tag(AppRouter.HomeTab.browse)
                SwapsInboxView()
                    .tabItem { Label("Swaps", systemImage: "arrow.left.arrow.right") }
                    .tag(AppRouter.HomeTab.swaps)
                AccountView()
                    .tabItem { Label("Account", systemImage: "person") }
                    .tag(AppRouter.HomeTab.account)
            }
        }
    }

    private var tabBinding: Binding<AppRouter.HomeTab> {
        Binding(
            get: { router.selectedTab },
            set: { router.selectedTab = $0 }
        )
    }
}

struct SidebarView: View {
    var body: some View {
        List {
            NavigationLink("Browse") { BrowseListView() }
            NavigationLink("Swaps") { SwapsInboxView() }
            NavigationLink("Account") { AccountView() }
        }
        .navigationTitle("swapl")
    }
}
