import SwiftUI
import AVKit
import SwaplDesignTokens

// The trip cockpit (DOK-152): shown inside ProposalDetailView once a swap has
// an agreement. Phase timeline + countdown + insurance badge; "Before you go"
// checklist; key codes + insurance; "Where you're staying" with the other
// home's address + guide gated by addressUnlocked; Check in / Check out with
// baseline photos; event log; "Report a problem" → native dispute flow (DOK-153).

@MainActor
@Observable
final class TripCockpitViewModel {
    let agreementId: String
    var cockpit: TripCockpit?
    var error: String?
    var isLoading = false
    var isCheckingIn = false

    init(agreementId: String) {
        self.agreementId = agreementId
    }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            cockpit = try await TripRepository.shared.cockpit(agreementId: agreementId)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func submitCheckEvent(type: String, note: String, photos: [String], videoUrl: String?) async -> Bool {
        isCheckingIn = true
        defer { isCheckingIn = false }
        do {
            if type == "checkin" {
                _ = try await TripRepository.shared.checkIn(agreementId: agreementId, note: note, photos: photos, videoUrl: videoUrl)
            } else {
                _ = try await TripRepository.shared.checkOut(agreementId: agreementId, note: note, photos: photos, videoUrl: videoUrl)
            }
            await load()
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }
}

struct TripCockpitView: View {
    @Environment(AuthService.self) private var auth
    @State private var vm: TripCockpitViewModel
    let otherName: String?
    let otherListingId: String   // the home I'm staying in (other party's)
    let myListingId: String      // my own home (for the guide editor)

    @State private var checkSheet: CheckEventKind?
    @State private var showGuideEditor = false
    // Contextual app-feedback (DOK-190): set when a COMPLETED swap first shows
    // so we present the rate-app sheet once with surface "post-swap".
    @State private var feedbackAfterSwap: AppFeedbackContext?

    init(agreementId: String, otherName: String?, otherListingId: String, myListingId: String) {
        _vm = State(initialValue: TripCockpitViewModel(agreementId: agreementId))
        self.otherName = otherName
        self.otherListingId = otherListingId
        self.myListingId = myListingId
    }

    enum CheckEventKind: Identifiable {
        case checkIn, checkOut
        var id: String { self == .checkIn ? "checkin" : "checkout" }
        var apiType: String { self == .checkIn ? "checkin" : "checkout" }
        var title: String { self == .checkIn ? "Check in" : "Check out" }
    }

    var body: some View {
        Group {
            if let cockpit = vm.cockpit {
                content(cockpit)
            } else if let error = vm.error {
                cockpitError(error)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 160)
                    .accessibilityLabel("Loading your trip")
            }
        }
        .task { await vm.load() }
        // DOK-190 post-swap trigger: when the agreement reaches COMPLETED, prompt
        // for app feedback once per agreement. Guarded against re-nagging, and
        // only auto-presents when no other prompt (check-in/out, guide) is up.
        .onChange(of: vm.cockpit?.phase) { _, phase in
            maybePromptAfterSwap(phase: phase)
        }
        .onAppear { maybePromptAfterSwap(phase: vm.cockpit?.phase) }
        .sheet(item: $feedbackAfterSwap) { ctx in
            RateAppSheet(surface: "post-swap", contextKey: ctx.agreementId)
        }
        .sheet(item: $checkSheet) { kind in
            CheckEventSheet(
                kind: kind,
                isSubmitting: vm.isCheckingIn,
                onSubmit: { note, photos, videoUrl in
                    let ok = await vm.submitCheckEvent(type: kind.apiType, note: note, photos: photos, videoUrl: videoUrl)
                    if ok { checkSheet = nil }
                }
            )
        }
        .sheet(isPresented: $showGuideEditor) {
            HomeGuideEditorView(listingId: myListingId, onSaved: { Task { await vm.load() } })
        }
    }

    // Presents the post-swap feedback sheet at most once per agreement, only
    // when the trip is COMPLETED and nothing else is already showing (one
    // prompt at a time).
    private func maybePromptAfterSwap(phase: TripCockpitPhase?) {
        guard phase == .completed else { return }
        guard checkSheet == nil, !showGuideEditor, feedbackAfterSwap == nil else { return }
        guard !AppFeedbackPrompt.hasSeen(surface: "post-swap", contextKey: vm.agreementId) else { return }
        feedbackAfterSwap = AppFeedbackContext(agreementId: vm.agreementId)
    }

