import SwiftUI
import SwaplDesignTokens

// "How your nightly Keys are calculated" (DOK-163). Owner-only, reached from a
// reassuring entry card on your own listing detail. The goal is trust: the
// member should feel the value is FAIR, understand the few factors behind it,
// and see plainly that it's BOUNDED — it can't lurch from one refresh to the
// next.
//
// Reads the persisted v2 valuation explanation straight from the listing DTO
// (no client-side math — the backend owns the number). Degrades gracefully when
// only a partial payload is present.

struct NightlyKeysExplainerSheet: View {
    @Environment(\.dismiss) private var dismiss

    let listing: Listing
    let explanation: ValuationExplanation

    // The headline number, preferring the explanation's own final value, then
    // the listing DTO, so the sheet always agrees with the card that opened it.
    private var nightlyKeys: Int {
        explanation.nightlyKeys ?? listing.nightlyKeys ?? 0
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    headlineCard
                    factorsSection
                    if let ai = explanation.ai {
                        aiSection(ai)
                    }
                    if let feedback = explanation.feedback {
                        feedbackSection(feedback)
                    }
                    if listing.isPrivateRoom {
                        roomCoefficientSection
                    }
                    boundedReassurance
                }
                .padding(.horizontal, 22)
                .padding(.top, 18)
                .padding(.bottom, 40)
            }
            .background(SwaplSemanticLight.background.ignoresSafeArea())
            .navigationTitle("How it's calculated")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    // MARK: - Headline

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
                Text("points / night")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground.opacity(0.85))
            }
            Text("This is what a guest spends — and what you earn — for each night they stay. We set it for you from your home's details, so it stays fair across every home on Swapl.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(SwaplSemanticLight.primaryForeground.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplColor.navyDark, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous))
    }

    // MARK: - Factors

    // The breakdown rows, in Keys. Each factor is what the home itself
    // contributes — size, guests, location, verification, AI appeal — so the
    // owner can see the value is grounded in their listing, not a black box.
    private var factorsSection: some View {
        let factors = explanation.factors ?? []
        return VStack(alignment: .leading, spacing: 12) {
            Text("What goes into it")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            if factors.isEmpty {
                Text("We weigh your home's size, how many guests it sleeps, its location, and verified trust signals. Together they set a fair nightly value.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(18)
                    .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                            .stroke(AirbnbPalette.hairline)
                    }
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(factors.enumerated()), id: \.element.id) { index, factor in
                        factorRow(factor)
                        if index < factors.count - 1 {
                            Divider().padding(.leading, 50)
                        }
                    }
                    if let base = explanation.base {
                        Divider().padding(.leading, 18)
                        baseRow(base)
                    }
                }
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                }
            }
        }
    }

    private func factorRow(_ factor: ValuationExplanation.Factor) -> some View {
        HStack(spacing: 12) {
            Image(systemName: iconForFactor(factor.key))
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .frame(width: 26)
            Text(factor.label)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Spacer()
            Text(signedPoints(factor.points))
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(factor.points < 0 ? AirbnbPalette.secondaryText : AirbnbPalette.text)
                .monospacedDigit()
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }

    // The pre-feedback subtotal, so the factor rows visibly add up to a number
    // the owner can recognise before any review adjustment is applied.
    private func baseRow(_ base: Int) -> some View {
        HStack(spacing: 12) {
            Text("Base nightly value")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            Spacer()
            Text("\(base)")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
                .monospacedDigit()
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }

    // MARK: - AI appeal

    private func aiSection(_ ai: ValuationExplanation.AI) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .foregroundStyle(SwaplSemanticLight.primary)
                Text("Appeal read")
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
            }
            VStack(alignment: .leading, spacing: 8) {
                if let summary = ai.summary, !summary.isEmpty {
                    Text(summary)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 8) {
                    Text(ai.bonus >= 0 ? "Adds \(trimmed(ai.bonus)) points for standout appeal" : "\(trimmed(ai.bonus)) points")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                    Spacer()
                    Text(ai.source == "ai" ? "Read by Swapl AI" : "Standard estimate")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.tiny, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(SwaplSemanticLight.muted, in: Capsule())
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        }
    }

    // MARK: - Review feedback (the bounded adjustment)

    private func feedbackSection(_ feedback: ValuationExplanation.Feedback) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Guest reviews")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    Image(systemName: "star.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                        .frame(width: 26)
                    VStack(alignment: .leading, spacing: 2) {
                        if let avg = feedback.avgRating {
                            Text(String(format: "%.1f average over %d review%@", avg, feedback.reviewCount, feedback.reviewCount == 1 ? "" : "s"))
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                        } else {
                            Text("No reviews yet")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                        }
                        Text(adjustmentCaption(feedback))
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    if let adjustment = explanation.adjustment, feedback.applied, adjustment != 0 {
                        Text(signedPercent(adjustment))
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                            .foregroundStyle(adjustment < 0 ? AirbnbPalette.secondaryText : SwaplSemanticLight.primary)
                            .monospacedDigit()
                    }
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
    }

    private func adjustmentCaption(_ feedback: ValuationExplanation.Feedback) -> String {
        guard feedback.applied, let adjustment = explanation.adjustment, adjustment != 0 else {
            return "Great reviews can nudge your value up a little — never more than 20%."
        }
        return adjustment > 0
            ? "Strong reviews lifted your nightly value. This nudge is capped at +20%, so it can't run away."
            : "Your nightly value was eased down slightly. This nudge is capped at 20% either way."
    }

    // MARK: - Private room coefficient (DOK-163 C)

    // Shown only when this listing is a single private room. Makes the rooms
    // coefficient explicit so a host renting one room understands transparently
    // why the value sits below a whole-home rate.
    private var roomCoefficientSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("It's a private room")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            HStack(spacing: 12) {
                Image(systemName: "bed.double")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .frame(width: 44, height: 44)
                    .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.small, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(roomCoefficientTitle)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text("A guest gets one room rather than your whole home, so the nightly value is scaled to match. That keeps it fair next to whole-home stays.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
    }

    private var roomCoefficientTitle: String {
        if let coeff = explanation.roomsCoefficient, coeff > 0 {
            return "Room rate — \(Int((coeff * 100).rounded()))% of a whole-home value"
        }
        return "Room rate applied"
    }

    // MARK: - Bounded reassurance

    // The closing promise: the value is stable. This is the trust beat — the
    // owner leaves knowing it won't swing wildly between refreshes.
    private var boundedReassurance: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "lock.shield")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
            VStack(alignment: .leading, spacing: 4) {
                Text("Steady by design")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                Text("Your nightly value only moves within set limits, and reviews can shift it by at most 20%. It updates quietly in the background — never a sudden jump.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
    }

    // MARK: - Helpers

    private func iconForFactor(_ key: String) -> String {
        switch key {
        case "base": return "house"
        case "size": return "ruler"
        case "sleeps": return "person.2"
        case "location_tier": return "mappin.and.ellipse"
        case "verified": return "checkmark.seal"
        case "ai_appeal": return "sparkles"
        default: return "circle.grid.2x2"
        }
    }

    // Whole-point factors read cleanest as integers; keep a decimal only when one
    // is actually present so "+3" doesn't become "+3.0".
    private func signedPoints(_ value: Double) -> String {
        let text = trimmed(abs(value))
        if value > 0 { return "+\(text)" }
        if value < 0 { return "−\(text)" }
        return text
    }

    private func trimmed(_ value: Double) -> String {
        if value.rounded() == value {
            return String(Int(value.rounded()))
        }
        return String(format: "%.1f", value)
    }

    private func signedPercent(_ adjustment: Double) -> String {
        let pct = Int((abs(adjustment) * 100).rounded())
        return adjustment > 0 ? "+\(pct)%" : "−\(pct)%"
    }
}
