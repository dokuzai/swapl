# swapl — iOS (iPhone + iPad)

SwiftUI app, iOS 17 / iPadOS 17 minimum.

## Project setup (one-time)

This folder contains the source tree, not a generated `.xcodeproj`. Open it
in Xcode 16 by:

1. **File → New → Project → iOS App** named `Swapl`, organisation
   identifier `app.swapl`, interface **SwiftUI**, language **Swift**, storage
   **None** (we use SwiftData manually).
2. Delete the auto-generated `ContentView.swift` and `SwaplApp.swift`.
3. Drag the contents of `ios/Swapl/` into the project, picking
   *Create groups* and *Copy items if needed = OFF*.
4. Add the design tokens as a Swift Package:
   File → Add Package Dependencies → **Add Local…** →
   `packages/design-tokens/build/swift/` (you may need to wrap that file in a
   minimal `Package.swift` — see "Local SwaplTokens module" below).
5. Add the bundled fonts (`Resources/Fonts/`) to *Build Phases →
   Copy Bundle Resources* and list them under
   `UIAppFonts` in Info.plist.
6. Set the deployment target to **iOS 17.0**, supported destinations
   **iPhone + iPad**.
7. Add the App Groups capability and the Push Notifications capability.

The `lib/` reference docs (Nuke for images, Stripe Mobile SDK for payments)
should be added via SPM:
- `https://github.com/kean/Nuke` — image loading
- `https://github.com/stripe/stripe-ios` — payments
- `https://github.com/firebase/firebase-ios-sdk` — Firebase Messaging

## Local SwaplTokens module

To consume `packages/design-tokens/build/swift/SwaplTokens.swift` as an SPM
package, drop this `Package.swift` next to it:

```swift
// swift-tools-version: 5.9
import PackageDescription
let package = Package(
  name: "SwaplDesignTokens",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [.library(name: "SwaplDesignTokens", targets: ["SwaplDesignTokens"])],
  targets: [.target(name: "SwaplDesignTokens", path: ".", sources: ["SwaplTokens.swift"])]
)
```

Then `import SwaplDesignTokens` from anywhere in the app.

## Architecture

See `Swapl/` for the layout — `App/`, `Core/`, `Design/`, `Features/`,
`Resources/`. Networking uses `URLSession` + async/await. State management
uses `@Observable` (Swift 5.9+).

## Running the app

```bash
xcodebuild test -scheme Swapl \
  -destination 'platform=iOS Simulator,name=iPhone 16'
xcodebuild test -scheme Swapl \
  -destination 'platform=iOS Simulator,name=iPad Pro 13-inch'
```

For a quick smoke test, log in with the seed account
`asli@demo.swapl` / `swapl-demo` against a local backend:

```bash
# in app/
npm run dev      # http://localhost:3000
```

Set `SWAPL_API_BASE_URL` in the Xcode scheme's Environment Variables to
`http://localhost:3000` — the `APIClient` reads it at startup.