    private func cockpitError(_ error: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Trip details unavailable")
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text(error)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
            GhostPill(title: "Try again", action: { Task { await vm.load() } })
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(22)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
        .padding(.horizontal, 22)
    }

    @ViewBuilder
    private func content(_ cockpit: TripCockpit) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            TripPhaseTimeline(phase: cockpit.phase)
                .padding(.horizontal, 22)

            countdownAndInsurance(cockpit)

            beforeYouGo(cockpit)

            keyAndInsuranceCard(cockpit)

            whereYouStay(cockpit)

            checkButtons(cockpit)

            if !cockpit.checkEvents.isEmpty {
                eventLog(cockpit)
            }

            DisputeFlowView(
                agreementId: vm.agreementId,
                otherName: otherName,
                myUserId: auth.session?.id
            )
        }
    }

    // MARK: countdown + insurance badge

    @ViewBuilder
    private func countdownAndInsurance(_ cockpit: TripCockpit) -> some View {
        let active = cockpit.phase != .completed && cockpit.phase != .interrupted
        HStack(spacing: 12) {
            if active && (cockpit.countdown.days > 0 || cockpit.countdown.hours > 0) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Starts in")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                    Text(countdownText(cockpit.countdown))
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                }
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Status")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                    Text(phaseLabel(cockpit.phase))
                        .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                }
            }
            Spacer()
            if cockpit.insurance != nil {
                Label("Insured", systemImage: "checkmark.shield.fill")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(AirbnbPalette.softBackground, in: Capsule())
            }
        }
        .padding(.horizontal, 22)
    }

    private func countdownText(_ c: TripCockpit.Countdown) -> String {
        if c.days > 0 { return "\(c.days)d \(c.hours)h" }
        return "\(c.hours)h"
    }

    // MARK: before you go checklist

    private func beforeYouGo(_ cockpit: TripCockpit) -> some View {
        let items: [(Bool, String)] = [
            (cockpit.checklist.guideFilled, "Complete your home guide"),
            (cockpit.checklist.detailsRead, "Read your host's home details"),
            (cockpit.checklist.checkedIn, "Check in when you arrive"),
            (cockpit.checklist.checkedOut, "Check out when you leave"),
        ]
        return VStack(alignment: .leading, spacing: 14) {
            Text("Before you go")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                HStack(spacing: 12) {
                    Image(systemName: item.0 ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 20))
                        .foregroundStyle(item.0 ? AirbnbPalette.text : AirbnbPalette.secondaryText)
                    Text(item.1)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(item.0 ? AirbnbPalette.secondaryText : AirbnbPalette.text)
                        .strikethrough(item.0, color: AirbnbPalette.secondaryText)
                    Spacer()
                }
            }
            if cockpit.myGuideCompleteness < 100 {
                Button { showGuideEditor = true } label: {
                    HStack(spacing: 6) {
                        Text("Finish your home guide (\(cockpit.myGuideCompleteness)%)")
                        Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold))
                    }
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                }
                .buttonStyle(.plain)
                .padding(.top, 2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
        .padding(.horizontal, 22)
    }

    // MARK: key codes + insurance details

    private func keyAndInsuranceCard(_ cockpit: TripCockpit) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Your key code")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                Text(cockpit.keyCodes.mine ?? "—")
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .monospaced()
                Text("Keys for keys — share this with your guest so they can get in.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let insurance = cockpit.insurance {
                Divider()
                VStack(alignment: .leading, spacing: 6) {
                    Label("Swap protection", systemImage: "checkmark.shield.fill")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text("Policy \(insurance.policyNumber) · cover \(insurance.coverageAmount.formatted(.currency(code: "EUR").precision(.fractionLength(0))))")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)

                    // DOK-156 — proof-of-cover badge, only when anchored on TON.
                    if insurance.isAnchored {
                        ProofOfCoverBadge(insurance: insurance)
                            .padding(.top, 4)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
        .padding(.horizontal, 22)
    }

    // MARK: where you're staying

    @ViewBuilder
    private func whereYouStay(_ cockpit: TripCockpit) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Where you're staying")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            if cockpit.addressUnlocked {
                if let address = cockpit.otherAddress, !address.isEmpty {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "mappin.circle.fill")
                            .font(.system(size: 20))
                            .foregroundStyle(AirbnbPalette.text)
                        Text(address)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.text)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                // Exact pin is only present once unlocked — offer turn-by-turn.
                if let url = mapsURL(cockpit) {
                    Link(destination: url) {
                        HStack(spacing: 8) {
                            Image(systemName: "location.fill")
                            Text("Open in Maps")
                        }
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                    }
                }
                if let fields = cockpit.otherGuide?.fields {
                    HomeGuideAccordion(fields: fields)
                } else {
                    Text("Your host hasn't filled in their home guide yet.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
            } else {
                lockedAddress(cockpit)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
        .padding(.horizontal, 22)
    }

    @ViewBuilder
    private func lockedAddress(_ cockpit: TripCockpit) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "lock.fill")
                .font(.system(size: 20))
                .foregroundStyle(AirbnbPalette.secondaryText)
            VStack(alignment: .leading, spacing: 4) {
                Text(cockpit.otherCity.map { String(localized: "The exact address in \($0) unlocks soon") } ?? String(localized: "The exact address unlocks soon"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .fixedSize(horizontal: false, vertical: true)
                if let unlocksAt = cockpit.otherGuide?.unlocksAt, let date = SwaplDateText.parse(unlocksAt) {
                    Text("Unlocks \(unlockDate(date)) — 48h before your stay.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                } else {
                    Text("The address and home guide unlock 48h before your stay.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
            }
        }
    }

    // Apple Maps deep link to the exact pin, labelled with the address. Returns
    // nil before the reveal gate opens (no coordinates in the payload).
    private func mapsURL(_ cockpit: TripCockpit) -> URL? {
        guard let lat = cockpit.otherLat, let lng = cockpit.otherLng else { return nil }
        var components = URLComponents(string: "https://maps.apple.com/")
        var items = [
            URLQueryItem(name: "ll", value: "\(lat),\(lng)"),
        ]
        if let label = cockpit.otherAddress, !label.isEmpty {
            items.append(URLQueryItem(name: "q", value: label))
        } else {
            items.append(URLQueryItem(name: "q", value: String(localized: "Your stay")))
        }
        components?.queryItems = items
        return components?.url
    }

    private func unlockDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f.string(from: date)
    }

    // MARK: check in / out

    @ViewBuilder
    private func checkButtons(_ cockpit: TripCockpit) -> some View {
        let canAct = cockpit.phase != .interrupted
        if canAct {
            VStack(spacing: 12) {
                if !cockpit.checklist.checkedIn {
                    PrimaryPill(title: "Check in", action: { checkSheet = .checkIn })
                } else if !cockpit.checklist.checkedOut {
                    PrimaryPill(title: "Check out", action: { checkSheet = .checkOut })
                    GhostPill(title: "View your check-in", action: { checkSheet = .checkIn })
                } else {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                        Text("Checked in and out — thanks!")
                    }
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 22)
        }
    }

    // MARK: event log

    private func eventLog(_ cockpit: TripCockpit) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Trip activity")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            ForEach(cockpit.checkEvents.sorted { $0.createdAt > $1.createdAt }) { event in
                TripEventRow(
                    event: event,
                    otherName: otherName,
                    // Let the host attach a video to their own event later — the
                    // server merges it onto the same check event.
                    onAddVideo: (event.mine && event.videoUrl == nil) ? { url in
                        _ = await vm.submitCheckEvent(type: event.type, note: "", photos: [], videoUrl: url)
                    } : nil
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous).stroke(AirbnbPalette.hairline))
        .padding(.horizontal, 22)
    }

    private func phaseLabel(_ phase: TripCockpitPhase) -> String {
        switch phase {
        case .agreed: return "Swap agreed"
        case .preparing: return "Preparing"
        case .ready: return "Ready to go"
        case .inProgress: return "In progress"
        case .completed: return "Completed"
        case .interrupted: return "Cancelled"
        }
    }
}

