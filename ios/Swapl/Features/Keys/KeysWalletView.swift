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

    private func content(_ wallet: KeysWallet) -> some View {
        VStack(alignment: .leading, spacing: 24) {
            balanceCard(wallet.balance)
            giftButton

            if !wallet.nightlyKeysForMyListings.isEmpty {
                section("Your homes earn") {
                    VStack(spacing: 10) {
                        ForEach(wallet.nightlyKeysForMyListings) { home in
                            nightlyRow(home)
                        }
                    }
                }
            }

            section("History") {
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
            Text("Spend them on a stay without a simultaneous swap. Points are not money — you can't buy or cash them out.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(SwaplSemanticLight.primaryForeground.opacity(0.85))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplColor.navyDark, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous))
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
