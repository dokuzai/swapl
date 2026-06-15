import SwiftUI
import PhotosUI
import SwaplDesignTokens

// DOK-162 / DOK-186: optional owner-proof verification flow.
//
// The host attaches a document (deed/title OR a lease agreement); the backend AI
// classifies it and an admin reviews it. On approval the listing earns the
// discreet "Verified owner" badge. This is STRICTLY OPTIONAL — publishing is
// never gated on it.
//
// DOK-186 adds: copy explaining the AI check, a document-type selector
// (deed vs lease), and a gentle, actionable message when a submission is
// rejected because the home was classified as a business property — Swapl is a
// swap between private people, so company-owned listings aren't eligible.
struct OwnerVerificationSheet: View {
    let listingId: String

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var status: PropertyVerificationStatus?
    @State private var pickedDocuments: [PropertyVerificationDocument] = []
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var documentType: PropertyDocumentType = .deed
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
                        // DOK-186: when the AI/admin rejected the home as a
                        // business property, explain it kindly and offer help.
                        if verification.status == "rejected", verification.isBusinessRejection {
                            businessBlockCard
                        }
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
            Text("This step is completely optional. Upload a document that shows this is your home — your deed or title if you own it, or your lease agreement if you rent. A recent utility bill in your name works too.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
            Text("It is never required to publish or to swap.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            // DOK-186: set expectations about the automated check up front, so a
            // business rejection later never feels arbitrary.
            VStack(alignment: .leading, spacing: 8) {
                infoRow(
                    icon: "sparkles",
                    text: "We check your document automatically to confirm it really shows this home in your name. A person on our team always makes the final call."
                )
                infoRow(
                    icon: "key.fill",
                    text: "Renting is welcome. If you rent and your lease lets you host, you\u{2019}re fully eligible — you don\u{2019}t need to own the home."
                )
                infoRow(
                    icon: "lock.shield.fill",
                    text: "Your document is read once to check the home is yours, then it isn\u{2019}t stored — we keep only the result (verified or not), never the document or its contents."
                )
                infoRow(
                    icon: "person.2.fill",
                    text: "Swapl is a swap between private people. Company-owned and business properties aren\u{2019}t eligible."
                )
            }
            .padding(.top, 4)
        }
    }

    private func infoRow(icon: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .frame(width: 18)
            Text(text)
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // DOK-186: kind, actionable message when a listing was classified as a
    // business property. The host can reach support or ask an admin to take a
    // second look — approval is always sovereign over the AI.
    private var businessBlockCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "building.2.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.destructive)
                Text("Our check suggests this may be a commercial property — we may have it wrong")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
            }
            Text("Swapl is a home swap between private people, so company-owned or commercially managed properties can\u{2019}t be verified. But automated checks aren\u{2019}t perfect, and a real person — never the AI — makes the final decision. If this is your own home, get in touch: a member of our team reviews these personally, usually within 2 business days, and a lease, deed, or tax record in your name is enough to set it straight.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                contactSupport()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "envelope.fill")
                    Text("Contact support / request a review")
                }
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(SwaplSemanticLight.primary.opacity(0.4))
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.destructive.opacity(0.06), in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(SwaplSemanticLight.destructive.opacity(0.25))
        }
    }

    private func contactSupport() {
        let subject = "Property verification review (listing \(listingId))"
        let encoded = subject.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? subject
        if let url = URL(string: "mailto:support@swapl.com?subject=\(encoded)") {
            openURL(url)
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
            // DOK-186: let the host tell us what they're uploading. Helps the AI
            // classify correctly and keeps the flow honest about deed vs lease.
            VStack(alignment: .leading, spacing: 8) {
                Text("What are you uploading?")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                ForEach(PropertyDocumentType.allCases, id: \.self) { type in
                    documentTypeRow(type)
                }

                // DOK-186: positive, inclusive reassurance for renters right next
                // to the deed/lease selector so it never reads as deed-only.
                HStack(alignment: .top, spacing: 9) {
                    Image(systemName: "key.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                        .frame(width: 18)
                    Text("Renting? You\u{2019}re welcome here too — upload your lease instead of a deed. You can host on Swapl as long as your rental contract lets you have guests.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .padding(.top, 4)
            }
            .padding(.bottom, 4)

            PhotosPicker(selection: $photoItems, maxSelectionCount: 5, matching: .images) {
                HStack(spacing: 10) {
                    if uploading { ProgressView() } else { Image(systemName: "doc.badge.plus") }
                    Text(pickedDocuments.isEmpty ? String(localized: "Add a document") : String(localized: "Add another document"))
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

    private func documentTypeRow(_ type: PropertyDocumentType) -> some View {
        let selected = documentType == type
        return Button {
            documentType = type
        } label: {
            HStack(spacing: 12) {
                Image(systemName: type.icon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(selected ? SwaplSemanticLight.primary : AirbnbPalette.secondaryText)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 2) {
                    Text(type.title)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text(type.subtitle)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                Spacer(minLength: 0)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(selected ? SwaplSemanticLight.primary : AirbnbPalette.secondaryText)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                (selected ? SwaplSemanticLight.accent : AirbnbPalette.softBackground),
                in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(selected ? SwaplSemanticLight.primary.opacity(0.4) : .clear)
            }
        }
        .buttonStyle(.plain)
        .disabled(uploading || submitting)
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
        default: return String(localized: "Under review")
        }
    }

    private func statusSubtitle(_ state: String, note: String?) -> String {
        switch state {
        case "approved": return "Your listing shows the Verified owner badge."
        case "rejected": return note ?? String(localized: "Try again with a clearer document in your name.")
        default: return "A person on our team makes the final call — usually within 2 business days. If our automated check was unsure, it can take a little longer, but you're not stuck: we always follow up."
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
                self.error = String(localized: "Couldn't upload that document. Check your connection and try again.")
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
                documents: pickedDocuments,
                documentType: documentType
            )
            pickedDocuments = []
        } catch {
            self.error = error.localizedDescription
        }
    }
}
