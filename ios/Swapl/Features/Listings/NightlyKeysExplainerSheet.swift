import SwiftUI
import SwaplDesignTokens

// "How your nightly Keys are calculated" (DOK-219). Owner-only, reached from a
// reassuring entry card on your own listing detail. The value is now simply the
// home's guest capacity — one transparent number — so this sheet just explains
// the capacity-nights rule. Reads the listing DTO; no client-side math.

struct NightlyKeysExplainerSheet: View {
    @Environment(\.dismiss) private var dismiss

    let listing: Listing
    let explanation: ValuationExplanation

    // The headline number is the home's capacity. Prefer the explanation's final
    // value, then the DTO's nightlyKeys, then the raw capacity (sleeps).
    private var nightlyKeys: Int {
        explanation.nightlyKeys ?? listing.nightlyKeys ?? listing.sleeps
    }
    private var capacity: Int { listing.sleeps }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    headlineCard
                    howItWorksCard
                    exampleCard
                }
                .padding(.horizontal, 22)
                .padding(.top, 18)
                .padding(.bottom, 40)
            }
            .swaplScreenBackground()
            .navigationTitle("How it's calculated")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var headlineCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "key.horizontal.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
                Text("Your nightly value")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground.opacity(0.85))
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text("\(nightlyKeys)")
                    .font(.swaplDisplay(52, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
                Text("Keys / night")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground.opacity(0.85))
            }
            Text("Your home's value is simply how many people it can host. It sleeps \(capacity), so it's worth \(capacity) Keys per night — the same rule for every home on Swapl.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(SwaplSemanticLight.primaryForeground.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplColor.navyDark, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous))
    }

    private var howItWorksCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("How it works")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            ruleRow(icon: "arrow.down.circle.fill", title: String(localized: "Hosting earns"),
                    detail: String(localized: "You earn your home's value for every night you host — \(capacity) Keys a night."))
            ruleRow(icon: "arrow.up.circle.fill", title: String(localized: "Staying costs"),
                    detail: String(localized: "A stay costs that home's value per night — bigger homes cost more, smaller ones less."))
            ruleRow(icon: "person.2.fill", title: String(localized: "Keys are person-nights"),
                    detail: String(localized: "\(capacity) Keys buys \(capacity) person-nights: \(capacity) nights for one guest, or one night for \(capacity)."))
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }

    private var exampleCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("In one line")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            Text("Host \(capacity) guests for 1 night → earn \(capacity) Keys → stay \(capacity) nights somewhere that sleeps one.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.accent.opacity(0.4), in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
    }

    private func ruleRow(icon: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(detail)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}
