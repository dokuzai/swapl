import SwiftUI
import Observation
import SwaplDesignTokens

// Keys wallet (DOK-155). Reached from Account → "Travel points". Shows the
// balance, the nightly-Keys value of the member's own homes, the ledger
// history, and a "Gift Keys" entry. Copy stays in "travel points" language —
// Keys are never money, never bought, never cashed out.

@MainActor
@Observable
final class KeysWalletViewModel {
    var wallet: KeysWallet?
    var error: String?
    var isLoading = false

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            wallet = try await KeysRepository.shared.wallet()
        } catch {
            if wallet == nil { self.error = error.localizedDescription }
        }
    }
}

struct KeysWalletView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var vm = KeysWalletViewModel()
    @State private var isGifting = false

    var body: some View {
        ScrollView {
            if let wallet = vm.wallet {
                content(wallet)
            } else if let error = vm.error {
                SwaplEmptyState(
                    systemImage: "key.horizontal",
                    title: "Points unavailable",
                    description: error,
                    actionTitle: "Try Again",
                    action: { Task { await vm.load() } }
                )
                .padding(.top, 80)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 400)
                    .accessibilityLabel("Loading travel points")
            }
        }
        .background(SwaplSemanticLight.background.ignoresSafeArea())
        .navigationTitle("Travel points")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isGifting, onDismiss: { Task { await vm.load() } }) {
            GiftKeysSheet()
        }
        .task { await vm.load() }
        .refreshable { await vm.load() }
    }

    // Zero balance: nothing to spend or gift. We surface the three ways to earn
    // instead of a dead balance, so the screen always has a next tap (PM
    // follow-up "balance zero": verify +30, host, gift). This fires whenever the
    // balance is 0 — including a member who earned then spent down to nothing,
    // not just a brand-new wallet — because gifting/spending 0 always fails
    // server-side ("Not enough Keys").
    private func isZeroBalance(_ wallet: KeysWallet) -> Bool {
        wallet.balance == 0
    }

    private func content(_ wallet: KeysWallet) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            balanceCard(wallet.balance)

            // First-touch explainer: the earn→spend loop made concrete with one
            // example, so "travel points" stops being abstract. Shown to everyone
            // (it's the hardest concept at first contact), using the member's own
            // home rate when we have it so the numbers feel real.
            flywheelCard(wallet)

            if isZeroBalance(wallet) {
                earnPathsCard
            } else {
                // Only an offer-to-gift when there's something to give.
                giftButton
            }

            if !wallet.nightlyKeysForMyListings.isEmpty {
                section("Your homes earn") {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("This is what you earn for each night a guest stays with you.")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                        ForEach(wallet.nightlyKeysForMyListings) { home in
                            nightlyRow(home)
                        }
                    }
                }
            }

            sectionWithLink(
                "History",
                trailing: wallet.recentTransactions.isEmpty ? nil : AnyView(
                    NavigationLink {
                        KeysTransactionsView(transactions: wallet.recentTransactions)
                    } label: {
                        Text("See all")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.primary)
                    }
                )
            ) {
                if wallet.recentTransactions.isEmpty {
                    Text("No points activity yet. Earn points by hosting, or gift some to a friend.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(18)
                        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(wallet.recentTransactions.enumerated()), id: \.element.id) { index, tx in
                            transactionRow(tx)
                            if index < wallet.recentTransactions.count - 1 {
                                Divider().padding(.leading, 18)
                            }
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
        .padding(.horizontal, 22)
        .padding(.top, 18)
        .padding(.bottom, 40)
    }

    private func balanceCard(_ balance: Int) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "key.horizontal.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
                Text("Your travel points")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground.opacity(0.85))
            }
            Text("\(balance)")
                .font(.swaplDisplay(56, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primaryForeground)
            Text("Like air miles for home swaps: earn them by hosting, spend them on a stay — no swapping back. Points are never money — you can't buy or cash them out.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(SwaplSemanticLight.primaryForeground.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplColor.navyDark, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous))
    }

    // "Earning & spending in action" — the single concrete example that closes
    // the loop between abstract "travel points" and a real stay. Uses the
    // member's own nightly rate when we have a home (so the math is theirs),
    // otherwise a neutral worked example. Three steps: host → earn → spend.
    private func flywheelCard(_ wallet: KeysWallet) -> some View {
        let rate = wallet.nightlyKeysForMyListings.first?.nightlyKeys ?? 8
        let earned = rate * 2

        return VStack(alignment: .leading, spacing: 14) {
            Text("How it works, in one example")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            VStack(spacing: 0) {
                flywheelStep(
                    icon: "house.fill",
                    title: "Host 2 nights",
                    detail: "at \(rate) points / night",
                    showConnector: true
                )
                flywheelStep(
                    icon: "key.horizontal.fill",
                    title: "Earn \(earned) points",
                    detail: "added to your balance",
                    showConnector: true
                )
                flywheelStep(
                    icon: "airplane.departure",
                    title: "Spend \(earned) points",
                    detail: "on 2 nights somewhere else",
                    showConnector: false
                )
            }

            Text("That's the whole loop — host to earn, then travel. No money ever changes hands.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
    }

    private func flywheelStep(icon: String, title: String, detail: String, showConnector: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 0) {
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .frame(width: 36, height: 36)
                    .background(SwaplSemanticLight.card, in: Circle())
                if showConnector {
                    Rectangle()
                        .fill(SwaplSemanticLight.primary.opacity(0.3))
                        .frame(width: 2, height: 18)
                }
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(detail)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(.top, 8)
            Spacer(minLength: 0)
        }
    }

    private var giftButton: some View {
        Button {
            isGifting = true
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "gift")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .frame(width: 48, height: 48)
                    .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text("Gift points")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text("Send points to a verified friend")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(16)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
        .buttonStyle(.plain)
    }

    // Three ways to earn, shown only when the wallet is empty. Verify is the
    // fastest (+30 points on identity verification); hosting and gifting are
    // the ongoing paths. Verify/host send the member back to Account where the
    // verification banner and host card live; gift opens the gift sheet inline.
    private var earnPathsCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Three ways to earn points")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            VStack(spacing: 10) {
                earnRow(
                    icon: "checkmark.seal.fill",
                    title: "Verify your identity",
                    subtitle: "Get 30 points the moment you're verified.",
                    badge: "+30",
                    action: { dismiss() }
                )
                earnRow(
                    icon: "house.fill",
                    title: "Host a stay",
                    subtitle: "Earn points every night a guest stays with you.",
                    badge: nil,
                    action: { dismiss() }
                )
                earnRow(
                    icon: "gift.fill",
                    title: "Receive a gift",
                    subtitle: "Share your member ID — a verified friend can send you points.",
                    badge: nil,
                    action: nil
                )
            }
        }
    }

    private func earnRow(
        icon: String,
        title: String,
        subtitle: String,
        badge: String?,
        action: (() -> Void)?
    ) -> some View {
        Button(action: { action?() }) {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primary)
                    .frame(width: 48, height: 48)
                    .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text(subtitle)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 8)
                if let badge {
                    Text(badge)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(SwaplSemanticLight.accent, in: Capsule())
                } else if action != nil {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
    }

    private func nightlyRow(_ home: KeysWallet.NightlyKeysListing) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "house")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .frame(width: 22)
            Text(home.title)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .lineLimit(1)
            Spacer()
            Text("\(home.nightlyKeys) / night")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }

    private func transactionRow(_ tx: KeysTransaction) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(tx.displayLabel)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(SwaplDateText.medium(from: tx.createdAt))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            Spacer()
            Text(tx.delta >= 0 ? "+\(tx.delta)" : "\(tx.delta)")
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                .foregroundStyle(tx.delta >= 0 ? SwaplSemanticLight.primary : AirbnbPalette.text)
        }
        .padding(18)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            content()
        }
    }

    // Section with an optional trailing accessory (e.g. a "See all" link).
    private func sectionWithLink<Content: View>(
        _ title: String,
        trailing: AnyView?,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Spacer()
                if let trailing { trailing }
            }
            content()
        }
    }
}

