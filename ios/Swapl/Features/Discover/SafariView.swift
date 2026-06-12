import SwiftUI
import SafariServices

// In-app browser for affiliate click-throughs (Experiences & Services). The
// resolved URL always points at /api/affiliate/{partner} on the API origin so
// the click is logged before the partner redirect.
struct SafariItem: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
