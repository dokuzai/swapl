// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SwaplDesignTokens",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "SwaplDesignTokens", targets: ["SwaplDesignTokens"]),
    ],
    targets: [
        .target(
            name: "SwaplDesignTokens",
            path: ".",
            sources: ["SwaplTokens.swift"]
        ),
    ]
)
