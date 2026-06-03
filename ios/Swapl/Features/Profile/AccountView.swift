import SwiftUI
import Observation
import SwaplDesignTokens

@Observable
final class AccountOverviewViewModel {
    var me: MeResponse?
    var error: String?
    func load() async {
        do { me = try await MeRepository.shared.me() }
        catch { self.error = error.localizedDescription }
    }
}

struct AccountView: View {
    @Environment(AuthService.self) private var auth
    @State private var overview = AccountOverviewViewModel()

    var body: some View {
        NavigationStack {
            List {
                if let s = auth.session {
                    Section {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(s.name ?? s.email)
                                .font(.swaplDisplay(22))
                            Text(s.email)
                                .font(.swaplBody(13))
                                .foregroundStyle(SwaplSemanticLight.mutedForeground)
                        }
                    }
                }
                if let me = overview.me {
                    Section("Overview") {
                        StatRow(label: "Waiting on you", value: me.counts.incomingProposals)
                        StatRow(label: "Sent — awaiting reply", value: me.counts.outgoingProposals)
                        StatRow(label: "Active swaps", value: me.counts.activeSwaps, accent: true)
                        StatRow(label: "Your listings", value: me.counts.listings)
                    }
                    if let sub = me.subscription {
                        Section("Plan") {
                            HStack {
                                Text(sub.planId.capitalized).font(.swaplDisplay(17))
                                Spacer()
                                TagChip(label: sub.status)
                            }
                        }
                    }
                }
                Section("Profile") {
                    NavigationLink("Interests") { InterestsEditorView() }
                    NavigationLink("Public profile") {
                        if let id = auth.session?.id { PublicProfileView(userId: id) }
                    }
                    NavigationLink("Saved searches") { SavedSearchesView() }
                }
                Section {
                    Button("Sign out", role: .destructive) {
                        Task { await auth.signOut() }
                    }
                }
            }
            .navigationTitle("Account")
            .task { await overview.load() }
            .refreshable { await overview.load() }
        }
        .swaplTheme()
    }
}

private struct StatRow: View {
    let label: String
    let value: Int
    var accent: Bool = false
    var body: some View {
        HStack {
            Text(label).font(.swaplBody(15))
            Spacer()
            Text("\(value)")
                .font(.swaplDisplay(20))
                .foregroundStyle(accent ? SwaplColor.pink : SwaplSemanticLight.foreground)
        }
    }
}
