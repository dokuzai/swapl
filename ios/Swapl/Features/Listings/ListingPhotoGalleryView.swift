import SwiftUI
import SwaplDesignTokens

/// Hero gallery for the listing detail screen.
///
/// When the listing has uploaded photos it shows a paged, swipeable gallery
/// over all of them with a "2 / 5" counter chip; tapping any photo opens the
/// full-screen lightbox. When the listing has no photos it falls back to the
/// existing single `ListingPhotoView` (curated stock / postcard illustration).
struct ListingPhotoGalleryView: View {
    let listing: Listing

    @State private var currentIndex = 0
    @State private var lightbox: LightboxSelection?

    private var photoURLs: [URL] {
        listing.photos.compactMap { raw in
            raw.isEmpty ? nil : URL(string: raw)
        }
    }

    var body: some View {
        if photoURLs.isEmpty {
            ListingPhotoView(listing: listing, cornerRadius: 0)
        } else {
            TabView(selection: $currentIndex) {
                ForEach(Array(photoURLs.enumerated()), id: \.offset) { index, url in
                    GalleryPhotoPage(url: url, palette: listing.palette)
                        .tag(index)
                        .onTapGesture { lightbox = LightboxSelection(index: index) }
                        .accessibilityLabel("Photo \(index + 1) of \(photoURLs.count). Double tap to view full screen.")
                        .accessibilityAddTraits(.isButton)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: photoURLs.count > 1 ? .automatic : .never))
            .indexViewStyle(.page(backgroundDisplayMode: .interactive))
            .overlay(alignment: .bottomTrailing) {
                if photoURLs.count > 1 {
                    PhotoCounterChip(current: currentIndex + 1, total: photoURLs.count)
                        .padding(14)
                }
            }
            .fullScreenCover(item: $lightbox) { selection in
                PhotoLightboxView(urls: photoURLs, initialIndex: selection.index)
            }
        }
    }
}

// Drives `fullScreenCover(item:)` so the lightbox opens on the exact photo
// that was tapped (a Bool + separate index can race the cover presentation).
private struct LightboxSelection: Identifiable {
    let index: Int
    var id: Int { index }
}

/// One page of the hero gallery: fills its frame, clips overflow, and shows a
/// progress placeholder / illustrated fallback while loading or on failure.
private struct GalleryPhotoPage: View {
    let url: URL
    let palette: String

    var body: some View {
        Color.clear
            .overlay {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    case .failure:
                        CityIllust(palette: SwaplCityPalettes.forName(palette))
                    case .empty:
                        ZStack {
                            SwaplSemanticLight.muted
                            ProgressView()
                        }
                    @unknown default:
                        SwaplSemanticLight.muted
                    }
                }
            }
            .clipped()
            .contentShape(Rectangle())
    }
}

/// "2 / 5" chip, mono font, used by both the hero gallery and the lightbox.
private struct PhotoCounterChip: View {
    let current: Int
    let total: Int
    var onDark = false

    var body: some View {
        Text("\(current) / \(total)")
            .font(.swaplMono(SwaplDesignSystem.FontSize.small, weight: .semibold))
            .foregroundStyle(onDark ? .white : AirbnbPalette.text)
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(
                onDark ? Color.white.opacity(0.18) : Color.white.opacity(0.92),
                in: Capsule()
            )
            .accessibilityLabel("Photo \(current) of \(total)")
    }
}

/// Full-screen photo viewer: black background, paged swipe between photos,
/// pinch / double-tap to zoom, counter at top, 44pt close button.
struct PhotoLightboxView: View {
    let urls: [URL]
    let initialIndex: Int

    @Environment(\.dismiss) private var dismiss
    @State private var currentIndex: Int

