import SwiftUI
import StoreKit
import SwaplDesignTokens

// "Valuta l'app" (F2 / M1). A 1–5 rating with an optional comment that POSTs to
// the shared /api/app-feedback endpoint with source:"ios". For a positive score
// (>= 4) we additionally surface the system StoreKit review prompt — Apple
// throttles it, so it may not appear, which is by design.
struct RateAppSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.requestReview) private var requestReview

    @State private var score = 0
    @State private var comment = ""
    @State private var isSubmitting = false
    @State private var didSubmit = false
    @State private var error: String?

    private let emojis = ["😞", "😕", "😐", "🙂", "😍"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if didSubmit {
                        thankYou
                    } else {
                        prompt
                    }
                }
                .padding(22)
            }
            .background(SwaplSemanticLight.background)
            .navigationTitle(String(localized: "Rate Swapl"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "Close")) { dismiss() }
                }
            }
        }
    }

    private var prompt: some View {
        VStack(alignment: .leading, spacing: 22) {
            VStack(alignment: .leading, spacing: 8) {
                Text(String(localized: "How is Swapl going for you?"))
                    .font(.swaplDisplay(26, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(String(localized: "Your feedback helps us improve the app. It only takes a moment."))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 10) {
                ForEach(1...5, id: \.self) { value in
                    Button {
                        withAnimation(.snappy) { score = value }
                    } label: {
                        Text(emojis[value - 1])
                            .font(.system(size: 34))
                            .frame(maxWidth: .infinity)
                            .frame(height: 58)
                            .background(
                                score == value ? SwaplSemanticLight.accent : SwaplSemanticLight.card,
                                in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                            )
                            .overlay {
                                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                                    .stroke(score == value ? SwaplSemanticLight.primary : AirbnbPalette.hairline,
                                            lineWidth: score == value ? 2 : 1)
                            }
                            .opacity(score == 0 || score == value ? 1 : 0.5)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text(String(localized: "\(value) out of 5")))
                }
            }

            VStack(alignment: .leading, spacing: 9) {
                Text(String(localized: "Anything you'd like to add? (optional)"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                TextField(String(localized: "What's working, what isn't…"), text: $comment, axis: .vertical)
                    .font(.swaplBody(17))
                    .lineLimit(3...6)
                    .padding(14)
                    .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                            .stroke(AirbnbPalette.hairline)
                    }
            }

            if let error {
                Text(error)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.destructive)
            }

            Button {
                Task { await submit() }
            } label: {
                HStack {
                    if isSubmitting { ProgressView().tint(SwaplSemanticLight.primaryForeground) }
                    Text(String(localized: "Send feedback"))
                }
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(SwaplSemanticLight.primary, in: Capsule())
                .opacity(score == 0 || isSubmitting ? 0.5 : 1)
            }
            .buttonStyle(.plain)
            .disabled(score == 0 || isSubmitting)
        }
    }

    private var thankYou: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
            Text(String(localized: "Thanks for the feedback!"))
                .font(.swaplDisplay(26, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text(String(localized: "We read every response — it directly shapes what we build next."))
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                dismiss()
            } label: {
                Text(String(localized: "Done"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(SwaplSemanticLight.primary, in: Capsule())
            }
            .buttonStyle(.plain)
            .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func submit() async {
        guard score > 0 else { return }
        isSubmitting = true
        error = nil
        defer { isSubmitting = false }
        do {
            try await AppFeedbackRepository.shared.submit(score: score, comment: comment)
            didSubmit = true
            // Happy users → nudge the system App Store review prompt. Apple
            // throttles this (max a few times/year), so it may silently no-op.
            if score >= 4 {
                requestReview()
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
