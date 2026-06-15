import SwiftUI
import SafariServices
import SwaplDesignTokens

// DOK-156 — "Verified on TON" proof-of-cover badge.
//
// When a swap's insurance certificate has been anchored on-chain, we show a
// discreet, reassuring badge inside the insurance section of the trip cockpit.
// What's anchored is only the HASH of the policy certificate plus minimal,
// non-personal metadata — a tamper-proof proof of cover, NOT a crypto wallet,
// payment, token, or anything of value. Swapl never charges; the value here is
// peace of mind, not money.
//
// The badge is shown ONLY when the policy is genuinely anchored
// (`isAnchored`). If the service-side TON env is unset the policy stays purely
// off-chain, `onChainRef` is nil, and nothing blockchain-related renders — no
// badge, no anxious "pending" state, no error. Pure graceful no-op.
struct ProofOfCoverBadge: View {
    let insurance: TripInsurance

    @State private var safariItem: SafariItem?

    var body: some View {
        // Defensive: callers gate on this too, but never render for an
        // un-anchored policy.
        if insurance.isAnchored {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Label("Verified on TON", systemImage: "lock.shield.fill")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(AirbnbPalette.softBackground, in: Capsule())

                    Spacer(minLength: 0)
                }

                Text("A tamper-proof record that your cover is real — not crypto, no payment, nothing for you to do.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)

                if let url = explorerURL {
                    Button {
                        safariItem = SafariItem(url: url)
                    } label: {
                        HStack(spacing: 4) {
                            Text("View proof")
                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 9, weight: .semibold))
                        }
                        .font(.swaplBody(SwaplDesignSystem.FontSize.tiny, weight: .medium))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("View proof of cover on the TON explorer")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .sheet(item: $safariItem) { item in
                SafariView(url: item.url)
            }
        }
    }

    // Prefer the server-provided explorerUrl from the DTO. As a safety net we
    // never link if it's missing or malformed — a dead Safari sheet is worse
    // than no link.
    private var explorerURL: URL? {
        guard let raw = insurance.explorerUrl,
              !raw.isEmpty,
              let url = URL(string: raw),
              url.scheme == "https"
        else { return nil }
        return url
    }
}
