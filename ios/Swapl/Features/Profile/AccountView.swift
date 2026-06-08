import SwiftUI
import SwaplDesignTokens

struct AccountView: View {
    @Environment(AuthService.self) private var auth
    @State private var isConfirmingSignOut = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text("Profile")
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.display, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .padding(.top, 22)

                    if let s = auth.session {
                        VStack(alignment: .leading, spacing: 10) {
                            Circle()
                                .fill(AirbnbPalette.primary)
                                .frame(width: 64, height: 64)
                                .overlay {
                                    Text(String((s.name ?? s.email).prefix(1)))
                                        .font(.swaplDisplay(28, weight: .semibold))
                                        .foregroundStyle(AirbnbPalette.primaryForeground)
                                }
                            Text(s.name ?? s.email)
                                .font(.swaplDisplay(28, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                            Text(s.email)
                                .font(.swaplBody(14))
                                .foregroundStyle(AirbnbPalette.secondaryText)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(22)
                        .background(AirbnbPalette.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                                .stroke(AirbnbPalette.hairline)
                        }
                    }

                    Button("Sign out", role: .destructive) {
                        isConfirmingSignOut = true
                    }
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(AirbnbPalette.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                            .stroke(AirbnbPalette.hairline)
                    }
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 110)
            }
            .background(AirbnbPalette.background)
            .toolbar(.hidden, for: .navigationBar)
            .confirmationDialog("Sign out of Swapl?", isPresented: $isConfirmingSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) {
                    Task { await auth.signOut() }
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }
}
