import XCTest

// Drives: open a listing → Propose → Draft with AI → message filled.
// Saves verification screenshots to /tmp/ios-aidraft-*.png.
final class AIDraftProposalTests: XCTestCase {

    func testDraftWithAIFillsProposalMessage() throws {
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

        // --- Open a listing the viewer doesn't own ---
        let card = app.staticTexts["Seoul, KR"].firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 20), "Explore should show listing cards")
        sleep(1)
        card.tap()

        // --- Propose ---
        let propose = app.buttons["Propose"].firstMatch
        XCTAssertTrue(propose.waitForExistence(timeout: 15), "Listing detail should show the Propose CTA")
        sleep(1)
        propose.tap()

        // --- Draft with AI ---
        let draftButton = app.buttons["Draft message with AI"].firstMatch
        XCTAssertTrue(draftButton.waitForExistence(timeout: 10), "Proposal sheet should show the Draft with AI button")
        save(app, "ios-aidraft-1-composer-empty")
        // The button's accessibility frame spans the whole Form row while the
        // visible capsule sits at the leading edge — tap there, not the center.
        draftButton.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.5)).tap()

        // The caption appears once a draft (backend or on-device) landed.
        let caption = app.staticTexts.matching(
            NSPredicate(format: "label == 'Drafted with AI' OR label == 'Drafted on-device'")
        ).firstMatch
        XCTAssertTrue(caption.waitForExistence(timeout: 60), "Draft caption should appear after drafting")

        // The message editor should now contain a non-trivial draft.
        let editor = app.textViews.firstMatch
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        let text = (editor.value as? String) ?? ""
        XCTAssertGreaterThan(text.count, 40, "Drafted message should fill the editor (got: \(text))")
        sleep(1)
        save(app, "ios-aidraft-2-composer-drafted")
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
