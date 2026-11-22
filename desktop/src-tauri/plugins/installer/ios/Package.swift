// swift-tools-version:5.7

import PackageDescription

let package = Package(
  name: "tauri-plugin-installer",
  platforms: [
    .iOS(.v15)
  ],
  products: [
    .library(
      name: "tauri-plugin-installer",
      type: .static,
      targets: ["tauri-plugin-installer"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-installer",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
