import SwiftUI
import SwaplDesignTokens

// DOK-162: discreet "Verified owner" trust badge. Shown wherever a listing's
// ownerVerified flag is true (an admin approved the optional property-proof
// submission). Deliberately understated — a small seal pill in Swapl's accent,
// never a loud banner.
struct VerifiedOwnerBadge: View {
    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "seal.fill")
                .font(.system(size: 11, weight: .bold))
            Text("Verified owner")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
        }
        .foregroundStyle(SwaplSemanticLight.primary)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(SwaplSemanticLight.accent, in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Verified owner")
    }
}

#Preview {
    VerifiedOwnerBadge()
        .padding()
}
