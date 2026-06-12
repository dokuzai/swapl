import SwiftUI
import SwaplDesignTokens

// "Payment & reservation" step of the Inspire confirm flow (DOK-148).
//
// Shown ONLY when POST …/checkout answered { paymentRequired: true }. NO
// native Stripe SDK: "Save card" opens the web payment page (Stripe Payment
// Element on /inspire?package={id}&step=pay) in an in-app Safari sheet. The
// SetupIntent there only SAVES the card — the off-session charge is created
// when (and only when) the host accepts the proposal.
//
// The confirm itself never blocks on payment: closing the Safari sheet (with
// or without a saved card) continues to phase 2, and the server recovers the
// saved payment method if the webhook hasn't landed yet.
struct PaymentStepView: View {
    let checkout: AssistantRepository.CheckoutResponse
    let paymentURL: URL?
    /// Called when the user is done with this step — true when the web
    /// payment page was opened, false when they chose to skip the card.
    let onDone: (Bool) -> Void
    let onBack: () -> Void

    @State private var isShowingWebPayment = false
    @State private var openedWebPayment = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    header
                    summaryCard
                    chargeNote
                    affiliateNote
                    buttons
                }
                .padding(22)
            }
            .background(SwaplSemanticLight.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Back to package") { onBack() }
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .tint(AirbnbPalette.text)
                }
            }
            // The web page handles the Stripe Payment Element; when the user
            // closes the sheet we resume the confirm flow regardless — the
            // server recovers the saved card if there is one.
            .sheet(isPresented: $isShowingWebPayment, onDismiss: { onDone(openedWebPayment) }) {
                if let paymentURL {
                    SafariView(url: paymentURL)
                        .ignoresSafeArea()
                }
            }
        }
        .interactiveDismissDisabled()
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Almost there")
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .textCase(.uppercase)
            Text("Payment & reservation")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
        }
    }

    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Your selection")
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .textCase(.uppercase)
            ForEach(checkout.summary.payableItems) { item in
                HStack(alignment: .firstTextBaseline) {
                    Text(item.name)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.text)
                    Spacer()
                    Text(PackageViewModel.money(item.priceCents, currency: checkout.summary.currency))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                }
            }
            Divider()
            HStack(alignment: .firstTextBaseline) {
                Text("Payable if the host accepts")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Spacer()
                Text(PackageViewModel.money(checkout.summary.totalCents, currency: checkout.summary.currency))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
            }
        }
        .padding(16)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        )
    }

    private var chargeNote: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "lock.shield")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .padding(.top, 1)
            Text(checkout.note ?? "You'll only be charged if the host accepts your swap.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.text)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AirbnbPalette.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
    }

    private var affiliateNote: some View {
        Text("Partner experiences and services are booked on the partners' sites — never charged by swapl and not part of this total.")
            .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
            .foregroundStyle(AirbnbPalette.secondaryText)
    }

    private var buttons: some View {
        VStack(spacing: 12) {
            PrimaryPill(
                title: "Save card & send proposal",
                action: {
                    openedWebPayment = true
                    isShowingWebPayment = true
                },
                isDisabled: paymentURL == nil
            )
            // The card is optional by design: the proposal can go out with
            // nothing saved — then nothing can ever be charged.
            Button {
                onDone(false)
            } label: {
                Text("Send without saving a card")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
        }
        .padding(.top, 6)
    }
}
