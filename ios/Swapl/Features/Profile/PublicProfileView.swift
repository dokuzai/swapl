import SwiftUI
import Observation
import SwaplDesignTokens

@MainActor
@Observable
final class PublicProfileViewModel {
    let userId: String
    var profile: PublicProfile?
    var error: String?
    init(userId: String) { self.userId = userId }
    func load() async {
        error = nil
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
            } else if let error = vm.error {
                SwaplEmptyState(
                    systemImage: "person.crop.circle.badge.exclamationmark",
                    title: "Profile unavailable",
                    description: error,
                    actionTitle: "Try Again",
                    action: { Task { await vm.load() } }
                )
                .frame(maxWidth: .infinity)
                .padding(.top, 80)
            } else {
                // Fill the full width/height immediately so the view isn't a
                // narrow strip on a white background during the push animation.
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 400)
                    .accessibilityLabel("Loading profile")
            }
        }
        .frame(maxWidth: .infinity)
        .background(SwaplSemanticLight.background.ignoresSafeArea())
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
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
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h1))
                .foregroundStyle(SwaplSemanticLight.foreground)
            if u.verified { TagChip(label: "ID verified") }
            if let vibe = u.bioVibe, !vibe.isEmpty {
                Text("\u{201C}\(vibe)\u{201D}")
                    .font(.swaplDisplay(18))
                    .italic()
                    .foregroundStyle(SwaplColor.pink)
            }
            if let bio = u.bio, !bio.isEmpty {
                Text(bio).font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
            }
        }
    }

    @ViewBuilder
    private func interestsBlock(_ slugs: [String]) -> some View {
        if !slugs.isEmpty {
            VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
                KickerLabel(text: "Interests")
                let columns = [GridItem(.adaptive(minimum: 90), spacing: SwaplSpacing.s2)]
                LazyVGrid(columns: columns, alignment: .leading, spacing: SwaplSpacing.s2) {
                    ForEach(slugs, id: \.self) { TagChip(label: $0) }
                }
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
                                // Photo-first cover: the listing's own photos win;
                                // the city illustration is only the no-photo fallback
                                // inside ListingPhotoView (same priority as web).
                                ListingPhotoView(listing: l, cornerRadius: SwaplDesignSystem.CornerRadius.medium)
                                    .aspectRatio(200.0 / 140.0, contentMode: .fit)
                                Text("\(l.neighbourhood) · \(l.city)")
                                    .font(.swaplDisplay(18))
                                Text("\(l.sizeSqm) m² · sleeps \(l.sleeps)")
                                    .font(.swaplMono(SwaplDesignSystem.FontSize.tiny))
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
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(SwaplSemanticLight.destructive)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
