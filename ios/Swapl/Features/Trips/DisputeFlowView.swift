import SwiftUI
import UIKit
import PhotosUI
import SwaplDesignTokens

// Dispute / resolution-center flow in the trip cockpit (DOK-153).
//
// "Report a problem" opens this native flow instead of bouncing to the web help
// page. It has two faces, driven by what the server returns for the agreement:
//   - no open case  -> the OPEN form (category picker + description + photos).
//   - an open case   -> the CASE card: status, the original report, the message
//                        timeline, and a reply composer. Urgent cases (safety /
//                        access) foreground the 24/7 line.
//
// Mobile-first, few taps: the form is one scroll, photos reuse the shared
// listing-photo upload pipeline, and the case auto-refreshes after a reply.

@MainActor
@Observable
final class DisputeFlowViewModel {
    let agreementId: String
    var disputes: [Dispute] = []
    var isLoading = false
    var error: String?
    var isSubmitting = false
    // Server-configured support contacts; starts at the launch defaults and is
    // overlaid once /api/config/support-contacts resolves.
    var supportContacts: SupportContacts = .fallback

    init(agreementId: String) {
        self.agreementId = agreementId
    }

    // The newest non-terminal case is the one we surface as the live card; if
    // every case is resolved/closed we fall back to the newest so members can
    // still read history, and the "Report a problem" entry can open a new one.
    var activeDispute: Dispute? {
        disputes.first { !$0.status.isTerminal } ?? disputes.first
    }

    var hasOpenCase: Bool {
        disputes.contains { !$0.status.isTerminal }
    }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            disputes = try await DisputeRepository.shared.list(agreementId: agreementId)
        } catch {
            self.error = error.localizedDescription
        }
    }

    // Best-effort: a failure leaves the launch defaults in place.
    func loadSupportContacts() async {
        if let contacts = try? await SupportContactsRepository.shared.fetch() {
            supportContacts = contacts
        }
    }

    func open(category: DisputeCategory, description: String, photos: [String]) async -> Bool {
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            _ = try await DisputeRepository.shared.open(
                agreementId: agreementId,
                category: category,
                description: description,
                photos: photos
            )
            await load()
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func reply(disputeId: String, body: String, photos: [String]) async -> Bool {
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            _ = try await DisputeRepository.shared.reply(
                disputeId: disputeId,
                body: body,
                photos: photos
            )
            await load()
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }
}

struct DisputeFlowView: View {
    // Optional inline "Message <partner>" pill rendered beside "Report a problem"
    // so the two share one row (DOK-216). When nil, only the report entry shows.
    struct InlineMessage {
        let proposalId: String
        let partnerName: String?
        let isPrincipal: Bool
        // The unified conversation (DOK-221); when set, the pill opens the
        // ConversationView (inline events + receipts) instead of the legacy chat.
        var conversationId: String? = nil
    }

    @State private var vm: DisputeFlowViewModel
    let otherName: String?
    let myUserId: String?
    let inlineMessage: InlineMessage?

    @State private var showOpenForm = false
    @State private var helpItem: SafariItem?
    @State private var phoneFallback: PhoneFallbackAlert?

    init(agreementId: String, otherName: String?, myUserId: String?, inlineMessage: InlineMessage? = nil) {
        _vm = State(initialValue: DisputeFlowViewModel(agreementId: agreementId))
        self.otherName = otherName
        self.myUserId = myUserId
        self.inlineMessage = inlineMessage
    }

