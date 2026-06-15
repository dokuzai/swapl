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
}

struct ListingCalendarEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var vm: ListingCalendarEditorViewModel
    @State private var selectionStart: Date?
    @State private var selectionEnd: Date?
    @State private var blockNote = ""
    @State private var showBlockError = false

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
            .background(SwaplSemanticLight.background.ignoresSafeArea())
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
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(listingTitle)
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text("Tap a start date, then an end date to block dates you don't want bookable. Swaps and Stay-with-Keys bookings are shown struck through and can't be edited here.")
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
