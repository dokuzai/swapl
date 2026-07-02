import SwiftUI
import SwaplDesignTokens

// "Leave a review" sheet (DOK-147) — shown from the swap thread / trip view
// when the server says canReview (agreement COMPLETED, no review from the
// caller yet). Stars 1-5 + free text (20-1000 chars, mirroring the API),
// POST /api/agreements/{id}/review.
struct LeaveReviewSheet: View {
    let agreementId: String
    let otherName: String?
    var onSubmitted: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var rating = 0
    @State private var text = ""
    @State private var isSubmitting = false
    @State private var error: String?

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var isValid: Bool { rating >= 1 && trimmed.count >= 20 && trimmed.count <= 1000 }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("How was your swap with \(otherName ?? "your swap partner")?")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)

                    VStack(alignment: .leading, spacing: 10) {
                        KickerLabel(text: "Your rating")
                        HStack(spacing: 8) {
                            ForEach(1...5, id: \.self) { n in
                                Button {
                                    rating = n
                                } label: {
                                    Image(systemName: n <= rating ? "star.fill" : "star")
                                        .font(.system(size: 32, weight: .semibold))
                                        .foregroundStyle(n <= rating ? SwaplColor.pink : SwaplColor.cream2)
                                        .frame(width: 44, height: 44)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("\(n) star\(n == 1 ? "" : "s")")
                                .accessibilityAddTraits(rating == n ? .isSelected : [])
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        KickerLabel(text: "Your review")
                        TextEditor(text: $text)
                            .font(.swaplBody(17))
                            .frame(minHeight: 140)
                            .padding(12)
                            .scrollContentBackground(.hidden)
                            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                            .overlay(alignment: .topLeading) {
                                if text.isEmpty {
                                    Text("How was the home, the neighbourhood, the handover?")
                                        .font(.swaplBody(17))
                                        .foregroundStyle(AirbnbPalette.secondaryText.opacity(0.75))
                                        .padding(.horizontal, 18)
                                        .padding(.vertical, 20)
                                        .allowsHitTesting(false)
                                }
                            }
                            .overlay {
                                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                                    .stroke(AirbnbPalette.hairline)
                            }
                        if !trimmed.isEmpty && trimmed.count < 20 {
                            Text("At least 20 characters — \(trimmed.count) so far.")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                                .foregroundStyle(AirbnbPalette.secondaryText)
                        }
                    }

                    if let error {
                        Text(error)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.destructive)
                    }

                    PrimaryPill(
                        title: "Submit review",
                        action: { Task { await submit() } },
                        isLoading: isSubmitting,
                        isDisabled: !isValid
                    )
                }
                .padding(.horizontal, 22)
                .padding(.top, 12)
                .padding(.bottom, 32)
            }
            .swaplScreenBackground()
            .navigationTitle("Leave a review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSubmitting)
                }
            }
        }
        .presentationDetents([.large, .medium])
    }

    private func submit() async {
        guard isValid, !isSubmitting else { return }
        isSubmitting = true
        error = nil
        defer { isSubmitting = false }
        do {
            try await ProposalRepository.shared.submitReview(
                agreementId: agreementId,
                rating: rating,
                text: trimmed
            )
            dismiss()
            onSubmitted()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
