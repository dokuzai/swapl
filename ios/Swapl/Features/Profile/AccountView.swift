import SwiftUI
import SwaplDesignTokens

struct AccountView: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.swaplTheme) private var theme
    @State private var isConfirmingSignOut = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if let s = auth.session {
                        Text(s.name ?? s.email)
                            .font(.swaplDisplay(28))
                        Text(s.email)
                            .font(.swaplBody(14))
                            .foregroundStyle(theme.mutedForeground)
                    }
                }

                Section {
                    Button("Sign out", role: .destructive) {
                        isConfirmingSignOut = true
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(theme.background)
            .navigationTitle("Account")
            .confirmationDialog("Sign out of Swapl?", isPresented: $isConfirmingSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) {
                    Task { await auth.signOut() }
                }
                Button("Cancel", role: .cancel) {}
            }
        }
        .swaplTheme()
    }
}
