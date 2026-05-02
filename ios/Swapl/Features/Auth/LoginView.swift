import SwiftUI
import SwaplDesignTokens

struct LoginView: View {
    @Environment(AuthService.self) private var auth
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        ZStack {
            SwaplSemanticLight.background.ignoresSafeArea()
            VStack(alignment: .leading, spacing: SwaplSpacing.s5) {
                Spacer()
                KickerLabel(text: "Welcome back")
                Text("Keys for keys.")
                    .font(.swaplDisplay(40))
                    .foregroundStyle(SwaplSemanticLight.foreground)

                TextField("you@example.com", text: $email)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .padding(14)
                    .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplRadius.md))
                    .overlay(RoundedRectangle(cornerRadius: SwaplRadius.md).stroke(SwaplSemanticLight.border))

                SecureField("password", text: $password)
                    .padding(14)
                    .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplRadius.md))
                    .overlay(RoundedRectangle(cornerRadius: SwaplRadius.md).stroke(SwaplSemanticLight.border))

                if let err = auth.errorMessage {
                    Text(err)
                        .font(.swaplBody(13))
                        .foregroundStyle(SwaplSemanticLight.destructive)
                }

                PrimaryPill(
                    title: "Sign in",
                    action: { Task { await auth.signIn(email: email, password: password) } },
                    isLoading: auth.isAuthenticating,
                    isDisabled: email.isEmpty || password.count < 6
                )

                Spacer()
            }
            .padding(SwaplSpacing.s8)
            .frame(maxWidth: 480)
        }
    }
}
