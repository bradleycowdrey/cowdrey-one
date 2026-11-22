// Cowdrey One on iPhone and iPad: an app's App Store page, shown inside Cowdrey One (Apple's
// SKStoreProductViewController), so getting each app is Get, confirm, and on to the next. iOS never lets one app
// install another, so this is as close to "get them all" as an iPhone allows. The page is shown from a full-screen
// window of its own, as Cowdrey.MD and Cowdrey.PDF show their share sheets.

import Foundation
import StoreKit
import SwiftRs
import Tauri
import UIKit
import WebKit

struct StoreArgs: Decodable {
  let id: String  // the App Store ID, the number after "id" in an apps.apple.com link
}

class InstallerPlugin: Plugin, SKStoreProductViewControllerDelegate {
  var webview: WKWebView!
  private var pending: Invoke?
  private var overlay: UIWindow?

  public override func load(webview: WKWebView) {
    self.webview = webview
  }

  @objc public func showStore(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(StoreArgs.self)
    DispatchQueue.main.async {
      if self.pending != nil {
        invoke.reject("The App Store is already open")
        return
      }
      guard let from = self.overlayController() else {
        invoke.reject("There's no window to show the App Store in")
        return
      }
      let store = SKStoreProductViewController()
      store.delegate = self
      self.pending = invoke
      from.present(store, animated: true)
      store.loadProduct(withParameters: [SKStoreProductParameterITunesItemIdentifier: args.id]) { loaded, error in
        if loaded { return }
        DispatchQueue.main.async {
          store.dismiss(animated: true) {
            self.finish(error: error?.localizedDescription ?? "The App Store page didn't open")
          }
        }
      }
    }
  }

  func productViewControllerDidFinish(_ viewController: SKStoreProductViewController) {
    viewController.dismiss(animated: true) {
      self.finish(error: nil)
    }
  }

  private func finish(error: String?) {
    closeOverlay()
    guard let invoke = pending else { return }
    pending = nil
    if let error = error {
      invoke.reject(error)
    } else {
      invoke.resolve()
    }
  }

  private func overlayController() -> UIViewController? {
    if let w = overlay, let vc = w.rootViewController {
      var top: UIViewController = vc
      while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
      return top
    }
    let screen = self.webview.window?.windowScene?.screen ?? UIScreen.main
    let w: UIWindow
    if let scene = self.webview.window?.windowScene {
      w = UIWindow(windowScene: scene)
    } else {
      w = UIWindow(frame: screen.bounds)
    }
    w.frame = screen.bounds
    w.windowLevel = UIWindow.Level(rawValue: UIWindow.Level.normal.rawValue + 1)
    w.backgroundColor = .clear
    let vc = UIViewController()
    vc.view.backgroundColor = .clear
    w.rootViewController = vc
    w.overrideUserInterfaceStyle = self.webview.window?.traitCollection.userInterfaceStyle ?? .unspecified
    w.makeKeyAndVisible()
    overlay = w
    return vc
  }

  private func closeOverlay() {
    guard let w = overlay else { return }
    overlay = nil
    w.isHidden = true
    w.rootViewController = nil
    self.webview.window?.makeKeyAndVisible()
  }
}

@_cdecl("init_plugin_installer")
func initPlugin() -> Plugin {
  return InstallerPlugin()
}
