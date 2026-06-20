import AuthenticationServices
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
            errorMessage = String(localized: "Invalid email or password.")
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
            errorMessage = String(localized: "That email is already registered. Try signing in.")
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

    // MARK: - Multi-provider sign-in (Apple / Google / Telegram / OTP)

    // Hydrated by LoginView on appear; nil until the first fetch succeeds.
    // Buttons for disabled providers are hidden, mirroring the web client.
    var providers: ProvidersStatus?

    func loadProviders() async {
        if let status: ProvidersStatus = try? await APIClient.shared.send("GET", "/api/auth/providers") {
            providers = status
        }
    }

    func signInWithApple(identityToken: String, fullName: String?) async {
        struct Body: Encodable {
            let identityToken: String
            let fullName: String?
            let platform: String
            let appVersion: String
        }
        await tokenSignIn(
            "/api/auth/oauth/apple",
            body: Body(identityToken: identityToken, fullName: fullName, platform: "ios", appVersion: appVersion)
        )
    }

    func signInWithGoogle(idToken: String) async {
        struct Body: Encodable { let idToken: String; let platform: String; let appVersion: String }
        await tokenSignIn(
            "/api/auth/oauth/google",
            body: Body(idToken: idToken, platform: "ios", appVersion: appVersion)
        )
    }

    func signInWithTelegram(authData: [String: String]) async {
        struct Body: Encodable { let authData: [String: String]; let platform: String; let appVersion: String }
        await tokenSignIn(
            "/api/auth/oauth/telegram",
            body: Body(authData: authData, platform: "ios", appVersion: appVersion)
        )
    }

    // Step 1 of the OTP flow — true when the code was dispatched (the server
    // answers opaquely: it never reveals whether the destination exists).
    func requestOtp(channel: String, destination: String) async -> Bool {
        isAuthenticating = true
        errorMessage = nil
        defer { isAuthenticating = false }
        struct Body: Encodable { let channel: String; let destination: String }
        do {
            _ = try await APIClient.shared.send(
                "POST", "/api/auth/otp/request",
                body: Body(channel: channel, destination: destination),
                as: EmptyResponse.self
            )
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    // Step 2 — exchanges the 6-digit code for the same bearer session as
    // every other login.
    func verifyOtp(destination: String, code: String) async {
        struct Body: Encodable {
            let destination: String
            let code: String
            let platform: String
            let appVersion: String
        }
        await tokenSignIn(
            "/api/auth/otp/verify",
            body: Body(destination: destination, code: code, platform: "ios", appVersion: appVersion)
        )
    }

    // Shared tail of every provider login: all endpoints return the exact
    // POST /api/auth/token shape, so the session handling is identical.
    private func tokenSignIn(_ path: String, body: Encodable) async {
        isAuthenticating = true
        errorMessage = nil
        defer { isAuthenticating = false }
        do {
            let res: TokenResponse = try await APIClient.shared.send("POST", path, body: body)
            keychain.write(res.token)
            session = res.user
            await refreshSession()   // pick up email-verified status + role
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Passkeys (WebAuthn)

    private let passkeyCoordinator = PasskeyCoordinator()

    private var passkeyRelyingParty: String {
        // Prod relying party; dev servers return their own rpId in options,
        // which always wins over this fallback.
        APIClient.shared.baseURL.host ?? "app.swapl.fun"
    }

    // Usernameless sign-in: the device offers its discoverable credentials for
    // the relying party; the assertion's credential id resolves the account
    // server-side. Lands on the same bearer session as every other login.
    func signInWithPasskey() async {
        isAuthenticating = true
        errorMessage = nil
        defer { isAuthenticating = false }
        do {
            let options: PasskeyLoginOptions = try await APIClient.shared.send(
                "POST", "/api/auth/passkey/login/options"
            )
            guard let challenge = Data(base64URLEncoded: options.challenge) else {
                throw PasskeyError.invalidServerResponse
            }
            let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
                relyingPartyIdentifier: options.rpId ?? passkeyRelyingParty
            )
            let request = provider.createCredentialAssertionRequest(challenge: challenge)
            let authorization = try await passkeyCoordinator.perform(request)
            guard let assertion = authorization.credential
                    as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
                throw PasskeyError.failed
            }

            // SimpleWebAuthn AuthenticationResponseJSON, assertion fields at the
            // top level + platform/appVersion (same convention as other logins).
            struct Body: Encodable {
                struct Response: Encodable {
                    let clientDataJSON: String
                    let authenticatorData: String
                    let signature: String
                    let userHandle: String?
                }
                struct Empty: Encodable {}
                let id: String
                let rawId: String
                let type: String
                let authenticatorAttachment: String
                let response: Response
                let clientExtensionResults: Empty
                let platform: String
                let appVersion: String
            }
            let credentialId = assertion.credentialID.base64URLEncodedString
            let body = Body(
                id: credentialId,
                rawId: credentialId,
                type: "public-key",
                authenticatorAttachment: "platform",
                response: .init(
                    clientDataJSON: assertion.rawClientDataJSON.base64URLEncodedString,
                    authenticatorData: assertion.rawAuthenticatorData.base64URLEncodedString,
                    signature: assertion.signature.base64URLEncodedString,
                    userHandle: assertion.userID.isEmpty ? nil : assertion.userID.base64URLEncodedString
                ),
                clientExtensionResults: .init(),
                platform: "ios",
                appVersion: appVersion
            )
            let res: TokenResponse = try await APIClient.shared.send(
                "POST", "/api/auth/passkey/login/verify", body: body
            )
            keychain.write(res.token)
            session = res.user
            await refreshSession()   // pick up email-verified status + role
        } catch PasskeyError.canceled {
            // User dismissed the system sheet — not an error.
        } catch APIClient.APIError.status(401, _) {
            errorMessage = String(localized: "Passkey sign-in failed. Try again.")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // Enroll a passkey for the signed-in account (there is no passkey sign-up:
    // register/options is authenticated). Throws PasskeyError.canceled when the
    // user dismisses the sheet so callers can ignore it silently.
    func addPasskey() async throws {
        let options: PasskeyRegistrationOptions = try await APIClient.shared.send(
            "POST", "/api/auth/passkey/register/options"
        )
        guard let challenge = Data(base64URLEncoded: options.challenge),
              let userID = Data(base64URLEncoded: options.user.id) else {
            throw PasskeyError.invalidServerResponse
        }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
            relyingPartyIdentifier: options.rp.id ?? passkeyRelyingParty
        )
        let request = provider.createCredentialRegistrationRequest(
            challenge: challenge,
            name: options.user.name ?? session?.email ?? "Swapl",
            userID: userID
        )
        let authorization = try await passkeyCoordinator.perform(request)
        guard let registration = authorization.credential
                as? ASAuthorizationPlatformPublicKeyCredentialRegistration,
              let attestationObject = registration.rawAttestationObject else {
            throw PasskeyError.failed
        }

        // SimpleWebAuthn RegistrationResponseJSON, nested under "response"
        // (this endpoint's convention — see register/verify route).
        struct Body: Encodable {
            struct Credential: Encodable {
                struct Attestation: Encodable {
                    let clientDataJSON: String
                    let attestationObject: String
                }
                struct Empty: Encodable {}
                let id: String
                let rawId: String
                let type: String
                let authenticatorAttachment: String
                let response: Attestation
                let clientExtensionResults: Empty
            }
            let response: Credential
            let name: String?
        }
        let credentialId = registration.credentialID.base64URLEncodedString
        let body = Body(
            response: .init(
                id: credentialId,
                rawId: credentialId,
                type: "public-key",
                authenticatorAttachment: "platform",
                response: .init(
                    clientDataJSON: registration.rawClientDataJSON.base64URLEncodedString,
                    attestationObject: attestationObject.base64URLEncodedString
                ),
                clientExtensionResults: .init()
            ),
            name: nil   // server picks a sensible default ("iCloud passkey", …)
        )
        _ = try await APIClient.shared.send(
            "POST", "/api/auth/passkey/register/verify", body: body, as: EmptyResponse.self
        )
    }

    func signOut() async {
        _ = try? await APIClient.shared.send("POST", "/api/auth/token/revoke", as: EmptyResponse.self)
        _ = try? await APIClient.shared.send("DELETE", "/api/devices", as: EmptyResponse.self)
        keychain.delete()
        session = nil
        isVerified = false
        role = nil
    }

    // Permanently delete the account (Apple 5.1.1(v)). The server anonymises and
    // blocks the account; on success we drop all local session state, which
    // returns the app to the login screen. Throws so the UI can surface failures.
    func deleteAccount() async throws {
        _ = try await APIClient.shared.send("DELETE", "/api/account", as: EmptyResponse.self)
        keychain.delete()
        session = nil
        isVerified = false
        role = nil
    }
}
