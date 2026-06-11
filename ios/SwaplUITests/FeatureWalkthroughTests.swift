import XCTest

// Drives the three new features against the local dev server and saves
// verification screenshots to /tmp/ios-feat-*.png.
final class FeatureWalkthroughTests: XCTestCase {

    func testFiltersTypeaheadAndWishlists() throws {
        let app = XCUIApplication()
        app.launchEnvironment["SWAPL_API_BASE_URL"] = "http://localhost:3000"
        app.launch()

        // --- Login (skipped if a session is already cached) ---
        let emailField = app.textFields["you@example.com"]
        if emailField.waitForExistence(timeout: 8) {
            emailField.tap()
            emailField.typeText("gert@dokuz.ai")
            let passwordField = app.secureTextFields["password"]
            passwordField.tap()
            passwordField.typeText("swapl-demo")
            app.buttons["Sign in"].firstMatch.tap()
        }

        // --- Browse loads ---
        let searchBar = app.buttons["Search and filters"].firstMatch
        XCTAssertTrue(searchBar.waitForExistence(timeout: 15), "Browse search bar should appear after login")
        sleep(2)

        // --- 1. Open the filter sheet ---
        // SwiftUI sometimes reports the capsule button as non-hittable; tap by coordinate.
        searchBar.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let destinationField = app.textFields["Search destination cities"]
        XCTAssertTrue(destinationField.waitForExistence(timeout: 8), "Filter sheet should open with destination field")
        sleep(1)
        save(app, "ios-feat-1-filter-sheet")

        // --- 2. Type-ahead for "ist" ---
        destinationField.tap()
        destinationField.typeText("ist")
        let suggestion = app.staticTexts["Istanbul"].firstMatch
        XCTAssertTrue(suggestion.waitForExistence(timeout: 8), "Istanbul suggestion should appear")
        sleep(1)
        save(app, "ios-feat-2-typeahead-ist")

        // Select Istanbul, set a must-have for a visible badge count > 1.
        suggestion.tap()
        let pets = app.switches["Pet-friendly"].firstMatch
        if pets.waitForExistence(timeout: 4) { pets.tap() }

        // --- Apply ---
        app.buttons["Apply filters and show homes"].firstMatch.tap()

        // --- 3. Browse filtered ---
        let filteredBar = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Search and filters,'")).firstMatch
        XCTAssertTrue(filteredBar.waitForExistence(timeout: 15), "Filtered browse should show active filter badge")
        sleep(2)
        save(app, "ios-feat-3-browse-filtered")

        // --- 4. Heart a card ---
        let heart = app.buttons["Save to wishlist"].firstMatch
        XCTAssertTrue(heart.waitForExistence(timeout: 8), "Heart button should exist on cards")
        heart.tap()
        let filledHeart = app.buttons["Remove from wishlist"].firstMatch
        XCTAssertTrue(filledHeart.waitForExistence(timeout: 8), "Heart should fill after tap")
        sleep(1)
        save(app, "ios-feat-4-card-heart-filled")

        // --- 5. Wishlists tab populated ---
        app.tabBars.buttons["Wishlists"].tap()
        let removeHeart = app.buttons["Remove from wishlist"].firstMatch
        XCTAssertTrue(removeHeart.waitForExistence(timeout: 15), "Wishlist should show saved homes")
        sleep(2)
        save(app, "ios-feat-5-wishlists-populated")
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
