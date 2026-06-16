import SwiftUI
import StoreKit
import SwaplDesignTokens

// "Valuta l'app" (F2 / M1). A 1–5 rating with an optional comment that POSTs to
// the shared /api/app-feedback endpoint with source:"ios". For a positive score
// (>= 4) we additionally surface the system StoreKit review prompt — Apple
// throttles it, so it may not appear, which is by design. For a low score
// (<= 2) we never send the user to the App Store; instead we offer a direct
// support link so unhappy feedback reaches us, not a public review.
//
// The sheet is reusable across surfaces (DOK-190). The default is the Account
// "Rate the app" row (surface "account"); the contextual triggers pass
// surface "post-review" / "post-swap" plus the agreementId as contextKey. The
// backend upserts on unique (userId, surface, contextKey).
struct RateAppSheet: View {
    let surface: String
    let contextKey: String

    @Environment(\.dismiss) private var dismiss
    @Environment(\.requestReview) private var requestReview

    @State private var score = 0
    @State private var comment = ""
    @State private var isSubmitting = false
    @State private var didSubmit = false
    @State private var error: String?
    @State private var supportItem: SafariItem?

    private let emojis = ["😞", "😕", "😐", "🙂", "😍"]

    // Where unhappy users (score <= 2) are routed instead of the App Store.
    private let supportURL = URL(string: "https://swapl.fun/contact")!

    init(surface: String = "account", contextKey: String = "") {
        self.surface = surface
        self.contextKey = contextKey
    }

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
                    Button(String(localized: "Close")) {
                        // Dismissing also satisfies the no-nag guard so a
                        // contextual prompt never reappears for this agreement.
                        AppFeedbackPrompt.markSeen(surface: surface, contextKey: contextKey)
                        dismiss()
                    }
                }
            }
            .sheet(item: $supportItem) { item in
                SafariView(url: item.url)
                    .ignoresSafeArea()
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

            // Low scores (<= 2): offer a direct line to support rather than the
            // App Store — unhappy feedback should reach us privately.
            if score > 0 && score <= 2 {
                Button {
                    supportItem = SafariItem(url: supportURL)
                } label: {
                    Text(String(localized: "Tell us what went wrong"))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(SwaplSemanticLight.card, in: Capsule())
                        .overlay { Capsule().stroke(AirbnbPalette.hairline) }
                }
                .buttonStyle(.plain)
                .padding(.top, 6)
            }

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
            try await AppFeedbackRepository.shared.submit(
                score: score,
                comment: comment,
                surface: surface,
                contextKey: contextKey
            )
            // Either way the user responded — never prompt again for this
            // surface + agreement.
            AppFeedbackPrompt.markSeen(surface: surface, contextKey: contextKey)
            didSubmit = true
            // Happy users (>= 4) → nudge the system App Store review prompt.
            // Apple throttles this (max a few times/year), so it may silently
            // no-op. Unhappy users (<= 2) get a support link in `thankYou`
            // instead — we never route them to the store.
            if score >= 4 {
                requestReview()
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// Shared no-nag guard for contextual app-feedback prompts (DOK-190). Each
// (surface, agreementId) pair is prompted at most once; the flag is set on
// submit OR dismiss. One prompt at a time is enforced by the call sites, which
// only auto-present when nothing else is showing.
// Identifiable wrapper so contextual triggers can drive `.sheet(item:)` with
// an agreementId (String isn't Identifiable on its own).
struct AppFeedbackContext: Identifiable {
    let agreementId: String
    var id: String { agreementId }
}

enum AppFeedbackPrompt {
    private static func key(surface: String, contextKey: String) -> String {
        "swapl.appfb.\(surface).\(contextKey)"
    }

    /// True when this surface+context has already prompted (submitted or dismissed).
    static func hasSeen(surface: String, contextKey: String) -> Bool {
        UserDefaults.standard.bool(forKey: key(surface: surface, contextKey: contextKey))
    }

    /// Records that the prompt was shown so it never auto-presents again.
    static func markSeen(surface: String, contextKey: String) {
        UserDefaults.standard.set(true, forKey: key(surface: surface, contextKey: contextKey))
    }
}
