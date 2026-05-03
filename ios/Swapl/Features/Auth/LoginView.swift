import SwiftUI
import SwaplDesignTokens

struct LoginView: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.swaplTheme) private var theme
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            theme.background.ignoresSafeArea()
            VStack(alignment: .leading, spacing: SwaplSpacing.s5) {
                Spacer()
                KickerLabel(text: "Welcome back")
                Text("Keys for keys.")
                    .font(.swaplDisplay(40))
                    .foregroundStyle(theme.foreground)

                TextField("you@example.com", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .textContentType(.username)
                    .submitLabel(.next)
                    .padding(14)
                    .background(theme.card, in: RoundedRectangle(cornerRadius: SwaplRadius.md))
                    .overlay(RoundedRectangle(cornerRadius: SwaplRadius.md).stroke(theme.border))

                SecureField("password", text: $password)
                    .textContentType(.password)
                    .submitLabel(.go)
                    .onSubmit(signIn)
                    .padding(14)
                    .background(theme.card, in: RoundedRectangle(cornerRadius: SwaplRadius.md))
                    .overlay(RoundedRectangle(cornerRadius: SwaplRadius.md).stroke(theme.border))

                if let err = auth.errorMessage {
                    Text(err)
                        .font(.swaplBody(13))
                        .foregroundStyle(theme.destructive)
                }

                PrimaryPill(
                    title: "Sign in",
                    action: signIn,
                    isLoading: auth.isAuthenticating,
                    isDisabled: email.isEmpty || password.count < 6
                )

                Spacer()
            }
            .padding(SwaplSpacing.s8)
            .frame(maxWidth: 480)
        }
        .swaplTheme()
    }

    private func signIn() {
        guard !email.isEmpty, password.count >= 6, !auth.isAuthenticating else { return }
        Task { await auth.signIn(email: email, password: password) }
    }
}
