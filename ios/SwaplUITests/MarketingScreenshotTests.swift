import XCTest

// Captures marketing screenshots against the local dev server and saves them
// to /tmp/ios-mkt-*.png (browse, listing detail, trips, messages, wishlists).
final class MarketingScreenshotTests: XCTestCase {

    func testCaptureMarketingScreens() throws {
        let app = XCUIApplication()
        app.launchEnvironment["SWAPL_API_BASE_URL"] = "http://localhost:3000"
        app.launch()

        // --- Login (skipped if a session is already cached) ---
        let emailField = app.textFields["you@example.com"]
        if emailField.waitForExistence(timeout: 8) {
            robustType(emailField, text: "gert@dokuz.ai", secure: false)
            let passwordField = app.secureTextFields["password"]
            robustType(passwordField, text: "swapl-demo", secure: true)
            app.buttons["Sign in"].firstMatch.tap()

            // Wait for the login screen to actually go away.
            let gone = NSPredicate(format: "exists == false")
            let exp = expectation(for: gone, evaluatedWith: emailField)
            wait(for: [exp], timeout: 20)
        }

        // Dismiss the iOS save-password prompt if it appears (any locale).
        sleep(3)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for label in ["Not Now", "Non ora", "Save", "Salva"] {
            let button = springboard.buttons[label].firstMatch
            if button.exists {
                button.tap()
                sleep(1)
                break
            }
        }

        // --- 1. Browse with photos ---
        let searchBar = app.buttons["Search and filters"].firstMatch
        XCTAssertTrue(searchBar.waitForExistence(timeout: 20), "Browse search bar should appear after login")
        sleep(5) // let photos load
        save(app, "ios-mkt-1-browse")

        // --- 2. Listing detail: tap the first listing card ---
        let card = app.buttons.matching(
            NSPredicate(format: "label CONTAINS 'match' OR label CONTAINS 'Guest favorite'")
        ).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 10), "A listing card should exist on browse")
        card.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)).tap()
        // Confirm we actually navigated to the detail screen.
        let detailMarker = app.staticTexts["About this home"].firstMatch
        XCTAssertTrue(detailMarker.waitForExistence(timeout: 10), "Listing detail should open after tapping a card")
        sleep(5) // detail + gallery load
        save(app, "ios-mkt-2-listing-detail")

        // --- 3. Trips tab ---
        app.tabBars.buttons["Trips"].tap()
        sleep(4)
        save(app, "ios-mkt-3-trips")

        // --- 4. Messages tab ---
        app.tabBars.buttons["Messages"].tap()
        sleep(4)
        save(app, "ios-mkt-4-messages")

        // --- 5. Wishlists tab (bonus pick) ---
        app.tabBars.buttons["Wishlists"].tap()
        sleep(4)
        save(app, "ios-mkt-5-wishlists")
    }

    /// Types `text` into `field`, verifying the resulting value and retrying:
    /// the simulator keyboard occasionally drops characters under load.
    private func robustType(_ field: XCUIElement, text: String, secure: Bool) {
        for _ in 0..<3 {
            field.tap()
            sleep(1)
            // Clear any partial input from a previous attempt.
            if let current = field.value as? String, !current.isEmpty,
               current != "you@example.com", current != "password" {
                let deletes = String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 4)
                field.typeText(deletes)
            }
            field.typeText(text)
            sleep(1)
            let value = (field.value as? String) ?? ""
            // Secure fields render bullets; only length is checkable.
            if secure ? value.count == text.count : value == text { return }
        }
        XCTFail("Could not reliably type into \(field)")
    }

    private func save(_ app: XCUIApplication, _ name: String) {
        let png = XCUIScreen.main.screenshot().pngRepresentation
        try? png.write(to: URL(fileURLWithPath: "/tmp/\(name).png"))
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
