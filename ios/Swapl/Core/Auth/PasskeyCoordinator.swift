import AuthenticationServices
import Foundation
import UIKit

// Native passkey (WebAuthn) plumbing. The server speaks SimpleWebAuthn JSON
// (base64url-encoded buffers); ASAuthorizationController speaks raw Data —
// this file owns the bridge in both directions plus the delegate dance.
//
// Flows (both relayed to the backend, which emits the SAME bearer session as
// every other login via lib/auth/respond.ts):
//   sign-in: POST /api/auth/passkey/login/options    → assertion → /login/verify
//   enroll:  POST /api/auth/passkey/register/options → attestation → /register/verify

enum PasskeyError: Error {
    case canceled
    case failed
    case invalidServerResponse
}

// MARK: - Server option payloads (SimpleWebAuthn JSON)

// POST /api/auth/passkey/login/options — usernameless: allowCredentials is
// empty, so only the challenge and relying party id matter to the client.
struct PasskeyLoginOptions: Decodable, Sendable {
    let challenge: String
    let rpId: String?
}

// POST /api/auth/passkey/register/options (authenticated).
struct PasskeyRegistrationOptions: Decodable, Sendable {
    let challenge: String
    let rp: RelyingParty
    let user: UserEntity

    struct RelyingParty: Decodable, Sendable {
        let id: String?
        let name: String?
    }
    struct UserEntity: Decodable, Sendable {
        let id: String        // base64url user handle
        let name: String?
        let displayName: String?
    }
}

// MARK: - ASAuthorizationController wrapper

// One in-flight request at a time (mirrors GoogleSignInCoordinator: the
// system sheet is modal anyway). Not @MainActor — the delegate callbacks
// arrive on the main queue and only touch the continuation.
final class PasskeyCoordinator: NSObject, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {

    private var continuation: CheckedContinuation<ASAuthorization, Error>?
    // Keep the controller alive while the system sheet is up.
    private var activeController: ASAuthorizationController?

    @MainActor
    func perform(_ request: ASAuthorizationRequest) async throws -> ASAuthorization {
        let authorization: ASAuthorization = try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            activeController = controller
            controller.performRequests()
        }
        activeController = nil
        return authorization
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        continuation?.resume(returning: authorization)
        continuation = nil
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            continuation?.resume(throwing: PasskeyError.canceled)
        } else {
            continuation?.resume(throwing: error)
        }
        continuation = nil
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated { UIApplication.shared.authPresentationAnchor }
    }
}

@MainActor
extension UIApplication {
    /// A window to present auth sheets from, avoiding the deprecated `UIWindow()`
    /// fallback (`init()` is deprecated in iOS 26 — `ASPresentationAnchor()` is
    /// that initializer). Prefers the key window, then any window, then a window
    /// bound to an existing scene, and only as a last resort a detached window.
    var authPresentationAnchor: UIWindow {
        let scenes = connectedScenes.compactMap { $0 as? UIWindowScene }
        let windows = scenes.flatMap(\.windows)
        if let key = windows.first(where: \.isKeyWindow) { return key }
        if let any = windows.first { return any }
        if let scene = scenes.first { return UIWindow(windowScene: scene) }
        // Unreachable when the system asks for a presentation anchor: the app
        // must have a foreground window scene on screen. `init()`/`init(frame:)`
        // are deprecated in iOS 26 and `init(windowScene:)` needs a scene we
        // don't have here, so fail loudly rather than hand back a dead window.
        preconditionFailure("No UIWindowScene available to anchor presentation")
    }
}

// MARK: - base64url (WebAuthn wire format)

extension Data {
    /// Decode a base64url string (no padding, -/_ alphabet) as used by WebAuthn JSON.
    init?(base64URLEncoded string: String) {
        var base64 = string
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64.append("=") }
        self.init(base64Encoded: base64)
    }

    /// Encode as base64url (no padding) as expected by SimpleWebAuthn.
    var base64URLEncodedString: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