    var body: some View {
        Group {
            if vm.isLoading && vm.disputes.isEmpty {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 60)
                    .padding(.horizontal, 22)
                    .accessibilityLabel("Loading your report")
            } else if let dispute = vm.activeDispute {
                DisputeCaseCard(
                    dispute: dispute,
                    otherName: otherName,
                    myUserId: myUserId,
                    isSubmitting: vm.isSubmitting,
                    onReply: { body, photos in
                        await vm.reply(disputeId: dispute.id, body: body, photos: photos)
                    },
                    onCallLine: { open24_7() }
                )
                .padding(.horizontal, 22)

                // A resolved/closed history still lets you raise a fresh issue.
                if !vm.hasOpenCase {
                    reportEntry(title: "Report a new problem")
                }
            } else {
                reportEntry(title: "Report a problem")
            }
        }
        .task {
            await vm.load()
            await vm.loadSupportContacts()
        }
        .sheet(isPresented: $showOpenForm) {
            DisputeOpenSheet(
                otherName: otherName,
                isSubmitting: vm.isSubmitting,
                onCallLine: { open24_7() },
                onSubmit: { category, description, photos in
                    let ok = await vm.open(category: category, description: description, photos: photos)
                    if ok { showOpenForm = false }
                    return ok
                }
            )
        }
        .sheet(item: $helpItem) { item in
            SafariView(url: item.url)
        }
        .alert("Reach our 24/7 line", isPresented: phoneAlertBinding, presenting: phoneFallback) { fallback in
            if let callURL = fallback.callURL {
                Button("Call \(fallback.phone)") { UIApplication.shared.open(callURL) }
            }
            Button("OK", role: .cancel) {}
        } message: { fallback in
            Text("If anyone is unsafe or locked out, call \(fallback.phone).")
        }
    }

    private var phoneAlertBinding: Binding<Bool> {
        Binding(get: { phoneFallback != nil }, set: { if !$0 { phoneFallback = nil } })
    }

    // Report + (optional) Message on one row, both as glass pills — Report clear,
    // Message colour-tinted (DOK-216).
    private func reportEntry(title: String) -> some View {
        HStack(spacing: 12) {
            reportPill(title: title)
            if let m = inlineMessage {
                messagePill(m)
            }
        }
        .padding(.horizontal, 22)
    }

    private func reportPill(title: String) -> some View {
        Button { showOpenForm = true } label: {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.bubble")
                Text(title)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
            .foregroundStyle(AirbnbPalette.text)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 54)
            .glassEffect(.regular.interactive(), in: .capsule)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Report a problem with this trip")
    }

    @ViewBuilder
    private func messageDestination(_ m: InlineMessage) -> some View {
        if let cid = m.conversationId {
            ConversationView(conversationId: cid, title: m.partnerName, proposalId: m.proposalId, isPrincipal: m.isPrincipal)
        } else {
            SwapChatView(proposalId: m.proposalId, otherName: m.partnerName, isPrincipal: m.isPrincipal)
        }
    }

    private func messagePill(_ m: InlineMessage) -> some View {
        NavigationLink {
            messageDestination(m)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                // First name only so the pill fits at half width (DOK-216).
                Text(m.partnerName.flatMap { $0.split(separator: " ").first.map(String.init) }
                    .map { String(localized: "Message \($0)") } ?? String(localized: "Message"))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
            .foregroundStyle(SwaplSemanticLight.primaryForeground)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 54)
            .glassEffect(.regular.tint(SwaplSemanticLight.primary).interactive(), in: .capsule)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(m.partnerName.map { "Message \($0)" } ?? "Message your swap partner")
    }

    // The 24/7 line. We have no in-app phone number, so foregrounding it means
    // routing to the always-on help page — now the server-configured help URL
    // (GET /api/config/support-contacts) rather than a hardcoded path.
    //
    // The help URL is server-configured, so it can arrive empty or malformed.
    // SafariView with a bad URL renders a blank, dead sheet — the worst outcome
    // in an urgent moment. So we validate it: a real http(s) URL opens Safari as
    // before; anything else falls back to an alert offering a direct tel: call,
    // so an unsafe/locked-out member always has a way through.
    private func open24_7() {
        if let url = validHelpURL(vm.supportContacts.helpUrl) {
            helpItem = SafariItem(url: url)
        } else {
            phoneFallback = PhoneFallbackAlert(phone: vm.supportContacts.phone)
        }
    }

    private func validHelpURL(_ raw: String) -> URL? {
        guard let url = URL(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              url.host?.isEmpty == false
        else { return nil }
        return url
    }
}

// Drives the tel: fallback alert when there's no usable help URL. Identifiable
// so it can back a SwiftUI alert; callURL is nil when the phone string has no
// dialable digits (e.g. the launch default "+44 800 000 swap"), in which case
// the alert just shows the number to dial by hand.
struct PhoneFallbackAlert: Identifiable {
    let id = UUID()
    let phone: String

    var callURL: URL? {
        let digits = phone.filter { $0.isNumber || $0 == "+" }
        guard digits.contains(where: { $0.isNumber }) else { return nil }
        return URL(string: "tel://\(digits)")
    }
}

// MARK: - 24/7 urgent banner

struct DisputeUrgentBanner: View {
    let onCallLine: () -> Void

    var body: some View {
        Button(action: onCallLine) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "phone.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.destructive)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Need help right now?")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text("If anyone is unsafe or locked out, our 24/7 line is here. Tap to reach support now.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(AirbnbPalette.destructive.opacity(0.08), in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous).stroke(AirbnbPalette.destructive.opacity(0.25)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Contact the 24/7 support line")
    }
}