// MARK: - Phase timeline

struct TripPhaseTimeline: View {
    let phase: TripCockpitPhase

    // Linear happy-path stops. Cancelled is an off-path terminal state.
    private let stops: [(TripCockpitPhase, String)] = [
        (.agreed, "Agreed"),
        (.ready, "Ready"),
        (.inProgress, "Staying"),
        (.completed, "Done"),
    ]

    private var currentIndex: Int {
        switch phase {
        case .agreed, .preparing: return 0
        case .ready: return 1
        case .inProgress: return 2
        case .completed: return 3
        case .interrupted: return -1
        }
    }

    var body: some View {
        if phase == .interrupted {
            HStack(spacing: 8) {
                Image(systemName: "xmark.circle.fill")
                Text("This swap was cancelled")
            }
            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
            .foregroundStyle(AirbnbPalette.text)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 12)
        } else {
            HStack(spacing: 0) {
                ForEach(Array(stops.enumerated()), id: \.offset) { index, stop in
                    let done = index <= currentIndex
                    VStack(spacing: 8) {
                        Circle()
                            .fill(done ? AirbnbPalette.text : AirbnbPalette.hairline)
                            .frame(width: 14, height: 14)
                            .overlay {
                                if index == currentIndex {
                                    Circle().stroke(AirbnbPalette.text, lineWidth: 2).frame(width: 22, height: 22)
                                }
                            }
                        Text(stop.1)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: done ? .semibold : .regular))
                            .foregroundStyle(done ? AirbnbPalette.text : AirbnbPalette.secondaryText)
                    }
                    .frame(maxWidth: .infinity)
                    // Connector to the previous dot, sized to THIS cell's width
                    // (was screen-width math, which risked overflowing the row).
                    // Drawn behind the dots, centred on the dot's vertical level.
                    .background(alignment: .topLeading) {
                        if index > 0 {
                            GeometryReader { geo in
                                Rectangle()
                                    .fill(index <= currentIndex ? AirbnbPalette.text : AirbnbPalette.hairline)
                                    .frame(width: geo.size.width, height: 2)
                                    .position(x: 0, y: 7)
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 6)
        }
    }
}

// MARK: - Home guide accordion (read-only, the other host's guide)

struct HomeGuideAccordion: View {
    let fields: HomeGuideFields
    @State private var expanded = false

