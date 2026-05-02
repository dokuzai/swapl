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
                .tint(SwaplSemanticLight.primary)
        }
    }
}

struct RootView: View {
    @Environment(AuthService.self) private var auth

    var body: some View {
        Group {
            if auth.session == nil {
                LoginView()
            } else {
                MainTabView()
            }
        }
        .task { await auth.bootstrap() }
    }
}

// On iPhone: a TabView with Browse / Swaps / Account.
// On iPad regular: NavigationSplitView with the same destinations as the
// sidebar; SwiftUI's adaptive sizing class promotes it automatically.
struct MainTabView: View {
    @Environment(\.horizontalSizeClass) private var size

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
            TabView {
                BrowseListView()
                    .tabItem { Label("Browse", systemImage: "house") }
                SwapsInboxView()
                    .tabItem { Label("Swaps", systemImage: "arrow.left.arrow.right") }
                AccountView()
                    .tabItem { Label("Account", systemImage: "person") }
            }
        }
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
