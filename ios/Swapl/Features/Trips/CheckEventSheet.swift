import SwiftUI
import PhotosUI
import UIKit
import UniformTypeIdentifiers
import SwaplDesignTokens

// Check in / Check out sheet (DOK-152): baseline photos via PhotosPicker +
// optional note + an optional before/after condition video (audio narration
// baked in), uploaded through the native multipart pipeline.
struct CheckEventSheet: View {
    let kind: TripCockpitView.CheckEventKind
    let isSubmitting: Bool
    let onSubmit: (_ note: String, _ photos: [String], _ videoUrl: String?) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var photoURLs: [String] = []
    @State private var uploading = false
    @State private var uploadError: String?
    @State private var videoItem: PhotosPickerItem?
    @State private var videoURL: String?
    @State private var uploadingVideo = false
    @State private var showCamera = false

    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

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

                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("Condition video (optional)")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                            Spacer()
                            if uploadingVideo { ProgressView() }
                        }
                        Text("A short walkthrough — narrate it as you film, the audio is saved with the video.")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                            .fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 10) {
                            if cameraAvailable {
                                Button { showCamera = true } label: {
                                    videoActionLabel(icon: "record.circle", text: String(localized: "Record"))
                                }
                            }
                            PhotosPicker(selection: $videoItem, matching: .videos) {
                                videoActionLabel(
                                    icon: videoURL == nil ? "photo.badge.plus" : "checkmark.circle.fill",
                                    text: videoURL == nil ? String(localized: "Choose") : String(localized: "Replace")
                                )
                            }
                        }
                        if videoURL != nil {
                            Button(role: .destructive) { videoURL = nil; videoItem = nil } label: {
                                Text("Remove video")
                                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                            }
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
                        action: { Task { await onSubmit(note, photoURLs, videoURL) } },
                        isLoading: isSubmitting,
                        isDisabled: uploading || uploadingVideo
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
            .onChange(of: videoItem) { _, item in
                Task { await uploadVideo(item) }
            }
            .fullScreenCover(isPresented: $showCamera) {
                VideoCameraPicker { url in
                    if let url { Task { await uploadRecordedVideo(url) } }
                }
                .ignoresSafeArea()
            }
        }
        .presentationDetents([.large])
    }

    private func videoActionLabel(icon: String, text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
            Text(text)
        }
        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
        .foregroundStyle(AirbnbPalette.text)
        .frame(maxWidth: .infinity)
        .frame(height: 52)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous).stroke(AirbnbPalette.hairline))
    }

    // A freshly recorded camera clip is a QuickTime movie on disk; read it and
    // push it through the same upload path as a picked video.
    private func uploadRecordedVideo(_ url: URL) async {
        uploadingVideo = true
        uploadError = nil
        defer { uploadingVideo = false }
        guard let data = try? Data(contentsOf: url) else {
            uploadError = String(localized: "Couldn't read the recording. Try again.")
            return
        }
        do {
            videoURL = try await APIClient.shared.uploadCheckVideo(data, filename: "clip.mov", mimeType: "video/quicktime")
        } catch {
            uploadError = String(localized: "Couldn't upload the video. Check your connection and try again.")
        }
    }

    private func uploadVideo(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        uploadingVideo = true
        uploadError = nil
        defer { uploadingVideo = false }
        guard let data = try? await item.loadTransferable(type: Data.self) else {
            uploadError = String(localized: "Couldn't read that video. Try another one.")
            return
        }
        // iOS library videos are usually QuickTime; detect MPEG-4 so we declare
        // the right content type to the upload endpoint.
        let isMP4 = item.supportedContentTypes.contains { $0.conforms(to: .mpeg4Movie) }
        do {
            videoURL = try await APIClient.shared.uploadCheckVideo(
                data,
                filename: isMP4 ? "clip.mp4" : "clip.mov",
                mimeType: isMP4 ? "video/mp4" : "video/quicktime"
            )
        } catch {
            uploadError = String(localized: "Couldn't upload the video. Check your connection and try again.")
        }
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

// In-app camera video recording for check-in/out condition clips. Audio is
// captured with the video. Returns the recorded movie's temporary file URL, or
// nil if cancelled. Present only when a camera exists (false on Simulator).
struct VideoCameraPicker: UIViewControllerRepresentable {
    let onComplete: (URL?) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .video
        picker.mediaTypes = [UTType.movie.identifier]
        picker.videoQuality = .typeMedium
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: VideoCameraPicker
        init(_ parent: VideoCameraPicker) { self.parent = parent }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            parent.onComplete(info[.mediaURL] as? URL)
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.onComplete(nil)
            parent.dismiss()
        }
    }
}

// Attach a condition video to an already-recorded check event (record in-app or
// pick from library), upload it, and hand the URL back so the caller can enrich
// the existing event server-side (no duplicate, no re-notify).
struct AddConditionVideoSheet: View {
    let onUploaded: (String) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var item: PhotosPickerItem?
    @State private var showCamera = false
    @State private var uploading = false
    @State private var error: String?

    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("A short walkthrough — narrate it as you film, the audio is saved with the video.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 10) {
                    if cameraAvailable {
                        Button { showCamera = true } label: { addVideoLabel("record.circle", String(localized: "Record")) }
                    }
                    PhotosPicker(selection: $item, matching: .videos) {
                        addVideoLabel("photo.badge.plus", String(localized: "Choose"))
                    }
                }

                if uploading { ProgressView() }
                if let error {
                    Text(error)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.destructive)
                }
                Spacer()
            }
            .padding(22)
            .background(SwaplSemanticLight.background.ignoresSafeArea())
            .navigationTitle("Add video")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .onChange(of: item) { _, it in Task { await pick(it) } }
            .fullScreenCover(isPresented: $showCamera) {
                VideoCameraPicker { url in if let url { Task { await record(url) } } }
                    .ignoresSafeArea()
            }
        }
        .presentationDetents([.medium])
    }

    private func addVideoLabel(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
            Text(text)
        }
        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
        .foregroundStyle(AirbnbPalette.text)
        .frame(maxWidth: .infinity)
        .frame(height: 52)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous).stroke(AirbnbPalette.hairline))
    }

    private func pick(_ it: PhotosPickerItem?) async {
        guard let it else { return }
        await upload {
            guard let data = try? await it.loadTransferable(type: Data.self) else { return nil }
            let isMP4 = it.supportedContentTypes.contains { $0.conforms(to: .mpeg4Movie) }
            return try await APIClient.shared.uploadCheckVideo(
                data,
                filename: isMP4 ? "clip.mp4" : "clip.mov",
                mimeType: isMP4 ? "video/mp4" : "video/quicktime"
            )
        }
    }

    private func record(_ url: URL) async {
        await upload {
            guard let data = try? Data(contentsOf: url) else { return nil }
            return try await APIClient.shared.uploadCheckVideo(data, filename: "clip.mov", mimeType: "video/quicktime")
        }
    }

    private func upload(_ work: () async throws -> String?) async {
        uploading = true
        error = nil
        defer { uploading = false }
        do {
            if let url = try await work() {
                await onUploaded(url)
                dismiss()
            } else {
                error = String(localized: "Couldn't read that video. Try again.")
            }
        } catch {
            self.error = String(localized: "Couldn't upload the video. Check your connection and try again.")
        }
    }
}