    init(urls: [URL], initialIndex: Int) {
        self.urls = urls
        self.initialIndex = initialIndex
        _currentIndex = State(initialValue: min(max(initialIndex, 0), max(urls.count - 1, 0)))
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            TabView(selection: $currentIndex) {
                ForEach(Array(urls.enumerated()), id: \.offset) { index, url in
                    ZoomablePhotoView(url: url)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()
        }
        .overlay(alignment: .top) {
            HStack {
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Color.white.opacity(0.18), in: Circle())
                }
                .accessibilityLabel("Close photo viewer")

                Spacer()

                if urls.count > 1 {
                    PhotoCounterChip(current: currentIndex + 1, total: urls.count, onDark: true)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .statusBarHidden()
        .preferredColorScheme(.dark)
    }
}

/// A single zoomable photo: pinch to zoom (1x–4x), double-tap to toggle
/// 1x/2.5x, drag to pan while zoomed. The pan gesture is only attached while
/// zoomed in — a drag gesture at 1x (even a simultaneous one) starves the
/// enclosing TabView's page swipe, which is also why there's no
/// swipe-down-to-dismiss: the X button closes the viewer.
private struct ZoomablePhotoView: View {
    let url: URL

    @State private var scale: CGFloat = 1
    @State private var steadyScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var steadyOffset: CGSize = .zero

    private let minScale: CGFloat = 1
    private let maxScale: CGFloat = 4

    var body: some View {
        GeometryReader { proxy in
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFit()
                        .frame(width: proxy.size.width, height: proxy.size.height)
                        .scaleEffect(scale)
                        .offset(offset)
                        .gesture(zoomGesture)
                        // High priority so panning a zoomed photo beats the
                        // TabView's page swipe; fully disabled at 1x so the
                        // page swipe works (any active drag would starve it).
                        .highPriorityGesture(panGesture(in: proxy.size), including: steadyScale > 1.01 ? .all : .subviews)
                        .onTapGesture(count: 2) { toggleZoom() }
                        .accessibilityLabel("Listing photo")
                        .accessibilityAddTraits(.isImage)
                case .failure:
                    VStack(spacing: 12) {
                        Image(systemName: "photo.badge.exclamationmark")
                            .font(.system(size: 36))
                            .foregroundStyle(.white.opacity(0.7))
                        Text("Couldn't load this photo")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    .frame(width: proxy.size.width, height: proxy.size.height)
                case .empty:
                    ProgressView()
                        .tint(.white)
                        .frame(width: proxy.size.width, height: proxy.size.height)
                @unknown default:
                    Color.clear
                }
            }
        }
    }

    private var zoomGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                scale = min(max(steadyScale * value, minScale * 0.8), maxScale)
            }
            .onEnded { _ in
                steadyScale = min(max(scale, minScale), maxScale)
                withAnimation(.spring(duration: 0.25)) {
                    scale = steadyScale
                    if steadyScale <= minScale {
                        offset = .zero
                        steadyOffset = .zero
                    }
                }
            }
    }

    private func panGesture(in size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 1)
            .onChanged { value in
                offset = CGSize(
                    width: steadyOffset.width + value.translation.width,
                    height: steadyOffset.height + value.translation.height
                )
            }
            .onEnded { _ in
                steadyOffset = clampedPan(offset, in: size)
                withAnimation(.spring(duration: 0.25)) { offset = steadyOffset }
            }
    }

    private func toggleZoom() {
        withAnimation(.spring(duration: 0.3)) {
            if steadyScale > 1.01 {
                steadyScale = 1
                scale = 1
                offset = .zero
                steadyOffset = .zero
            } else {
                steadyScale = 2.5
                scale = 2.5
            }
        }
    }

    /// Keeps the pan within the photo's scaled bounds so it can't fly off-screen.
    private func clampedPan(_ proposed: CGSize, in size: CGSize) -> CGSize {
        let maxX = size.width * (steadyScale - 1) / 2
        let maxY = size.height * (steadyScale - 1) / 2
        return CGSize(
            width: min(max(proposed.width, -maxX), maxX),
            height: min(max(proposed.height, -maxY), maxY)
        )
    }
}
