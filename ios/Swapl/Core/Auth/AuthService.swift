import Foundation
import Observation

@Observable
final class AuthService {
    var session: AuthUser?
    var isAuthenticating = false
    var errorMessage: String?

    private let keychain = KeychainTokenStore()

    init() {
        APIClient.shared.tokenProvider = { [weak self] in
            self?.keychain.read()
        }
    }

    // Called once on app launch — if there's a token in the keychain, fetch
    // /api/me to confirm it's still valid and prime the session.
    func bootstrap() async {
        guard keychain.read() != nil else { return }
        do {
            let me: MeResponse = try await APIClient.shared.send("GET", "/api/me")
            session = AuthUser(
                id: me.user.id, email: me.user.email,
                name: me.user.name, avatar: me.user.avatar
            )
        } catch APIClient.APIError.unauthenticated {
            keychain.delete()
        } catch {
            // Network error — keep token, retry next launch.
        }
    }

    func signIn(email: String, password: String) async {
        isAuthenticating = true
        errorMessage = nil
        defer { isAuthenticating = false }
        struct Body: Encodable { let email: String; let password: String; let platform: String; let appVersion: String }
        let body = Body(
            email: email,
            password: password,
            platform: "ios",
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
        )
        do {
            let res: TokenResponse = try await APIClient.shared.send(
                "POST", "/api/auth/token",
                body: body
            )
            keychain.write(res.token)
            session = res.user
        } catch APIClient.APIError.status(401, _) {
            errorMessage = "Invalid email or password."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        _ = try? await APIClient.shared.send("POST", "/api/auth/token/revoke", as: EmptyResponse.self)
        _ = try? await APIClient.shared.send("DELETE", "/api/devices", as: EmptyResponse.self)
        keychain.delete()
        session = nil
    }
}