// MARK: - Gift sheet

struct GiftKeysSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var recipientId = ""
    @State private var amount = 5
    @State private var error: String?
    @State private var success: String?
    @State private var isSending = false

    // Matches GIFT_MAX_PER_TRANSFER / GIFT_DAILY_CAP in lib/keys/config.ts.
    private let maxPerTransfer = 50
    private let dailyCap = 100

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Member ID", text: $recipientId)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Recipient")
                } footer: {
                    Text("Ask your friend for their Swapl member ID. They must be a verified member.")
                }

                Section {
                    Stepper("\(amount) point\(amount == 1 ? "" : "s")", value: $amount, in: 1...maxPerTransfer)
                } header: {
                    Text("Amount")
                } footer: {
                    Text("Up to \(maxPerTransfer) per gift, \(dailyCap) per day. Points are a gift — they can't be bought or cashed out.")
                }

                if let error {
                    Section { Text(error).foregroundStyle(SwaplSemanticLight.destructive) }
                }
                if let success {
                    Section { Text(success).foregroundStyle(SwaplSemanticLight.primary) }
                }
            }
            .navigationTitle("Gift points")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSending ? "Sending" : "Send") {
                        Task { await send() }
                    }
                    .disabled(isSending || recipientId.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func send() async {
        isSending = true
        error = nil
        success = nil
        defer { isSending = false }
        do {
            let response = try await KeysRepository.shared.gift(
                toUserId: recipientId.trimmingCharacters(in: .whitespaces),
                amount: amount
            )
            success = "Sent \(response.amount) point\(response.amount == 1 ? "" : "s"). You now have \(response.balanceAfter)."
            recipientId = ""
        } catch APIClient.APIError.status(403, _) {
            error = "Both you and your friend need to be verified members to gift points."
        } catch APIClient.APIError.status(404, _) {
            error = "We couldn't find that member. Double-check the ID."
        } catch APIClient.APIError.status(422, let body) where (body ?? "").localizedCaseInsensitiveContains("enough") {
            error = "You don't have enough points for this gift."
        } catch let caught {
            error = caught.localizedDescription
        }
    }
}
