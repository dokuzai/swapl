import AuthenticationServices
import Foundation
import UIKit

// Google sign-in WITHOUT the GoogleSignIn SDK: ASWebAuthenticationSession on
// Google's OAuth endpoint with response_type=id_token (implicit flow). The
// resulting ID token is posted to /api/auth/oauth/google, which verifies the
// signature/issuer/audience against Google's JWKS server-side.
//
// Requires an iOS OAuth client id baked into Info.plist (SwaplGoogleOAuthClientID
// in project.yml). Google only accepts the reversed-client-id custom scheme as
// a redirect for iOS clients, so the scheme is derived from the client id at
// runtime — no Info.plist URL-type registration is needed because
// ASWebAuthenticationSession intercepts the callback itself.

enum GoogleSignInError: Error {
    case notConfigured
    case canceled
    case failed
}

final class GoogleSignInCoordinator: NSObject, ASWebAuthenticationPresentationContextProviding {
    // Empty in project.yml by default → button hidden (env-gated like the rest).
    static var clientID: String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "SwaplGoogleOAuthClientID") as? String,
              !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return nil }
        return raw
    }

    static var isConfigured: Bool { clientID != nil }

    // ASWebAuthenticationSession must stay alive while the sheet is up.
    private var activeSession: ASWebAuthenticationSession?

    /// Runs the OAuth flow and returns the Google ID token on success.
    @MainActor
    func signIn() async throws -> String {
        guard let clientID = Self.clientID else { throw GoogleSignInError.notConfigured }
        // "123-abc.apps.googleusercontent.com" → "com.googleusercontent.apps.123-abc"
        let scheme = clientID.split(separator: ".").reversed().joined(separator: ".")

        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: "\(scheme):/oauth2redirect"),
            URLQueryItem(name: "response_type", value: "id_token"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            // Required by Google for id_token responses (replay protection).
            URLQueryItem(name: "nonce", value: Self.randomNonce()),
        ]
        guard let authURL = components.url else { throw GoogleSignInError.failed }

        let callbackURL: URL = try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: authURL, callbackURLScheme: scheme) { url, error in
                if let url {
                    continuation.resume(returning: url)
                } else if let authError = error as? ASWebAuthenticationSessionError,
                          authError.code == .canceledLogin {
                    continuation.resume(throwing: GoogleSignInError.canceled)
                } else {
                    continuation.resume(throwing: error ?? GoogleSignInError.failed)
                }
            }
            session.presentationContextProvider = self
            activeSession = session
            session.start()
        }
        activeSession = nil

        // The implicit flow returns the token in the URL fragment:
        // scheme:/oauth2redirect#id_token=...&...
        guard let idToken = Self.fragmentValue("id_token", in: callbackURL) else {
            throw GoogleSignInError.failed
        }
        return idToken
    }

    private static func fragmentValue(_ name: String, in url: URL) -> String? {
        guard let fragment = URLComponents(url: url, resolvingAgainstBaseURL: false)?.fragment else { return nil }
        var parser = URLComponents()
        parser.percentEncodedQuery = fragment
        return parser.queryItems?.first(where: { $0.name == name })?.value
    }

    private static func randomNonce() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else { return UUID().uuidString }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
        }
    }
}
