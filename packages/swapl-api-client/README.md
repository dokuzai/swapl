# SwaplAPIClient

Generates Swift types + a `Client` for the Swapl API from the shared OpenAPI
contract using Apple's [swift-openapi-generator](https://github.com/apple/swift-openapi-generator)
build plugin. This keeps the iOS DTOs in lockstep with `@swapl/api-spec`.

`Sources/SwaplAPIClient/openapi.yaml` is copied from the canonical spec
(`packages/api-spec/openapi.yaml`). Resync after a contract change:

```bash
pnpm --filter @swapl/api-spec gen:swift-spec   # copies openapi.yaml here
swift build                                    # regenerates Client/Types/Server
```

`swift build` validates that the spec generates and compiles (no committed
generated sources — the plugin produces them at build time).

## Adding it to the iOS app

The app target references local packages via `XCLocalSwiftPackageReference`
(same mechanism as `SwaplDesignTokens`). In Xcode:

1. **File → Add Package Dependencies… → Add Local…** → select
   `packages/swapl-api-client` → add the **SwaplAPIClient** product to the
   **Swapl** target.
2. Trust the build-tool plugin when prompted. For headless builds, pass
   `-skipPackagePluginValidation` to `xcodebuild`.

Then adopt incrementally — replace a hand-written DTO (e.g. `Listing`) with the
generated `Components.Schemas.Listing`, or call the generated `Client` for an
endpoint, verifying parity as you go. The existing hand-written models already
match the contract, so this can be done file-by-file without a big-bang switch.

> Integration into the `.xcodeproj` is intentionally left as the above step
> rather than hand-edited into `project.pbxproj`: it involves package + product
> references plus build-tool-plugin trust, which Xcode manages safely through
> its UI.
