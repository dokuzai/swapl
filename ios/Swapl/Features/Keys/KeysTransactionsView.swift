import SwiftUI
import SwaplDesignTokens

// Filterable Keys ledger (DOK-157). Reached from the wallet's History section.
// A segmented control partitions the transactions (All / Earned / Spent), each
// row shows its kind icon, signed delta, the running balance after, and date.
// "Travel points" copy throughout — points are never money.
struct KeysTransactionsView: View {
    let transactions: [KeysTransaction]
    @State private var filter: KeysTransactionCategory = .all

    private var filtered: [KeysTransaction] {
        transactions.filter { filter.matches($0) }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Picker("Filter points history", selection: $filter) {
                    ForEach(KeysTransactionCategory.allCases) { category in
                        Text(category.label).tag(category)
                    }
                }
                .pickerStyle(.segmented)

                if filtered.isEmpty {
                    emptyState
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(filtered.enumerated()), id: \.element.id) { index, tx in
                            row(tx)
                            if index < filtered.count - 1 {
                                Divider().padding(.leading, 60)
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
            .padding(.horizontal, 22)
            .padding(.top, 18)
            .padding(.bottom, 40)
        }
        .swaplScreenBackground()
        .navigationTitle("Points history")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var emptyState: some View {
        Text(filter == .all
            ? "No points activity yet."
            : "No \(filter.label.lowercased()) points yet.")
            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
            .foregroundStyle(AirbnbPalette.secondaryText)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
    }

    private func row(_ tx: KeysTransaction) -> some View {
        HStack(spacing: 14) {
            Image(systemName: tx.symbol)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .frame(width: 40, height: 40)
                .background(SwaplSemanticLight.accent, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(tx.displayLabel)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(SwaplDateText.medium(from: tx.createdAt))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(tx.delta >= 0 ? "+\(tx.delta)" : "\(tx.delta)")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                    .foregroundStyle(tx.delta >= 0 ? SwaplSemanticLight.primary : AirbnbPalette.text)
                Text("\(tx.balanceAfter) bal")
                    .font(.swaplMono(SwaplDesignSystem.FontSize.tiny))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }
}
