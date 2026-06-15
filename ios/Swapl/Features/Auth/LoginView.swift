import AuthenticationServices
import SwiftUI
import SwaplDesignTokens

struct LoginView: View {
    enum Mode { case signIn, register }
    enum OtpChannel: String { case email, sms }

    @Environment(AuthService.self) private var auth
    @Environment(\.swaplTheme) private var theme
    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var showWaitlist = false

    // OTP ("email code" / "phone") two-step flow: destination → 6-digit code.
    @State private var otpChannel: OtpChannel?
    @State private var otpDestination = ""
    @State private var otpCode = ""
    @State private var otpCodeSent = false

    private let googleCoordinator = GoogleSignInCoordinator()

    private var isRegister: Bool { mode == .register }

    var body: some View {
        ZStack {
            theme.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: SwaplSpacing.s5) {
                    Spacer(minLength: SwaplSpacing.s8)
                    if let channel = otpChannel {
                        otpForm(channel: channel)
                    } else {
                        passwordForm
                        providerButtons
                    }
                    Spacer(minLength: SwaplSpacing.s8)
                }
                .padding(SwaplSpacing.s8)
                .frame(maxWidth: 480)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .swaplTheme()
        .sheet(isPresented: $showWaitlist) { WaitlistView() }
        .task { await auth.loadProviders() }
    }

    // MARK: - Password form (existing email+password flow)

