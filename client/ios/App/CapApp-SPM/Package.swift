// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.3.0"),
        .package(name: "CapacitorCommunityAdmob", path: "..\..\..\node_modules\@capacitor-community\admob"),
        .package(name: "CapacitorCommunityAppleSignIn", path: "..\..\..\node_modules\@capacitor-community\apple-sign-in"),
        .package(name: "CapacitorCommunityDevice", path: "..\..\..\node_modules\@capacitor-community\device"),
        .package(name: "CapacitorDevice", path: "..\..\..\node_modules\@capacitor\device"),
        .package(name: "CapawesomeCapacitorAppUpdate", path: "..\..\..\node_modules\@capawesome\capacitor-app-update")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCommunityAdmob", package: "CapacitorCommunityAdmob"),
                .product(name: "CapacitorCommunityAppleSignIn", package: "CapacitorCommunityAppleSignIn"),
                .product(name: "CapacitorCommunityDevice", package: "CapacitorCommunityDevice"),
                .product(name: "CapacitorDevice", package: "CapacitorDevice"),
                .product(name: "CapawesomeCapacitorAppUpdate", package: "CapawesomeCapacitorAppUpdate")
            ]
        )
    ]
)
