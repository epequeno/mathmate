// swift-tools-version: 6.3
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "MathMate",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(
            name: "MathMate",
            targets: ["MathMate"]
        ),
    ],
    targets: [
        // Targets are the basic building blocks of a package, defining a module or a test suite.
        // Targets can depend on other targets in this package and products from dependencies.
        .executableTarget(
            name: "MathMate",
            resources: [
                .process("Resources")
            ]
        ),
        .testTarget(
            name: "MathMateTests",
            dependencies: ["MathMate"]
        ),
    ],
    swiftLanguageModes: [.v6]
)
