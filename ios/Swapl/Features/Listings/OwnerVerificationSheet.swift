import SwiftUI
import PhotosUI
import SwaplDesignTokens

// DOK-162: optional owner-proof verification flow.
//
// The host attaches a document (deed, utility bill, etc.); an admin reviews it
// and, on approval, the listing earns the discreet "Verified owner" badge. This
// is STRICTLY OPTIONAL — publishing is never gated on it. The copy makes that
// explicit so no one mistakes it for a requirement.
struct OwnerVerificationSheet: View {
    let listingId: String

    @Environment(\.dismiss) private var dismiss
    @State private var status: PropertyVerificationStatus?
    @State private var pickedDocuments: [PropertyVerificationDocument] = []
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var uploading = false
    @State private var submitting = false
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    header

                    if let verification = status?.verification {
                        statusCard(verification)
                    }

                    // Hide the upload/submit affordance while a review is pending
                    // or already approved; reopening is allowed after a rejection.
                    if status?.ownerVerified != true && status?.verification?.status != "pending" {
                        uploadSection
                    }

                    if let error {
                        Text(error)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.destructive)
                    }
                }
                .padding(22)
            }
            .background(SwaplSemanticLight.background.ignoresSafeArea())
            .navigationTitle("Verify ownership")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(SwaplSemanticLight.primary)
                }
            }
            .overlay {
                if loading && status == nil {
                    ProgressView()
                }
            }
        }
        .task { await loadStatus() }
        .onChange(of: photoItems) { _, items in
            Task { await uploadDocuments(items) }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Add proof, earn a trust badge")
                .font(.swaplDisplay(24, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text("This step is completely optional. Upload a document that shows you own this home — a deed, property-tax bill, or a recent utility bill in your name. Once an admin approves it, your listing shows a discreet \u{201C}Verified owner\u{201D} badge that helps guests trust you faster.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            Text("It is never required to publish or to swap.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
        }
    }

    private func statusCard(_ verification: PropertyVerification) -> some View {
        HStack(spacing: 14) {
            Image(systemName: statusIcon(verification.status))
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(statusTint(verification.status))
            VStack(alignment: .leading, spacing: 3) {
                Text(statusTitle(verification.status))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(statusSubtitle(verification.status, note: verification.note))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }

    private var uploadSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            PhotosPicker(selection: $photoItems, maxSelectionCount: 5, matching: .images) {
                HStack(spacing: 10) {
                    if uploading { ProgressView() } else { Image(systemName: "doc.badge.plus") }
                    Text(pickedDocuments.isEmpty ? "Add a document" : "Add another document")
                }
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                }
            }
            .disabled(uploading || submitting)

            ForEach(pickedDocuments, id: \.url) { doc in
                HStack(spacing: 10) {
                    Image(systemName: "doc.text")
                        .foregroundStyle(SwaplSemanticLight.primary)
                    Text(doc.label)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.text)
                    Spacer()
                    Button {
                        pickedDocuments.removeAll { $0.url == doc.url }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(AirbnbPalette.secondaryText)
                    }
                    .accessibilityLabel("Remove document")
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(AirbnbPalette.softBackground, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.small, style: .continuous))
            }

            Button {
                Task { await submit() }
            } label: {
                HStack {
                    if submitting { ProgressView().tint(SwaplSemanticLight.primaryForeground) }
                    Text("Submit for review")
                }
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(SwaplSemanticLight.primary, in: Capsule())
            }
            .disabled(pickedDocuments.isEmpty || uploading || submitting)
            .opacity(pickedDocuments.isEmpty ? 0.45 : 1)
        }
    }

    private func statusIcon(_ state: String) -> String {
        switch state {
        case "approved": return "checkmark.seal.fill"
        case "rejected": return "xmark.seal.fill"
        default: return "clock.fill"
        }
    }

    private func statusTint(_ state: String) -> Color {
        switch state {
        case "approved": return SwaplSemanticLight.primary
        case "rejected": return SwaplSemanticLight.destructive
        default: return AirbnbPalette.secondaryText
        }
    }

    private func statusTitle(_ state: String) -> String {
        switch state {
        case "approved": return "Ownership verified"
        case "rejected": return "Couldn't verify this time"
        default: return "Under review"
        }
    }

    private func statusSubtitle(_ state: String, note: String?) -> String {
        switch state {
        case "approved": return "Your listing shows the Verified owner badge."
        case "rejected": return note ?? "Try again with a clearer document in your name."
        default: return "We'll review your document and update this within a few days."
        }
    }

    private func loadStatus() async {
        loading = true
        defer { loading = false }
        do {
            status = try await PropertyVerificationRepository.shared.status(listingId: listingId)
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func uploadDocuments(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        uploading = true
        error = nil
        defer { uploading = false }
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            do {
                let url = try await APIClient.shared.uploadListingPhoto(data)
                let label = "Document \(pickedDocuments.count + 1)"
                if !pickedDocuments.contains(where: { $0.url == url }) {
                    pickedDocuments.append(PropertyVerificationDocument(url: url, label: label))
                }
            } catch {
                self.error = "Couldn't upload that document. Check your connection and try again."
            }
        }
        photoItems = []
    }

    private func submit() async {
        guard !pickedDocuments.isEmpty else { return }
        submitting = true
        error = nil
        defer { submitting = false }
        do {
            status = try await PropertyVerificationRepository.shared.submit(
                listingId: listingId,
                documents: pickedDocuments
            )
            pickedDocuments = []
        } catch {
            self.error = error.localizedDescription
        }
    }
}
