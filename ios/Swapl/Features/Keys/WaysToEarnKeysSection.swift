import SwiftUI
import SwaplDesignTokens

// "Ways to earn Keys" (DOK-164). A wallet section that lists the server-owned
// catalogue of actions that mint Keys — verify identity, verify a property,
// complete a listing, leave a review, share a home that gets booked, invite a
// friend — each with its founder-set amount and, when the server exposes it, a
// done / to-do state. Encouraging, never spammy: repeatable earns stay open,
// one-time earns flip to a quiet "Earned" check, and identity-gated rows are
// greyed with a small lock until the member is verified.
//
// The data is server-owned (EarnWaysPayload); this view only renders it. The
// "Verify your identity" row, when not yet done, dismisses the wallet so the
// member lands back on Account where the verification banner lives.
struct WaysToEarnKeysSection: View {
    let payload: EarnWaysPayload
    // Tapped on the (not-yet-verified) identity row — sends the member to where
    // identity verification lives. Other rows are informational.
    var onVerifyIdentity: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Ways to earn Keys")
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text("Small actions, real points. Every Key is a step toward your next stay.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !payload.identityVerified {
                verifyGateHint
            }

            VStack(spacing: 0) {
                ForEach(Array(payload.ways.enumerated()), id: \.element.id) { index, way in
                    row(way)
                    if index < payload.ways.count - 1 {
                        Divider().padding(.leading, 70)
                    }
                }
            }
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
    }

    // A gentle nudge above the list when identity isn't verified yet: most rows
    // are locked, and verifying both unlocks them and pays the +N bonus.
    private var verifyGateHint: some View {
        HStack(spacing: 10) {
            Image(systemName: "lock.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
            Text("Verify your identity to unlock every way to earn.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .medium))
                .foregroundStyle(AirbnbPalette.text)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
    }

    @ViewBuilder
    private func row(_ way: EarnWay) -> some View {
        let locked = way.isLocked(identityVerified: payload.identityVerified)
        // The not-yet-verified identity row is the one tappable CTA; everything
        // else is informational. A done one-time earn is also non-interactive.
        let isVerifyCTA = way.key == "verify_identity" && !way.done

        Button {
            if isVerifyCTA { onVerifyIdentity() }
        } label: {
            HStack(spacing: 14) {
                Image(systemName: way.symbol)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(locked ? AirbnbPalette.secondaryText : SwaplSemanticLight.primary)
                    .frame(width: 44, height: 44)
                    .background(
                        (locked ? AirbnbPalette.hairline.opacity(0.4) : SwaplSemanticLight.accent),
                        in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    )

                VStack(alignment: .leading, spacing: 3) {
                    Text(way.title)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                        .foregroundStyle(locked ? AirbnbPalette.secondaryText : AirbnbPalette.text)
                    Text(way.subtitle)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 8)

                trailing(way: way, locked: locked, isVerifyCTA: isVerifyCTA)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!isVerifyCTA)
    }

    @ViewBuilder
    private func trailing(way: EarnWay, locked: Bool, isVerifyCTA: Bool) -> some View {
        if locked {
            Image(systemName: "lock.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
        } else if way.done && !way.repeatable {
            // One-time earn already collected — quiet confirmation, no badge.
            Label("Earned", systemImage: "checkmark.circle.fill")
                .labelStyle(.titleAndIcon)
                .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
        } else {
            HStack(spacing: 6) {
                Text("+\(way.amount)")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(SwaplSemanticLight.accent, in: Capsule())
                if isVerifyCTA {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
            }
        }
    }
}
