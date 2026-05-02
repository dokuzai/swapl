import SwiftUI
import SwaplDesignTokens

struct AccountView: View {
    @Environment(AuthService.self) private var auth

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SwaplSpacing.s5) {
                    KickerLabel(text: "Account")
                    if let s = auth.session {
                        Text(s.name ?? s.email)
                            .font(.swaplDisplay(28))
                        Text(s.email)
                            .font(.swaplBody(14))
                            .foregroundStyle(SwaplSemanticLight.mutedForeground)
                    }
                    Divider().background(SwaplSemanticLight.border)
                    Button("Sign out") {
                        Task { await auth.signOut() }
                    }
                    .foregroundStyle(SwaplSemanticLight.destructive)
                }
                .padding(SwaplSpacing.s5)
            }
            .background(SwaplSemanticLight.background)
            .navigationTitle("Account")
        }
        .swaplTheme()
    }
}
