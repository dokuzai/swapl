import SwiftUI
import Observation
import SwaplDesignTokens

// Owner availability calendar editor (DOK-159). The host sees their listing's
// real bookings (swaps + Keys stays, greyed and struck through) and can block /
// unblock their own dates for renovations or personal use. Blocks subtract from
// the bookable window everywhere — the same /calendar feed powers the guest
// pickers, so what the host blocks here disappears from browse and Stay-with-Keys.

@MainActor
@Observable
final class ListingCalendarEditorViewModel {
    let listingId: String
    var availability: ListingAvailability?
    var hostBlocks: [HostBlockedRange] = []
    var error: String?
    var isLoading = false
    var isMutating = false

    init(listingId: String) { self.listingId = listingId }

    func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            async let availability = CalendarRepository.shared.availability(listingId: listingId)
            async let blocks = CalendarRepository.shared.hostBlocks(listingId: listingId)
            self.availability = try await availability
            self.hostBlocks = try await blocks.ranges
        } catch {
            self.error = error.localizedDescription
        }
    }

    func block(from: Date, to: Date, note: String?) async -> Bool {
        isMutating = true
        defer { isMutating = false }
        do {
            try await CalendarRepository.shared.blockDates(
                listingId: listingId,
                dateFrom: SwaplDateText.apiString(from: from),
                dateTo: SwaplDateText.apiString(from: to),
                note: note?.isEmpty == false ? note : nil
            )
            await load()
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func unblock(_ range: HostBlockedRange) async {
        isMutating = true
        defer { isMutating = false }
        do {
            try await CalendarRepository.shared.unblock(listingId: listingId, rangeId: range.id)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // Open a span for booking (DOK-219): carves it out of the closed blocks.
    // The inverse of block(); used by the quick "open month / year / range" actions
    // for the closed-by-default model.
    @discardableResult
    func open(from: Date, to: Date) async -> Bool {
        isMutating = true
        defer { isMutating = false }
        do {
            try await CalendarRepository.shared.openDates(
                listingId: listingId,
                dateFrom: SwaplDateText.apiString(from: from),
                dateTo: SwaplDateText.apiString(from: to)
            )
            await load()
            return true
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }
}

struct ListingCalendarEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var vm: ListingCalendarEditorViewModel
    @State private var selectionStart: Date?
    @State private var selectionEnd: Date?
    @State private var blockNote = ""
    @State private var showBlockError = false

    // Closed-by-default availability (DOK-219): the "open a specific range" sheet.
    @State private var isAddingOpenRange = false
    @State private var newOpenFrom = Calendar.current.startOfDay(for: Date())
    @State private var newOpenTo = Calendar.current.date(byAdding: .day, value: 7, to: Calendar.current.startOfDay(for: Date())) ?? Date()

    let listingTitle: String

    init(listingId: String, listingTitle: String) {
        _vm = State(initialValue: ListingCalendarEditorViewModel(listingId: listingId))
        self.listingTitle = listingTitle
    }

    var body: some View {
        NavigationStack {
            Group {
                if let availability = vm.availability {
                    content(availability)
                } else if let error = vm.error {
                    SwaplEmptyState(
                        systemImage: "calendar.badge.exclamationmark",
                        title: "Calendar unavailable",
                        description: error,
                        actionTitle: "Try Again",
                        action: { Task { await vm.load() } }
                    )
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .accessibilityLabel("Loading calendar")
                }
            }
            .swaplScreenBackground()
            .navigationTitle("Manage dates")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) {
                if vm.availability != nil { blockBar }
            }
        }
        .task { await vm.load() }
    }

    private func content(_ availability: ListingAvailability) -> some View {
        let days = AvailabilityDays(availability: availability)
        return ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                header

                openActions(availability)

                AvailabilityCalendar(
                    days: days,
                    mode: .blocking,
                    selectionStart: $selectionStart,
                    selectionEnd: $selectionEnd
                )

                if !vm.hostBlocks.isEmpty {
                    blocksList
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 16)
            .padding(.bottom, 24)
        }
        .sheet(isPresented: $isAddingOpenRange) { openRangeSheet }
    }

    // Quick "open dates" actions (DOK-219). Listings are closed by default, so
    // the host opens periods here; the calendar below stays the place to close
    // (block) specific dates back up.
    private func openActions(_ availability: ListingAvailability) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Open dates for booking")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            HStack(spacing: 10) {
                quickOpenButton(title: String(localized: "Open this month"), systemImage: "calendar") {
                    let r = openThisMonthRange(availability)
                    Task { await vm.open(from: r.from, to: r.to) }
                }
                quickOpenButton(title: String(localized: "Open the whole year"), systemImage: "calendar.badge.checkmark") {
                    let r = wholeWindowRange(availability)
                    Task { await vm.open(from: r.from, to: r.to) }
                }
            }
            Button { isAddingOpenRange = true } label: {
                HStack(spacing: 8) {
                    Image(systemName: "calendar.badge.plus")
                    Text("Open a specific range…")
                }
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .frame(maxWidth: .infinity)
                .frame(height: 48)
                .background(SwaplSemanticLight.accent.opacity(0.5), in: Capsule())
            }
            .disabled(vm.isMutating)
        }
    }

    private func quickOpenButton(title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: systemImage).font(.system(size: 18, weight: .semibold))
                Text(title)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                    .multilineTextAlignment(.center)
            }
            .foregroundStyle(AirbnbPalette.text)
            .frame(maxWidth: .infinity)
            .frame(height: 72)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
        .disabled(vm.isMutating)
    }

    private var openRangeSheet: some View {
        NavigationStack {
            VStack(spacing: 0) {
                RangeDatePicker(from: $newOpenFrom, to: $newOpenTo)
                    .padding(.horizontal, 14)
                    .padding(.top, 8)
                Spacer()
            }
            .swaplScreenBackground()
            .navigationTitle("Open a range")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { isAddingOpenRange = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Open") {
                        let from = newOpenFrom, to = newOpenTo
                        isAddingOpenRange = false
                        if to > from { Task { await vm.open(from: from, to: to) } }
                    }
                }
            }
        }
    }

    // The remainder of the current month, clamped to the listing window.
    private func openThisMonthRange(_ a: ListingAvailability) -> (from: Date, to: Date) {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let startOfMonth = cal.date(from: cal.dateComponents([.year, .month], from: today)) ?? today
        let nextMonth = cal.date(byAdding: .month, value: 1, to: startOfMonth) ?? today
        let windowEnd = SwaplDateText.parse(a.availableTo) ?? nextMonth
        return (max(today, startOfMonth), min(nextMonth, windowEnd))
    }

    private func wholeWindowRange(_ a: ListingAvailability) -> (from: Date, to: Date) {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let windowStart = SwaplDateText.parse(a.availableFrom) ?? today
        let windowEnd = SwaplDateText.parse(a.availableTo) ?? today
        return (max(today, windowStart), windowEnd)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(listingTitle)
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text("Your home is bookable only on the dates you open. Open periods with the quick actions below; tap a start and end date on the calendar to close dates back up. Swaps and Stay-with-Keys bookings are struck through and can't be edited here.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var blocksList: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Your blocked dates")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            VStack(spacing: 0) {
                ForEach(vm.hostBlocks) { block in
                    HStack(spacing: 12) {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(SwaplDateText.range(from: block.dateFrom, to: block.dateTo))
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                            if let note = block.note, !note.isEmpty {
                                Text(note)
                                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                                    .foregroundStyle(AirbnbPalette.secondaryText)
                            }
                        }
                        Spacer()
                        Button {
                            Task { await vm.unblock(block) }
                        } label: {
                            Text("Unblock")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                                .foregroundStyle(SwaplSemanticLight.destructive)
                                .frame(minHeight: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(vm.isMutating)
                        .accessibilityLabel("Unblock \(SwaplDateText.range(from: block.dateFrom, to: block.dateTo))")
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 56)
                    if block.id != vm.hostBlocks.last?.id {
                        Divider().padding(.leading, 42)
                    }
                }
            }
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            )
        }
    }

    // Sticky bar that confirms the pending selection into a block.
    private var blockBar: some View {
        VStack(spacing: 10) {
            if let start = selectionStart, let end = selectionEnd, end > start {
                HStack {
                    Text(SwaplDateText.range(from: SwaplDateText.apiString(from: start), to: SwaplDateText.apiString(from: end)))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    Spacer()
                    Button {
                        selectionStart = nil
                        selectionEnd = nil
                    } label: {
                        Text("Clear")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                }
                Button {
                    Task {
                        let ok = await vm.block(from: start, to: end, note: blockNote)
                        if ok {
                            selectionStart = nil
                            selectionEnd = nil
                            blockNote = ""
                        }
                    }
                } label: {
                    HStack {
                        Spacer()
                        if vm.isMutating { ProgressView().tint(SwaplSemanticLight.primaryForeground) }
                        Text("Block these dates")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                            .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        Spacer()
                    }
                    .frame(height: 52)
                    .background(SwaplSemanticLight.primary, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(vm.isMutating)
            } else {
                Text("Pick a start and end date above to block them.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .frame(minHeight: 40)
            }
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 12)
        .background(SwaplSemanticLight.card)
        .overlay(alignment: .top) { AirbnbPalette.hairline.frame(height: 1) }
    }
}
