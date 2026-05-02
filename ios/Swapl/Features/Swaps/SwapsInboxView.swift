import SwiftUI
import Observation
import SwaplDesignTokens

@Observable
final class SwapsInboxViewModel {
    var inbox: InboxResponse?
    var error: String?
    func load() async {
        do { inbox = try await ProposalRepository.shared.inbox() }
        catch { self.error = error.localizedDescription }
    }
}

struct SwapsInboxView: View {
    @State private var vm = SwapsInboxViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SwaplSpacing.s5) {
                    if let inbox = vm.inbox {
                        bucket("Waiting on you", items: inbox.buckets.waitingOnYou)
                        bucket("Sent — awaiting reply", items: inbox.buckets.sent)
                        bucket("Active swaps", items: inbox.buckets.active, accent: true)
                        if !inbox.buckets.archived.isEmpty {
                            bucket("Archived", items: inbox.buckets.archived, muted: true)
                        }
                    } else {
                        ProgressView().padding(40)
                    }
                }
                .padding(SwaplSpacing.s4)
            }
            .background(SwaplSemanticLight.background)
            .navigationTitle("Swap inbox")
            .task { await vm.load() }
            .refreshable { await vm.load() }
        }
        .swaplTheme()
    }

    @ViewBuilder
    private func bucket(_ title: String, items: [ProposalSummary], accent: Bool = false, muted: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: SwaplSpacing.s3) {
            Text(title).font(.swaplDisplay(20))
            if items.isEmpty {
                SurfaceCard { Text("Nothing here yet.").font(.swaplBody(14)).foregroundStyle(SwaplSemanticLight.mutedForeground) }
            } else {
                ForEach(items) { p in
                    SurfaceCard {
                        HStack {
                            VStack(alignment: .leading) {
                                Text("\(p.myCity) ⇄ \(p.theirCity)")
                                    .font(.swaplDisplay(16))
                                Text(p.otherName.map { "with \($0)" } ?? "")
                                    .font(.swaplMono(11))
                                    .foregroundStyle(SwaplSemanticLight.mutedForeground)
                            }
                            Spacer()
                            TagChip(label: p.status)
                        }
                    }
                    .opacity(muted ? 0.7 : 1)
                }
            }
        }
    }
}
