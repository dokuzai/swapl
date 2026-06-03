import SwiftUI
import Observation
import SwaplDesignTokens

@Observable
final class PublicProfileViewModel {
    let userId: String
    var profile: PublicProfile?
    var error: String?
    init(userId: String) { self.userId = userId }
    func load() async {
        do { profile = try await ProfileRepository.shared.publicProfile(id: userId) }
        catch { self.error = error.localizedDescription }
    }
}

struct PublicProfileView: View {
    @State private var vm: PublicProfileViewModel
    @State private var showReport = false

    init(userId: String) { _vm = State(initialValue: PublicProfileViewModel(userId: userId)) }

    var body: some View {
        ScrollView {
            if let p = vm.profile {
                VStack(alignment: .leading, spacing: SwaplSpacing.s5) {
                    header(p.user)
                    interestsBlock(p.user.interests)
                    listingsBlock(p.listings)
                    reportLink
                }
                .padding(SwaplSpacing.s4)
            } else {
                ProgressView().padding(40)
            }
        }
        .background(SwaplSemanticLight.background)
        .task { await vm.load() }
        .sheet(isPresented: $showReport) {
            if let p = vm.profile {
                ReportSheet(targetUserId: p.user.id, listingId: nil)
            }
        }
    }

    @ViewBuilder
    private func header(_ u: PublicProfile.User) -> some View {
        VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
            KickerLabel(text: "Member since \(u.memberSince.prefix(7))")
            Text(u.name ?? "Anonymous host")
                .font(.swaplDisplay(32))
                .foregroundStyle(SwaplSemanticLight.foreground)
            if u.verified { TagChip(label: "ID verified") }
            if let vibe = u.bioVibe, !vibe.isEmpty {
                Text("\u{201C}\(vibe)\u{201D}")
                    .font(.swaplDisplay(18))
                    .italic()
                    .foregroundStyle(SwaplColor.pink)
            }
            if let bio = u.bio, !bio.isEmpty {
                Text(bio).font(.swaplBody(15))
            }
        }
    }

    @ViewBuilder
    private func interestsBlock(_ slugs: [String]) -> some View {
        if !slugs.isEmpty {
            VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
                KickerLabel(text: "Interests")
                FlowLayout(items: slugs)
            }
        }
    }

    @ViewBuilder
    private func listingsBlock(_ ls: [Listing]) -> some View {
        if !ls.isEmpty {
            VStack(alignment: .leading, spacing: SwaplSpacing.s3) {
                KickerLabel(text: "Their homes")
                ForEach(ls) { l in
                    NavigationLink {
                        ListingDetailView(listingId: l.id)
                    } label: {
                        SurfaceCard {
                            VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
                                CityIllust(palette: SwaplCityPalettes.forName(l.palette))
                                Text("\(l.neighbourhood) · \(l.city)")
                                    .font(.swaplDisplay(18))
                                Text("\(l.sizeSqm) m² · sleeps \(l.sleeps)")
                                    .font(.swaplMono(11))
                                    .foregroundStyle(SwaplSemanticLight.mutedForeground)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var reportLink: some View {
        Button(action: { showReport = true }) {
            Text("Report this user")
                .font(.swaplBody(13))
                .foregroundStyle(SwaplSemanticLight.destructive)
        }
    }
}
