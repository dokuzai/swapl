import SwiftUI
import PhotosUI
import SwaplDesignTokens

// The live dispute case (DOK-153): a card carrying the status pill, the original
// report (category + description + photos), the message timeline, and — while
// the case is still open — a reply composer. Urgent cases (server-stamped, from
// safety / access) foreground the 24/7 line at the top of the card.
struct DisputeCaseCard: View {
    let dispute: Dispute
    let otherName: String?
    let myUserId: String?
    let isSubmitting: Bool
    let onReply: (_ body: String, _ photos: [String]) async -> Bool
    let onCallLine: () -> Void

    @State private var replyText = ""
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var photoURLs: [String] = []
    @State private var uploading = false
    @State private var uploadError: String?

    private var trimmedReply: String { replyText.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canSend: Bool { !trimmedReply.isEmpty && !uploading && !isSubmitting }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            if dispute.urgent && !dispute.status.isTerminal {
                DisputeUrgentBanner(onCallLine: onCallLine)
            }

            originalReport

            if let resolution = dispute.resolution, !resolution.isEmpty {
                resolutionNote(resolution)
            }

            if !dispute.messages.isEmpty {
                Divider()
                timeline
            }

            if dispute.status.isTerminal {
                terminalFooter
            } else {
                Divider()
                composer
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
        .onChange(of: photoItems) { _, items in
            Task { await upload(items) }
        }
    }

    // MARK: header

    private var header: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: dispute.categoryKind.icon)
                .font(.system(size: 18))
                .foregroundStyle(dispute.urgent ? AirbnbPalette.destructive : AirbnbPalette.text)
                .frame(width: 40, height: 40)
                .background(AirbnbPalette.softBackground, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(dispute.categoryKind.title)
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text("Reported \(DisputeDateText.relative(dispute.createdAt))")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            Spacer(minLength: 0)
            statusPill
        }
    }

    private var statusPill: some View {
        Text(dispute.status.label)
            .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
            .foregroundStyle(dispute.status.isTerminal ? AirbnbPalette.secondaryText : AirbnbPalette.text)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(AirbnbPalette.softBackground, in: Capsule())
    }

    // MARK: original report

    private var originalReport: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(dispute.description)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.text)
                .fixedSize(horizontal: false, vertical: true)
            if !dispute.photos.isEmpty {
                DisputeThumbnailStrip(urls: dispute.photos)
            }
        }
    }

    private func resolutionNote(_ resolution: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 16))
                .foregroundStyle(AirbnbPalette.text)
            VStack(alignment: .leading, spacing: 3) {
                Text("Resolution")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                Text(resolution)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.text)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(AirbnbPalette.softBackground, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
    }

    // MARK: timeline

    private var timeline: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Conversation")
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
            ForEach(dispute.messages) { message in
                DisputeMessageRow(
                    message: message,
                    mine: myUserId != nil && message.authorId == myUserId
                )
            }
        }
    }

    // MARK: reply composer

    private var composer: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Reply")
                .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                .foregroundStyle(AirbnbPalette.secondaryText)
            TextField("Add a reply…", text: $replyText, axis: .vertical)
                .lineLimit(2...6)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .padding(12)
                .background(SwaplSemanticLight.background, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous).stroke(AirbnbPalette.hairline))

            if !photoURLs.isEmpty {
                DisputePhotoStrip(urls: photoURLs, onRemove: { url in photoURLs.removeAll { $0 == url } })
            }
            if let uploadError {
                Text(uploadError)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.destructive)
            }

            HStack(spacing: 12) {
                PhotosPicker(selection: $photoItems, maxSelectionCount: 12, matching: .images) {
                    HStack(spacing: 6) {
                        if uploading {
                            ProgressView()
                        } else {
                            Image(systemName: "camera")
                        }
                        Text("Photo")
                    }
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .overlay(Capsule().stroke(AirbnbPalette.hairline))
                }
                Spacer()
                Button {
                    Task { await send() }
                } label: {
                    HStack(spacing: 6) {
                        if isSubmitting { ProgressView().tint(SwaplSemanticLight.primaryForeground) }
                        Text("Send")
                    }
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 10)
                    .background(SwaplSemanticLight.primary, in: Capsule())
                    .opacity(canSend ? 1 : 0.5)
                }
                .buttonStyle(.plain)
                .disabled(!canSend)
            }
        }
    }

    private var terminalFooter: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
            Text(dispute.status == .resolved ? "This case has been resolved." : "This case is closed.")
        }
        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
        .foregroundStyle(AirbnbPalette.secondaryText)
    }

    // MARK: actions

    private func send() async {
        guard canSend else { return }
        let body = trimmedReply
        let photos = photoURLs
        let ok = await onReply(body, photos)
        if ok {
            replyText = ""
            photoURLs = []
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
                uploadError = "Couldn't upload a photo. Check your connection and try again."
            }
        }
        photoItems = []
    }
}

// MARK: - Message row

struct DisputeMessageRow: View {
    let message: DisputeMessage
    let mine: Bool

    var body: some View {
        VStack(alignment: mine ? .trailing : .leading, spacing: 4) {
            HStack(spacing: 6) {
                if mine { Spacer(minLength: 0) }
                Text(mine ? "You" : (message.authorName ?? "Support"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(DisputeDateText.relative(message.createdAt))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                if !mine { Spacer(minLength: 0) }
            }
            VStack(alignment: .leading, spacing: 8) {
                if !message.body.isEmpty {
                    Text(message.body)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.text)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !message.photos.isEmpty {
                    DisputeThumbnailStrip(urls: message.photos)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(
                (mine ? AirbnbPalette.softBackground : SwaplSemanticLight.background),
                in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            )
        }
    }
}

// MARK: - Relative dates

enum DisputeDateText {
    private static let relativeFormatter: RelativeDateTimeFormatter = {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f
    }()

    // Server timestamps come from Date.toISOString() — full datetime with
    // milliseconds (e.g. 2026-06-15T09:41:12.482Z). SwaplDateText.parse truncates
    // to the date, which would zero the time, so we parse the full instant here.
    private static let isoWithFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let isoPlain = ISO8601DateFormatter()

    private static func instant(_ iso: String) -> Date? {
        isoWithFraction.date(from: iso) ?? isoPlain.date(from: iso)
    }

    // Full ISO8601 instant → "3h ago" / "just now".
    static func relative(_ iso: String) -> String {
        guard let date = instant(iso) else { return String(iso.prefix(10)) }
        if Date().timeIntervalSince(date) < 60 { return "just now" }
        return relativeFormatter.localizedString(for: date, relativeTo: Date())
    }
}