    private var rows: [(String, String)] {
        var out: [(String, String)] = []
        func add(_ label: String, _ value: String?) {
            if let value, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                out.append((label, value))
            }
        }
        add("Getting in", fields.accessInstructions)
        add("Keys", fields.keyPickup)
        add("Wi-Fi network", fields.wifiName)
        add("Wi-Fi password", fields.wifiPassword)
        add("Heating & cooling", fields.heatingCooling)
        add("Kitchen", fields.kitchen)
        add("Bins & recycling", fields.bins)
        add("Pets & plants", fields.petsPlants)
        add("House rules", fields.houseRules)
        add("Neighbourhood", fields.neighbourhood)
        add("Emergency contact", fields.emergencyContact)
        return out
    }

    var body: some View {
        if rows.isEmpty {
            Text("Your host hasn't filled in their home guide yet.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Button { withAnimation(.snappy) { expanded.toggle() } } label: {
                    HStack {
                        Text("Home guide")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.text)
                        Spacer()
                        Image(systemName: expanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                    }
                }
                .buttonStyle(.plain)

                if expanded {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(row.0)
                                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                                    .foregroundStyle(AirbnbPalette.secondaryText)
                                Text(row.1)
                                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                                    .foregroundStyle(AirbnbPalette.text)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 14)
                }
            }
        }
    }
}

// MARK: - Event row

struct TripEventRow: View {
    let event: TripCheckEvent
    let otherName: String?
    // Non-nil only for the host's own event without a video yet: lets them
    // attach one later. Receives the uploaded video URL.
    var onAddVideo: ((String) async -> Void)? = nil

    @State private var showVideo = false
    @State private var showAddVideo = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: event.type == "checkin" ? "door.left.hand.open" : "door.left.hand.closed")
                .font(.system(size: 18))
                .foregroundStyle(AirbnbPalette.text)
                .frame(width: 38, height: 38)
                .background(AirbnbPalette.softBackground, in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(SwaplDateText.parse(event.createdAt).map { dateTime($0) } ?? String(event.createdAt.prefix(10)))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                if let note = event.note, !note.isEmpty {
                    Text(note)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !event.photos.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(event.photos, id: \.self) { url in
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
                if let videoString = event.videoUrl, let videoURL = URL(string: videoString) {
                    Button { showVideo = true } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "play.rectangle.fill")
                            Text("Watch condition video")
                        }
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                    }
                    .buttonStyle(.plain)
                    .sheet(isPresented: $showVideo) {
                        VideoPlayer(player: AVPlayer(url: videoURL))
                            .ignoresSafeArea()
                    }
                }
                if let onAddVideo {
                    Button { showAddVideo = true } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "video.badge.plus")
                            Text("Add a video")
                        }
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                    }
                    .buttonStyle(.plain)
                    .sheet(isPresented: $showAddVideo) {
                        AddConditionVideoSheet { url in await onAddVideo(url) }
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }

    private var title: String {
        let who = event.mine ? String(localized: "You") : (otherName ?? String(localized: "Your swap partner"))
        return event.type == "checkin" ? "\(who) checked in" : "\(who) checked out"
    }

    private func dateTime(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f.string(from: date)
    }
}
