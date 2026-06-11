import XCTest

// Verifies the centralized deep-link routing in RootView: launching with a
// swapl:// URL (injected via the SWAPL_DEEPLINK_URL test hook, the same spirit
// as the SWAPL_API_BASE_URL override) must present the right detail screen.
// Unknown ids are fine — the routed screen's error state proves navigation
// happened, with no seeded data required.
final class DeepLinkRoutingTests: XCTestCase {

    func testProposalDeepLinkRoutesToTripScreen() throws {
        let app = launch(deepLink: "swapl://proposal/deeplink-uitest-id")
        loginIfNeeded(app)

        // RootView stashes the link until the session is ready, then presents
        // the proposal sheet; a bogus id lands on the Trip error state.
        let routed = app.staticTexts["Trip unavailable"].firstMatch
        XCTAssertTrue(routed.waitForExistence(timeout: 20), "Proposal deep link should open the Trip screen")
        save(app, "ios-deeplink-1-proposal-routed")
    }

    func testListingDeepLinkRoutesToHomeScreen() throws {
        let app = launch(deepLink: "swapl://listing/deeplink-uitest-id")
        loginIfNeeded(app)

        let routed = app.staticTexts["Home unavailable"].firstMatch
        XCTAssertTrue(routed.waitForExistence(timeout: 20), "Listing deep link should open the Home screen")
        save(app, "ios-deeplink-2-listing-routed")
    }

    private func launch(deepLink: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["SWAPL_API_BASE_URL"] = "http://localhost:3000"
        app.launchEnvironment["SWAPL_DEEPLINK_URL"] = deepLink
        app.launch()
        return app
    }

    private func loginIfNeeded(_ app: XCUIApplication) {
        let emailField = app.textFields["you@example.com"]
        if emailField.waitForExistence(timeout: 8) {
            emailField.tap()
            emailField.typeText("gert@dokuz.ai")
            let passwordField = app.secureTextFields["password"]
            passwordField.tap()
            passwordField.typeText("swapl-demo")
            app.buttons["Sign in"].firstMatch.tap()
        }
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
