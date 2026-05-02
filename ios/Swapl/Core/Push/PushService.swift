import Foundation
import UIKit
import UserNotifications
import Observation

// Handles APNs registration and routes incoming push payloads via
// `pendingDeepLink`, which RootView observes to navigate.
@Observable
final class PushService: NSObject, UNUserNotificationCenterDelegate {
    var permissionStatus: UNAuthorizationStatus = .notDetermined
    var pendingDeepLink: URL?

    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    func requestAuthorization() async {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            permissionStatus = granted ? .authorized : .denied
            if granted {
                await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
            }
        } catch {
            print("[push] request failed: \(error)")
        }
    }

    // Called by SwaplApp.app(_:didRegisterForRemoteNotificationsWithDeviceToken:)
    func registerDevice(deviceToken: Data) async {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        struct Body: Encodable { let platform: String; let pushToken: String; let appVersion: String? }
        let body = Body(
            platform: "ios",
            pushToken: token,
            appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        )
        _ = try? await APIClient.shared.send(
            "POST", "/api/devices", body: body, as: DeviceResponse.self
        )
    }

    private struct DeviceResponse: Decodable { let ok: Bool; let deviceId: String? }

    // Foreground presentation — show banner.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    // Tap handler — extract deepLink from FCM data payload.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if let raw = response.notification.request.content.userInfo["deepLink"] as? String,
           let url = URL(string: raw) {
            pendingDeepLink = url
        }
        completionHandler()
    }
}
