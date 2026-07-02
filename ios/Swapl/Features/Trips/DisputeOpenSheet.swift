import SwiftUI
import PhotosUI
import SwaplDesignTokens

// Open-a-dispute form (DOK-153): category picker → description → optional
// photos → POST. One scroll, mobile-first. Picking an urgent category (safety /
// access) foregrounds the 24/7 line inline so members in trouble see it before
// they finish typing. Photos reuse the shared listing-photo upload pipeline.
struct DisputeOpenSheet: View {
    let otherName: String?
    let isSubmitting: Bool
    let onCallLine: () -> Void
    // Returns true on success so the sheet can dismiss itself.
    let onSubmit: (_ category: DisputeCategory, _ description: String, _ photos: [String]) async -> Bool

    @Environment(\.dismiss) private var dismiss
    @State private var category: DisputeCategory?
    @State private var description = ""
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var photoURLs: [String] = []
    @State private var uploading = false
    @State private var uploadError: String?

    private var trimmed: String { description.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var isValid: Bool { category != nil && !trimmed.isEmpty && trimmed.count <= 4000 }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text("Tell us what's going on with your swap\(otherName.map { " with \($0)" } ?? ""). We'll loop in your swap partner and our support team.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)

                    categoryPicker

                    if category?.isUrgent == true {
                        DisputeUrgentBanner(onCallLine: onCallLine)
                    }

                    descriptionField

                    photosField

                    if let uploadError {
                        Text(uploadError)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                            .foregroundStyle(AirbnbPalette.destructive)
                    }

                    PrimaryPill(
                        title: "Send report",
                        action: { Task { await submit() } },
                        isLoading: isSubmitting,
                        isDisabled: !isValid || uploading
                    )
                }
                .padding(22)
            }
            // In landscape the software keyboard is tall enough to cover the
            // "Send report" pill while the description field is focused. Keep
            // the scroll content padded above the keyboard inset and let an
            // interactive swipe dismiss it, so the submit button is always
            // reachable above the keyboard.
            .safeAreaPadding(.bottom, 16)
            .scrollDismissesKeyboard(.interactively)
            .swaplScreenBackground()
            .navigationTitle("Report a problem")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSubmitting)
                }
            }
            .onChange(of: photoItems) { _, items in
                Task { await upload(items) }
            }
        }
        .presentationDetents([.large])
    }

    // MARK: category

    private var categoryPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            KickerLabel(text: "What happened?")
            VStack(spacing: 10) {
                ForEach(DisputeCategory.allCases) { item in
                    Button { category = item } label: {
                        HStack(spacing: 14) {
                            Image(systemName: item.icon)
                                .font(.system(size: 18))
                                .foregroundStyle(item.isUrgent ? AirbnbPalette.destructive : AirbnbPalette.text)
                                .frame(width: 30)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                                    .foregroundStyle(AirbnbPalette.text)
                                Text(item.subtitle)
                                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                                    .foregroundStyle(AirbnbPalette.secondaryText)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 0)
                            Image(systemName: category == item ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 20))
                                .foregroundStyle(category == item ? AirbnbPalette.text : AirbnbPalette.hairline)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                                .stroke(category == item ? AirbnbPalette.text : AirbnbPalette.hairline, lineWidth: category == item ? 1.5 : 1)
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(category == item ? .isSelected : [])
                }
            }
        }
    }

    // MARK: description

    private var descriptionField: some View {
        VStack(alignment: .leading, spacing: 10) {
            KickerLabel(text: "Describe the problem")
            TextEditor(text: $description)
                .font(.swaplBody(17))
                .frame(minHeight: 130)
                .padding(12)
                .scrollContentBackground(.hidden)
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay(alignment: .topLeading) {
                    if description.isEmpty {
                        Text("What happened, when, and what you need from us.")
                            .font(.swaplBody(17))
                            .foregroundStyle(AirbnbPalette.secondaryText.opacity(0.75))
                            .padding(.horizontal, 18)
                            .padding(.vertical, 20)
                            .allowsHitTesting(false)
                    }
                }
                .overlay {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                }
        }
    }

    // MARK: photos

    private var photosField: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                KickerLabel(text: "Photos (optional)")
                Spacer()
                if uploading { ProgressView() }
            }
            PhotosPicker(selection: $photoItems, maxSelectionCount: 12, matching: .images) {
                HStack(spacing: 10) {
                    Image(systemName: "camera")
                    Text(photoURLs.isEmpty ? String(localized: "Add photos") : String(localized: "Add more"))
                }
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous).stroke(AirbnbPalette.hairline))
            }
            if !photoURLs.isEmpty {
                DisputePhotoStrip(urls: photoURLs, onRemove: { url in photoURLs.removeAll { $0 == url } })
            }
        }
    }

    private func submit() async {
        guard let category, isValid, !isSubmitting else { return }
        _ = await onSubmit(category, trimmed, photoURLs)
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
                uploadError = String(localized: "Couldn't upload a photo. Check your connection and try again.")
            }
        }
        photoItems = []
    }
}

// MARK: - Removable photo strip (shared by the open form + reply composer)

struct DisputePhotoStrip: View {
    let urls: [String]
    let onRemove: (String) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(urls, id: \.self) { url in
                    AsyncImage(url: URL(string: url)) { img in
                        img.resizable().scaledToFill()
                    } placeholder: {
                        SwaplSemanticLight.muted
                    }
                    .frame(width: 84, height: 84)
                    .clipShape(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.small, style: .continuous))
                    .overlay(alignment: .topTrailing) {
                        Button { onRemove(url) } label: {
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
}

// MARK: - Read-only photo strip (timeline thumbnails)

struct DisputeThumbnailStrip: View {
    let urls: [String]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(urls, id: \.self) { url in
                    AsyncImage(url: URL(string: url)) { img in
                        img.resizable().scaledToFill()
                    } placeholder: {
                        SwaplSemanticLight.muted
                    }
                    .frame(width: 64, height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.small, style: .continuous))
                }
            }
        }
    }
}
