// swift-tools-version:6.0
import PackageDescription

// Generates Swift types + a client for the Swapl API from the shared OpenAPI
// contract (Sources/SwaplAPIClient/openapi.yaml, copied from @swapl/api-spec)
// via Apple's swift-openapi-generator build plugin. The iOS app depends on the
// `SwaplAPIClient` product, so generated DTOs stay in lockstep with the API.
let package = Package(
    name: "SwaplAPIClient",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "SwaplAPIClient", targets: ["SwaplAPIClient"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.0.0"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.0.0"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", from: "1.0.0"),
    ],
    targets: [
        .target(
            name: "SwaplAPIClient",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
            ],
            plugins: [
                .plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator"),
            ]
        ),
    ]
)
