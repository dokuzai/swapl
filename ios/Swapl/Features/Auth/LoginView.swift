import SwiftUI
import SwaplDesignTokens

struct LoginView: View {
    enum Mode { case signIn, register }

    @Environment(AuthService.self) private var auth
    @Environment(\.swaplTheme) private var theme
    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var showWaitlist = false

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

                Button("Not ready? Join the waitlist") { showWaitlist = true }
                    .font(.swaplBody(13))
                    .foregroundStyle(theme.mutedForeground)

                Spacer()
            }
            .padding(SwaplSpacing.s8)
            .frame(maxWidth: 480)
        }
        .swaplTheme()
        .sheet(isPresented: $showWaitlist) { WaitlistView() }
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

// Pre-auth subscriber capture → POST /api/beta (public, idempotent on email).
struct WaitlistView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.swaplTheme) private var theme
    @State private var email = ""
    @State private var busy = false
    @State private var done = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ZStack {
                theme.background.ignoresSafeArea()
                VStack(alignment: .leading, spacing: SwaplSpacing.s4) {
                    if done {
                        KickerLabel(text: "You're on the list")
                        Text("See you soon.")
                            .font(.swaplDisplay(32))
                            .foregroundStyle(theme.foreground)
                        Text("We'll email you the moment swaps open in your city.")
                            .font(.swaplBody(15))
                            .foregroundStyle(theme.mutedForeground)
                        PrimaryPill(title: "Done", action: { dismiss() })
                    } else {
                        KickerLabel(text: "Early access")
                        Text("Join the waitlist.")
                            .font(.swaplDisplay(32))
                            .foregroundStyle(theme.foreground)
                        Text("Be first to swap when we launch near you.")
                            .font(.swaplBody(15))
                            .foregroundStyle(theme.mutedForeground)

                        TextField("you@example.com", text: $email)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .textContentType(.emailAddress)
                            .submitLabel(.go)
                            .onSubmit(submit)
                            .padding(14)
                            .background(theme.card, in: RoundedRectangle(cornerRadius: SwaplRadius.md))
                            .overlay(RoundedRectangle(cornerRadius: SwaplRadius.md).stroke(theme.border))

                        if let error {
                            Text(error).font(.swaplBody(13)).foregroundStyle(theme.destructive)
                        }

                        PrimaryPill(
                            title: "Join the waitlist",
                            action: submit,
                            isLoading: busy,
                            isDisabled: !email.contains("@")
                        )
                    }
                    Spacer()
                }
                .padding(SwaplSpacing.s8)
                .frame(maxWidth: 480)
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    private func submit() {
        guard email.contains("@"), !busy else { return }
        busy = true
        error = nil
        Task {
            struct Body: Encodable { let email: String; let source: String }
            do {
                _ = try await APIClient.shared.send(
                    "POST", "/api/beta",
                    body: Body(email: email, source: "ios"),
                    as: EmptyResponse.self
                )
                done = true
            } catch {
                self.error = "Something went wrong. Please try again."
            }
            busy = false
        }
    }
}
