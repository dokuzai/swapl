# iOS agent rules

- **Never leave a view's body as a bare conditional with no exhaustive else.**
  If every branch can be false in the initial state, SwiftUI renders an
  EmptyView and modifiers like `.task`/`.onAppear` NEVER fire — the screen
  stays blank forever. This bug shipped twice (MetricsView 4fadaf9,
  TravelProfileView 00b57ee). Pattern to use: wrap in a `ZStack` whose first
  layer is `SwaplSemanticLight.background.ignoresSafeArea()` and make the
  loading branch the default (`data == nil && error == nil`).
- Sections fed by user data must render an **empty state** (muted copy), not
  disappear — a hidden section reads as a broken feature to the founder.
- The Xcode project is generated: edit `project.yml`, then run
  `xcodegen generate`. Never hand-edit `project.pbxproj`, `Info.plist`, or
  entitlements directly; signing (team 65H83C7GYT) lives in `project.yml`.