    @ViewBuilder private var passwordForm: some View {
        KickerLabel(text: isRegister ? String(localized: "Create your account") : String(localized: "Welcome back"))
        Text(isRegister ? String(localized: "Join Swapl.") : String(localized: "Keys for keys."))
            .font(.swaplDisplay(SwaplDesignSystem.FontSize.display))
            .foregroundStyle(theme.foreground)

        TextField("you@example.com", text: $email)
            .textInputAutocapitalization(.never)
            .keyboardType(.emailAddress)
            .textContentType(.username)
            .submitLabel(.next)
            .modifier(AuthFieldChrome())

        SecureField("password", text: $password)
            .textContentType(isRegister ? .newPassword : .password)
            .submitLabel(.go)
            .onSubmit { submit() }
            .modifier(AuthFieldChrome())

        if isRegister {
            Text("Use at least 6 characters. You'll verify your email before publishing a home.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(theme.mutedForeground)
        }

        if let err = auth.errorMessage {
            Text(err)
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(theme.destructive)
        }

        PrimaryPill(
            title: isRegister ? String(localized: "Create account") : String(localized: "Sign in"),
            action: { submit() },
            isLoading: auth.isAuthenticating,
            isDisabled: email.isEmpty || password.count < 6
        )

        Button(action: toggleMode) {
            Text(isRegister ? String(localized: "Already have an account? Sign in")
                            : String(localized: "New to Swapl? Create an account"))
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                .foregroundStyle(theme.primary)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)

        Button {
            showWaitlist = true
        } label: {
            Text("Not ready? Join the waitlist")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(theme.mutedForeground)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Provider buttons (env-gated by GET /api/auth/providers)

    private var isGoogleAvailable: Bool {
        (auth.providers?.google ?? false) && GoogleSignInCoordinator.isConfigured
    }

    @ViewBuilder private var providerButtons: some View {
        if let providers = auth.providers {
            HStack(spacing: SwaplSpacing.s3) {
                Rectangle().fill(theme.border).frame(height: 1)
                Text("or continue with")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(theme.mutedForeground)
                    .fixedSize()
                Rectangle().fill(theme.border).frame(height: 1)
            }
            .padding(.vertical, SwaplSpacing.s2)

            if providers.apple {
                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.fullName, .email]
                } onCompletion: { result in
                    handleAppleCompletion(result)
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 48)
                .clipShape(Capsule())
            }

            if isGoogleAvailable {
                ProviderPill(title: String(localized: "Continue with Google"), systemImage: "globe") {
                    startGoogleSignIn()
                }
            }

            if providers.passkey == true {
                ProviderPill(title: String(localized: "Sign in with a passkey"), systemImage: "person.badge.key") {
                    guard !auth.isAuthenticating else { return }
                    Task { await auth.signInWithPasskey() }
                }
            }

            HStack(spacing: SwaplSpacing.s3) {
                if providers.emailOtp {
                    ProviderPill(title: String(localized: "Email code"), systemImage: "envelope") {
                        openOtp(.email)
                    }
                }
                if providers.phone {
                    ProviderPill(title: String(localized: "Phone"), systemImage: "iphone") {
                        openOtp(.sms)
                    }
                }
            }
        }
    }

    // MARK: - OTP two-step flow

    @ViewBuilder private func otpForm(channel: OtpChannel) -> some View {
        KickerLabel(text: channel == .email ? String(localized: "Sign in with email code") : String(localized: "Sign in with phone"))
        Text(otpCodeSent ? String(localized: "Enter your code.") : String(localized: "Get a code."))
            .font(.swaplDisplay(SwaplDesignSystem.FontSize.display))
            .foregroundStyle(theme.foreground)

        if otpCodeSent {
            Text("We sent a 6-digit code to \(otpDestination). It expires in 10 minutes.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(theme.mutedForeground)

            TextField("123456", text: $otpCode)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .modifier(AuthFieldChrome())
                .onChange(of: otpCode) { _, newValue in
                    otpCode = String(newValue.filter(\.isNumber).prefix(6))
                }
        } else if channel == .email {
            TextField("you@example.com", text: $otpDestination)
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .textContentType(.emailAddress)
                .submitLabel(.go)
                .onSubmit { sendOtpCode(channel: channel) }
                .modifier(AuthFieldChrome())
        } else {
            TextField("+39 333 123 4567", text: $otpDestination)
                .keyboardType(.phonePad)
                .textContentType(.telephoneNumber)
                .modifier(AuthFieldChrome())
            Text("Use international format, e.g. +39 333 123 4567.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(theme.mutedForeground)
        }

        if let err = auth.errorMessage {
            Text(err)
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(theme.destructive)
        }

        if otpCodeSent {
            PrimaryPill(
                title: String(localized: "Verify code"),
                action: { verifyOtpCode() },
                isLoading: auth.isAuthenticating,
                isDisabled: otpCode.count != 6
            )
            Button {
                auth.errorMessage = nil
                otpCode = ""
                otpCodeSent = false
            } label: {
                Text("Didn't get it? Send a new code")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                    .foregroundStyle(theme.primary)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            PrimaryPill(
                title: String(localized: "Send code"),
                action: { sendOtpCode(channel: channel) },
                isLoading: auth.isAuthenticating,
                isDisabled: !isOtpDestinationPlausible(channel: channel)
            )
        }

        Button {
            closeOtp()
        } label: {
            Text("Back to password sign-in")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(theme.mutedForeground)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Actions

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

    private func handleAppleCompletion(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let identityToken = String(data: tokenData, encoding: .utf8)
            else {
                auth.errorMessage = String(localized: "Apple sign-in failed. Try again.")
                return
            }
            // Apple shares the name only on FIRST authorization — forward it so
            // the backend can use it at account creation.
            var fullName: String?
            if let components = credential.fullName {
                let formatted = PersonNameComponentsFormatter.localizedString(from: components, style: .default)
                if !formatted.isEmpty { fullName = formatted }
            }
            Task { await auth.signInWithApple(identityToken: identityToken, fullName: fullName) }
        case .failure(let error):
            if let authError = error as? ASAuthorizationError, authError.code == .canceled { return }
            auth.errorMessage = String(localized: "Apple sign-in failed. Try again.")
        }
    }

    private func startGoogleSignIn() {
        guard !auth.isAuthenticating else { return }
        auth.errorMessage = nil
        Task {
            do {
                let idToken = try await googleCoordinator.signIn()
                await auth.signInWithGoogle(idToken: idToken)
            } catch GoogleSignInError.canceled {
                // User dismissed the sheet — not an error.
            } catch {
                auth.errorMessage = String(localized: "Google sign-in failed. Try again.")
            }
        }
    }

    private func openOtp(_ channel: OtpChannel) {
        auth.errorMessage = nil
        otpDestination = channel == .email ? email : ""
        otpCode = ""
        otpCodeSent = false
        withAnimation(.snappy) { otpChannel = channel }
    }

    private func closeOtp() {
        auth.errorMessage = nil
        withAnimation(.snappy) { otpChannel = nil }
    }

    private func isOtpDestinationPlausible(channel: OtpChannel) -> Bool {
        let trimmed = otpDestination.trimmingCharacters(in: .whitespaces)
        switch channel {
        case .email: return trimmed.contains("@") && trimmed.contains(".")
        case .sms: return trimmed.hasPrefix("+") && trimmed.filter(\.isNumber).count >= 7
        }
    }

    private func sendOtpCode(channel: OtpChannel) {
        guard isOtpDestinationPlausible(channel: channel), !auth.isAuthenticating else { return }
        let destination = otpDestination.trimmingCharacters(in: .whitespaces)
        Task {
            if await auth.requestOtp(channel: channel.rawValue, destination: destination) {
                withAnimation(.snappy) { otpCodeSent = true }
            }
        }
    }

    private func verifyOtpCode() {
        guard otpCode.count == 6, !auth.isAuthenticating else { return }
        let destination = otpDestination.trimmingCharacters(in: .whitespaces)
        Task { await auth.verifyOtp(destination: destination, code: otpCode) }
    }
}

// Shared chrome for every auth text field — same look as the original form.
private struct AuthFieldChrome: ViewModifier {
    @Environment(\.swaplTheme) private var theme

    func body(content: Content) -> some View {
        content
            .padding(14)
            .background(theme.card, in: RoundedRectangle(cornerRadius: SwaplRadius.md))
            .overlay(RoundedRectangle(cornerRadius: SwaplRadius.md).stroke(theme.border))
    }
}

// Secondary full-width capsule for third-party providers, visually paired
// with the native Sign in with Apple button.
private struct ProviderPill: View {
    @Environment(\.swaplTheme) private var theme
    let title: String
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: SwaplSpacing.s2) {
                Image(systemName: systemImage)
                Text(title)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .medium))
            }
            .frame(maxWidth: .infinity, minHeight: 48)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .background(theme.card, in: Capsule())
        .overlay(Capsule().stroke(theme.border))
        .foregroundStyle(theme.foreground)
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
                            .font(.swaplDisplay(SwaplDesignSystem.FontSize.h1))
                            .foregroundStyle(theme.foreground)
                        Text("We'll email you the moment swaps open in your city.")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                            .foregroundStyle(theme.mutedForeground)
                        PrimaryPill(title: "Done", action: { dismiss() })
                    } else {
                        KickerLabel(text: "Early access")
                        Text("Join the waitlist.")
                            .font(.swaplDisplay(SwaplDesignSystem.FontSize.h1))
                            .foregroundStyle(theme.foreground)
                        Text("Be first to swap when we launch near you.")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
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
                            Text(error).font(.swaplBody(SwaplDesignSystem.FontSize.small)).foregroundStyle(theme.destructive)
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
