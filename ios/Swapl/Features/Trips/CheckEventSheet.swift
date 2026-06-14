import SwiftUI
import PhotosUI
import SwaplDesignTokens

// Check in / Check out sheet (DOK-152): baseline photos via PhotosPicker +
// optional note, uploaded through the existing listing-photo pipeline so the
// whole app shares one downscale + multipart upload path.
struct CheckEventSheet: View {
    let kind: TripCockpitView.CheckEventKind
    let isSubmitting: Bool
    let onSubmit: (_ note: String, _ photos: [String]) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var photoURLs: [String] = []
    @State private var uploading = false
    @State private var uploadError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(kind == .checkIn
                         ? "Snap a few baseline photos of the home as you arrive — it protects you both if anything's queried later."
                         : "Snap a few photos as you leave, so the state of the home is on record.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)

                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("Baseline photos")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                            Spacer()
                            if uploading { ProgressView() }
                        }
                        PhotosPicker(selection: $photoItems, maxSelectionCount: 8, matching: .images) {
                            HStack(spacing: 10) {
                                Image(systemName: "camera")
                                Text(photoURLs.isEmpty ? "Add photos" : "Add more")
                            }
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.text)
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous).stroke(AirbnbPalette.hairline))
                        }
                        if !photoURLs.isEmpty {
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 10) {
                                    ForEach(photoURLs, id: \.self) { url in
                                        AsyncImage(url: URL(string: url)) { img in
                                            img.resizable().scaledToFill()
                                        } placeholder: {
                                            SwaplSemanticLight.muted
                                        }
                                        .frame(width: 84, height: 84)
                                        .clipShape(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.small, style: .continuous))
                                        .overlay(alignment: .topTrailing) {
                                            Button { photoURLs.removeAll { $0 == url } } label: {
                                                Image(systemName: "xmark.circle.fill")
                                                    .font(.system(size: 18, weight: .semibold))
                                                    .symbolRenderingMode(.palette)
                                                    .foregroundStyle(SwaplSemanticLight.primaryForeground, Color.black.opacity(0.55))
                                                    .padding(4)
                                            }
                                            .accessibilityLabel("Remove photo")
                                        }
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                        }
                        if let uploadError {
                            Text(uploadError)
                                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                                .foregroundStyle(AirbnbPalette.destructive)
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Note (optional)")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.text)
                        TextField("e.g. everything looks great, keys collected", text: $note, axis: .vertical)
                            .lineLimit(3...6)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                            .padding(14)
                            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous).stroke(AirbnbPalette.hairline))
                    }

                    PrimaryPill(
                        title: kind.title,
                        action: { Task { await onSubmit(note, photoURLs) } },
                        isLoading: isSubmitting,
                        isDisabled: uploading
                    )
                }
                .padding(22)
            }
            .background(SwaplSemanticLight.background.ignoresSafeArea())
            .navigationTitle(kind.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onChange(of: photoItems) { _, items in
                Task { await upload(items) }
            }
        }
        .presentationDetents([.large])
    }

    private func upload(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        uploading = true
        uploadError = nil
        defer { uploading = false }
        for item in items {
            guard
                let data = try? await item.loadTransferable(type: Data.self),
                let jpeg = SwaplImage.downscaledJPEG(from: data)
            else { continue }
            do {
                let url = try await APIClient.shared.uploadListingPhoto(jpeg)
                if !photoURLs.contains(url) { photoURLs.append(url) }
            } catch {
                uploadError = "Couldn't upload a photo. Check your connection and try again."
            }
        }
        photoItems = []
    }
}
