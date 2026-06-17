import Foundation
import CoreLocation

// Daily coarse-location ping for Swapalitics "days abroad". Strictly opt-in: it
// does nothing unless the user enabled "Count my days abroad". When enabled, it
// asks the device for a single coarse fix once a day, reverse-geocodes it to a
// country/region/city, and POSTs it. With no fix it still pings empty so the
// server can fall back to geo-IP. Only coarse data leaves the device — never
// exact coordinates. The server enforces the same opt-in independently.
@MainActor
final class LocationPingService: NSObject {
    static let shared = LocationPingService()

    private let manager = CLLocationManager()
    private var locationContinuation: CheckedContinuation<CLLocation?, Never>?
    private var authContinuation: CheckedContinuation<Void, Never>?
    private let defaultsKey = "locationPing.lastDay"

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    // Called on launch. Pings at most once a day, and only if opted in.
    func pingIfDue() async {
        let today = Self.dayString()
        if UserDefaults.standard.string(forKey: defaultsKey) == today { return }

        guard await isOptedIn() else {
            // Mark done so we don't re-check the setting every launch today.
            UserDefaults.standard.set(today, forKey: defaultsKey)
            return
        }
        await performPing()
        UserDefaults.standard.set(today, forKey: defaultsKey)
    }

    // Called the moment the user turns the toggle on — prompt for permission
    // (if undecided) and record straight away.
    func pingNow() async {
        if manager.authorizationStatus == .notDetermined {
            await requestPermission()
        }
        await performPing()
        UserDefaults.standard.set(Self.dayString(), forKey: defaultsKey)
    }

    private func isOptedIn() async -> Bool {
        (try? await ProfileRepository.shared.settings().countDaysAbroad) == true
    }

    private func performPing() async {
        let fix = await coarseFix()
        _ = try? await SwapaliticsRepository.shared.pingLocation(fix)
    }

    // A coarse country/region/city, or nil to let the server use geo-IP.
    private func coarseFix() async -> LocationFix? {
        guard manager.authorizationStatus == .authorizedWhenInUse
            || manager.authorizationStatus == .authorizedAlways else {
            return nil
        }
        guard let location = await requestOneShot() else { return nil }
        let geocoder = CLGeocoder()
        guard let placemark = try? await geocoder.reverseGeocodeLocation(location).first,
              let country = placemark.isoCountryCode else {
            return nil
        }
        return LocationFix(
            countryCode: country,
            region: placemark.administrativeArea,
            city: placemark.locality
        )
    }

    private func requestPermission() async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            self.authContinuation = cont
            self.manager.requestWhenInUseAuthorization()
        }
    }

    private func requestOneShot() async -> CLLocation? {
        await withCheckedContinuation { (cont: CheckedContinuation<CLLocation?, Never>) in
            self.locationContinuation = cont
            self.manager.requestLocation()
        }
    }

    private func resumeLocation(_ location: CLLocation?) {
        locationContinuation?.resume(returning: location)
        locationContinuation = nil
    }

    private static func dayString() -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }
}

extension LocationPingService: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        let location = locations.last
        Task { @MainActor in self.resumeLocation(location) }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.resumeLocation(nil) }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            if manager.authorizationStatus != .notDetermined {
                self.authContinuation?.resume()
                self.authContinuation = nil
            }
        }
    }
}

struct LocationFix: Sendable {
    let countryCode: String
    let region: String?
    let city: String?
}
