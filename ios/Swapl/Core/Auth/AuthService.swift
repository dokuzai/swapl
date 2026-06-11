import Foundation
import Observation

@MainActor
@Observable
final class AuthService {
    var session: AuthUser?
    var isVerified = false
    // From /api/me (e.g. "user", "swapl_admin"). Nil until the session is hydrated.
    var role: String?
    var isBootstrapping = true
    var isAuthenticating = false
    var errorMessage: String?

    private let keychain = KeychainTokenStore()
    private var refreshTask: Task<Bool, Never>?

    init() {
        APIClient.shared.tokenProvider = { [weak self] in
            self?.keychain.read()
        }
        APIClient.shared.tokenRefresher = { [weak self] in
            guard let self else { return false }
            return await self.refreshToken()
        }
    }

    // Single-flight token refresh. Concurrent 401s share one refresh call so we
    // don't rotate the token out from under each other.
    func refreshToken() async -> Bool {
        if let task = refreshTask { return await task.value }
        let task = Task { () -> Bool in
            guard self.keychain.read() != nil else { return false }
            do {
                let res: RefreshResponse = try await APIClient.shared.send(
                    "POST", "/api/auth/token/refresh", allowRefresh: false
                )
                self.keychain.write(res.token)
                return true
            } catch {
                return false
            }
        }
        refreshTask = task
        let result = await task.value
        refreshTask = nil
        return result
    }

    // Called once on app launch — if there's a token in the keychain, fetch
    // /api/me to confirm it's still valid and prime the session.
    func bootstrap() async {
        guard isBootstrapping else { return }
        defer { isBootstrapping = false }
        guard keychain.read() != nil else { return }
        do {
            let me: MeResponse = try await APIClient.shared.send("GET", "/api/me")
            applyMe(me)
        } catch APIClient.APIError.unauthenticated {
            keychain.delete()
        } catch {
            // Network error — keep token, retry next launch.
        }
    }

    private func applyMe(_ me: MeResponse) {
        session = AuthUser(id: me.user.id, email: me.user.email, name: me.user.name, avatar: me.user.avatar)
        isVerified = me.user.verified
        role = me.user.role
    }

    // Gate for founder-only screens; the server enforces it too (403).
    var isAdmin: Bool { role == "swapl_admin" }

    // Re-fetch /api/me to pick up a freshly-verified email (e.g. after the user
    // taps the verification link in their email and returns to the app).
    func refreshSession() async {
        guard keychain.read() != nil else { return }
        if let me: MeResponse = try? await APIClient.shared.send("GET", "/api/me") {
            applyMe(me)
        }
    }

    // Re-send the verification email for the signed-in user.
    func resendVerification() async -> Bool {
        do {
            _ = try await APIClient.shared.send("POST", "/api/auth/resend-verification", as: EmptyResponse.self)
            return true
        } catch {
            return false
        }
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
    }

    func signIn(email: String, password: String) async {
        isAuthenticating = true
        errorMessage = nil
        defer { isAuthenticating = false }
        struct Body: Encodable { let email: String; let password: String; let platform: String; let appVersion: String }
        let body = Body(email: email, password: password, platform: "ios", appVersion: appVersion)
        do {
            let res: TokenResponse = try await APIClient.shared.send(
                "POST", "/api/auth/token",
                body: body
            )
            keychain.write(res.token)
            session = res.user
            await refreshSession()   // pick up email-verified status
        } catch APIClient.APIError.status(401, _) {
            errorMessage = "Invalid email or password."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func register(email: String, password: String) async {
        isAuthenticating = true
        errorMessage = nil
        defer { isAuthenticating = false }
        struct Body: Encodable { let email: String; let password: String; let platform: String; let appVersion: String }
        let body = Body(email: email, password: password, platform: "ios", appVersion: appVersion)
        do {
            let res: RegisterResponse = try await APIClient.shared.send(
                "POST", "/api/auth/register",
                body: body
            )
            guard let token = res.token else {
                // Backend didn't return a native token — fall back to logging in.
                await signIn(email: email, password: password)
                return
            }
            keychain.write(token)
            // The register response omits the full user; hydrate from /api/me,
            // falling back to a minimal session so the user can proceed.
            await loadSession(fallbackId: res.userId, fallbackEmail: email)
        } catch APIClient.APIError.status(409, _) {
            errorMessage = "That email is already registered. Try signing in."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadSession(fallbackId: String, fallbackEmail: String) async {
        do {
            let me: MeResponse = try await APIClient.shared.send("GET", "/api/me")
            applyMe(me)
        } catch {
            session = AuthUser(id: fallbackId, email: fallbackEmail, name: nil, avatar: nil)
            isVerified = false
        }
    }

    func signOut() async {
        _ = try? await APIClient.shared.send("POST", "/api/auth/token/revoke", as: EmptyResponse.self)
        _ = try? await APIClient.shared.send("DELETE", "/api/devices", as: EmptyResponse.self)
        keychain.delete()
        session = nil
        isVerified = false
        role = nil
    }
}
