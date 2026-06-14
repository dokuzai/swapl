import UIKit

// Shared image downscale before upload. Re-encodes HEIC/large originals to a
// reasonably-sized JPEG so they upload reliably under the server's size cap.
// Used by the listing photo picker and the trip check-in/out baseline photos.
enum SwaplImage {
    static func downscaledJPEG(from data: Data, maxDimension: CGFloat = 1600, quality: CGFloat = 0.8) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let longest = max(image.size.width, image.size.height)
        let scale = longest > maxDimension ? maxDimension / longest : 1
        if scale >= 1 { return image.jpegData(compressionQuality: quality) }
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        let resized = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
        return resized.jpegData(compressionQuality: quality)
    }
}
