import SwiftUI
import SwaplDesignTokens

struct LoginView: View {
    enum Mode { case signIn, register }

    @Environment(AuthService.self) private var auth
    @Environment(\.swaplTheme) private var theme
    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""

    private var isRegister: Bool { mode == .register }

    var body: some View {
        ZStack {
            theme.background.ignoresSafeArea()
            VStack(alignment: .leading, spacing: SwaplSpacing.s5) {
                Spacer()
                KickerLabel(text: isRegister ? "Create your account" : "Welcome back")
                Text(isRegister ? "Join Swapl." : "Keys for keys.")
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
                    .textContentType(isRegister ? .newPassword : .password)
                    .submitLabel(.go)
                    .onSubmit { submit() }
                    .padding(14)
                    .background(theme.card, in: RoundedRectangle(cornerRadius: SwaplRadius.md))
                    .overlay(RoundedRectangle(cornerRadius: SwaplRadius.md).stroke(theme.border))

                if isRegister {
                    Text("Use at least 6 characters. You'll verify your email before publishing a home.")
                        .font(.swaplBody(13))
                        .foregroundStyle(theme.mutedForeground)
                }

                if let err = auth.errorMessage {
                    Text(err)
                        .font(.swaplBody(13))
                        .foregroundStyle(theme.destructive)
                }

                PrimaryPill(
                    title: isRegister ? "Create account" : "Sign in",
                    action: { submit() },
                    isLoading: auth.isAuthenticating,
                    isDisabled: email.isEmpty || password.count < 6
                )

                Button(action: toggleMode) {
                    Text(isRegister ? "Already have an account? Sign in"
                                    : "New to Swapl? Create an account")
                        .font(.swaplBody(14, weight: .semibold))
                        .foregroundStyle(theme.primary)
                }
                .padding(.top, 2)

                Spacer()
            }
            .padding(SwaplSpacing.s8)
            .frame(maxWidth: 480)
        }
        .swaplTheme()
    }

    private func toggleMode() {
        auth.errorMessage = nil
        withAnimation(.snappy) { mode = isRegister ? .signIn : .register }
    }

    private func submit() {
        guard !email.isEmpty, password.count >= 6, !auth.isAuthenticating else { return }
        Task {
            if isRegister {
                await auth.register(email: email, password: password)
            } else {
                await auth.signIn(email: email, password: password)
            }
        }
    }
}
