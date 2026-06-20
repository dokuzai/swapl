import SwiftUI
import SwaplDesignTokens

// Shared availability month-grid (DOK-159). ONE calendar primitive used by the
// owner editor, the Stay-with-Keys picker and the browse date filter, so the
// "which days are bookable" logic is never duplicated across surfaces.
//
// It renders months from the listing's window, greys out days outside the
// window and days inside any booked range, and lets the caller select a single
// [from, to) night range by tapping a start day then an end day. The model
// (`AvailabilityDays`) is pure — it does the date math; the view is dumb.

// MARK: - Pure day model

// Resolves a listing's window + booked ranges into a fast per-day lookup. All
// dates are normalised to UTC midnight so they line up with the server's
// half-open [from, to) ranges (the checkout day frees up).
struct AvailabilityDays {
    let windowStart: Date
    let windowEnd: Date
    let minStay: Int
    let maxStay: Int
    // Set of UTC-midnight day starts that are occupied (inside a booked range).
    private let bookedDays: Set<Date>
    private let calendar: Calendar

    static var utcCalendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(secondsFromGMT: 0)!
        return c
    }

    init(availability: ListingAvailability) {
        var cal = Self.utcCalendar
        cal.firstWeekday = Calendar.current.firstWeekday
        self.calendar = cal
        self.minStay = max(1, availability.minStayDays)
        self.maxStay = max(self.minStay, availability.maxStayDays)

        let parsed = { (s: String) -> Date in
            (SwaplDateText.parse(s)).map { cal.startOfDay(for: $0) } ?? cal.startOfDay(for: Date())
        }
        self.windowStart = parsed(availability.availableFrom)
        self.windowEnd = parsed(availability.availableTo)

        var booked: Set<Date> = []
        for range in availability.bookedRanges {
            guard let rawFrom = SwaplDateText.parse(range.dateFrom),
                  let rawTo = SwaplDateText.parse(range.dateTo) else { continue }
            // Half-open: occupy [from, to). The checkout day stays bookable.
            var day = cal.startOfDay(for: rawFrom)
            let end = cal.startOfDay(for: rawTo)
            while day < end {
                booked.insert(day)
                guard let next = cal.date(byAdding: .day, value: 1, to: day) else { break }
                day = next
            }
        }
        self.bookedDays = booked
    }

    // Open-window calendar for the SEARCH composer (DOK-216): no listing, so no
    // booked ranges — just a future window the guest can pick any range within,
    // reusing the exact tap-start-then-end interaction of the listing pickers.
    init(openWindowFrom from: Date, to: Date, minStay: Int = 1, maxStay: Int = 365) {
        var cal = Self.utcCalendar
        cal.firstWeekday = Calendar.current.firstWeekday
        self.calendar = cal
        self.minStay = max(1, minStay)
        self.maxStay = max(self.minStay, maxStay)
        self.windowStart = cal.startOfDay(for: from)
        self.windowEnd = cal.startOfDay(for: to)
        self.bookedDays = []
    }

    func startOfDay(_ date: Date) -> Date { calendar.startOfDay(for: date) }

    // A day is selectable only if it's inside the window and not booked. The
    // window end is the last checkout — nights run up to (windowEnd), so the
    // last *night* a guest can occupy is windowEnd - 1.
    func isAvailable(_ date: Date) -> Bool {
        let day = calendar.startOfDay(for: date)
        guard day >= windowStart, day < windowEnd else { return false }
        return !bookedDays.contains(day)
    }

    func isBooked(_ date: Date) -> Bool {
        bookedDays.contains(calendar.startOfDay(for: date))
    }

    func isWithinWindow(_ date: Date) -> Bool {
        let day = calendar.startOfDay(for: date)
        return day >= windowStart && day <= windowEnd
    }

    func nights(from: Date, to: Date) -> Int {
        max(0, calendar.dateComponents([.day], from: calendar.startOfDay(for: from), to: calendar.startOfDay(for: to)).day ?? 0)
    }

    // Every day in [from, to) — used to validate a candidate range against the
    // booked set so a guest can't straddle an occupied night.
    func rangeIsBookable(from: Date, to: Date) -> Bool {
        let start = calendar.startOfDay(for: from)
        let end = calendar.startOfDay(for: to)
        guard end > start else { return false }
        let n = nights(from: start, to: end)
        guard n >= minStay, n <= maxStay else { return false }
        guard start >= windowStart, end <= windowEnd else { return false }
        var day = start
        while day < end {
            if bookedDays.contains(day) { return false }
            guard let next = calendar.date(byAdding: .day, value: 1, to: day) else { return false }
            day = next
        }
        return true
    }

    // The months to render: every month from windowStart through windowEnd.
    var months: [Date] {
        var out: [Date] = []
        let startMonth = calendar.dateInterval(of: .month, for: windowStart)?.start ?? windowStart
        let endMonth = calendar.dateInterval(of: .month, for: windowEnd)?.start ?? windowEnd
        var month = startMonth
        while month <= endMonth {
            out.append(month)
            guard let next = calendar.date(byAdding: .month, value: 1, to: month) else { break }
            month = next
            if out.count > 24 { break } // safety: never render an unbounded list
        }
        return out
    }

    func daysGrid(for month: Date) -> [Date?] {
        guard let interval = calendar.dateInterval(of: .month, for: month) else { return [] }
        let firstDay = interval.start
        let dayCount = calendar.range(of: .day, in: .month, for: month)?.count ?? 0
        let weekday = calendar.component(.weekday, from: firstDay)
        let leading = (weekday - calendar.firstWeekday + 7) % 7
        var cells: [Date?] = Array(repeating: nil, count: leading)
        for offset in 0..<dayCount {
            cells.append(calendar.date(byAdding: .day, value: offset, to: firstDay))
        }
        return cells
    }
}

// MARK: - Selection mode

enum AvailabilitySelectionMode {
    // Tap a start, then an end — produces a [from, to) night range. Used by the
    // Stay-with-Keys and filter date pickers.
    case range
    // Tap-to-toggle individual ranges for blocking. The editor handles taps
    // itself; this mode just paints selection without enforcing min/max stay.
    case blocking
}

// MARK: - View

struct AvailabilityCalendar: View {
    let days: AvailabilityDays
    let mode: AvailabilitySelectionMode
    @Binding var selectionStart: Date?
    @Binding var selectionEnd: Date?
    // Called whenever the selection changes to a complete (or cleared) range.
    var onSelectionChange: ((Date?, Date?) -> Void)? = nil

    // The tap state machine runs off this internal state, NOT the bindings:
    // callers commonly back the bindings with non-optional storage, so the
    // bindings never read nil after the first tap and the start→end flow would
    // get stuck restarting. localEnd truly goes nil between the two taps.
    @State private var localStart: Date?
    @State private var localEnd: Date?
    @State private var didInit = false
    // One month on screen at a time; swipe (or the ‹ › arrows) pages between them.
    @State private var monthIndex = 0

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 0), count: 7)
    private var cal: Calendar { AvailabilityDays.utcCalendar }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            monthNavHeader
            weekdayHeader
            // One month at a time. Rendered directly (NOT a paged TabView, whose
            // gesture swallows day-cell taps after a swipe — which blocked picking
            // a check-out in the next month). Navigate with the arrows or a swipe;
            // the drag has a minimum distance so plain taps still reach the days.
            monthGrid(currentMonth)
                .id(clampedMonthIndex)
                .transition(.opacity)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 24)
                        .onEnded { value in
                            let dx = value.translation.width, dy = value.translation.height
                            let delta = abs(dx) > abs(dy) ? dx : dy   // left/right OR up/down
                            if delta < -40 { goToMonth(monthIndex + 1) }
                            else if delta > 40 { goToMonth(monthIndex - 1) }
                        }
                )
            legend
        }
        .onAppear {
            guard !didInit else { return }
            localStart = selectionStart
            localEnd = selectionEnd
            monthIndex = initialMonthIndex()
            didInit = true
        }
    }

    private var clampedMonthIndex: Int {
        min(max(monthIndex, 0), max(0, days.months.count - 1))
    }

    private var currentMonth: Date {
        days.months.indices.contains(clampedMonthIndex) ? days.months[clampedMonthIndex] : days.windowStart
    }

    private func goToMonth(_ i: Int) {
        withAnimation(.snappy) { monthIndex = min(max(i, 0), max(0, days.months.count - 1)) }
    }

    // ‹ Month Year › — keeps the month label + arrows fixed above the paged grid.
    private var monthNavHeader: some View {
        HStack(spacing: 0) {
            Button {
                goToMonth(monthIndex - 1)
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(monthIndex > 0 ? AirbnbPalette.text : AirbnbPalette.secondaryText.opacity(0.35))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(monthIndex <= 0)
            .accessibilityLabel("Previous month")

            Spacer()
            Text(currentMonthTitle)
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Spacer()

            Button {
                goToMonth(monthIndex + 1)
            } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(monthIndex < days.months.count - 1 ? AirbnbPalette.text : AirbnbPalette.secondaryText.opacity(0.35))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(monthIndex >= days.months.count - 1)
            .accessibilityLabel("Next month")
        }
    }

    private var currentMonthTitle: String {
        days.months.isEmpty ? "" : monthTitle(currentMonth)
    }

    private func initialMonthIndex() -> Int {
        let anchor = localStart ?? days.windowStart
        let target = cal.dateInterval(of: .month, for: anchor)?.start ?? anchor
        return days.months.firstIndex { cal.isDate($0, equalTo: target, toGranularity: .month) } ?? 0
    }

    private var weekdayHeader: some View {
        HStack(spacing: 0) {
            ForEach(orderedWeekdaySymbols, id: \.self) { symbol in
                Text(symbol)
                    .font(.swaplMono(SwaplDesignSystem.FontSize.small, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private var orderedWeekdaySymbols: [String] {
        let symbols = Calendar.current.veryShortStandaloneWeekdaySymbols
        let first = Calendar.current.firstWeekday - 1
        return Array(symbols[first...] + symbols[..<first])
    }

    private func monthGrid(_ month: Date) -> some View {
        LazyVGrid(columns: columns, spacing: 4) {
            ForEach(Array(days.daysGrid(for: month).enumerated()), id: \.offset) { _, date in
                if let date {
                    dayCell(date)
                } else {
                    Color.clear.frame(height: 44)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .top)
    }

    private func dayCell(_ date: Date) -> some View {
        let available = days.isAvailable(date)
        let booked = days.isBooked(date)
        let withinWindow = days.isWithinWindow(date)
        let selected = isSelected(date)
        let isEndpoint = isEndpoint(date)

        return Button {
            tap(date)
        } label: {
            Text("\(cal.component(.day, from: date))")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: selected ? .bold : .medium))
                .foregroundStyle(dayForeground(available: available, withinWindow: withinWindow, selected: selected, isEndpoint: isEndpoint))
                .frame(maxWidth: .infinity)
                .frame(height: 44)
                .background(dayBackground(selected: selected, isEndpoint: isEndpoint))
                .overlay {
                    if booked {
                        // Strike-through to read "taken" at a glance, beyond colour.
                        Capsule()
                            .fill(AirbnbPalette.secondaryText.opacity(0.5))
                            .frame(height: 1)
                            .padding(.horizontal, 8)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!withinWindow || (mode == .range && booked))
        .accessibilityLabel(accessibilityLabel(date, available: available, booked: booked, withinWindow: withinWindow))
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }

    @ViewBuilder
    private func dayBackground(selected: Bool, isEndpoint: Bool) -> some View {
        if isEndpoint {
            Circle().fill(SwaplSemanticLight.primary).padding(2)
        } else if selected {
            SwaplSemanticLight.accent
        } else {
            Color.clear
        }
    }

    private func dayForeground(available: Bool, withinWindow: Bool, selected: Bool, isEndpoint: Bool) -> Color {
        if isEndpoint { return SwaplSemanticLight.primaryForeground }
        if !withinWindow { return AirbnbPalette.secondaryText.opacity(0.3) }
        if !available { return AirbnbPalette.secondaryText.opacity(0.55) }
        return AirbnbPalette.text
    }

    private var legend: some View {
        HStack(spacing: 18) {
            legendItem(color: SwaplSemanticLight.primary, label: "Selected")
            legendItem(color: AirbnbPalette.secondaryText.opacity(0.4), label: "Taken")
        }
        .padding(.top, 4)
    }

    private func legendItem(color: Color, label: String) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 10, height: 10)
            Text(label)
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
    }

    // MARK: - Selection logic

    private func isEndpoint(_ date: Date) -> Bool {
        let day = days.startOfDay(date)
        if let start = localStart, days.startOfDay(start) == day { return true }
        if let end = localEnd, days.startOfDay(end) == day { return true }
        return false
    }

    private func isSelected(_ date: Date) -> Bool {
        guard let start = localStart else { return false }
        let day = days.startOfDay(date)
        let s = days.startOfDay(start)
        guard let end = localEnd else { return day == s }
        let e = days.startOfDay(end)
        return day >= s && day <= e
    }

    private func tap(_ date: Date) {
        let day = days.startOfDay(date)
        // First tap (or a restart): set the check-in and wait for a check-out.
        // Restart when there's no start yet, a full range already exists, or the
        // tap lands on/before the current start.
        if localStart == nil || localEnd != nil || day <= days.startOfDay(localStart!) {
            localStart = day
            localEnd = nil
            commit(day, nil)
            return
        }
        // Second tap closes the range. In .range mode reject an end that crosses a
        // taken night or breaks min/max stay; in .blocking mode accept anything.
        let candidateEnd = day
        if mode == .range && !days.rangeIsBookable(from: localStart!, to: candidateEnd) {
            localStart = day
            localEnd = nil
            commit(day, nil)
            return
        }
        localEnd = candidateEnd
        commit(localStart, candidateEnd)
    }

    // Keep the public bindings + callback in step with the internal state.
    private func commit(_ start: Date?, _ end: Date?) {
        selectionStart = start
        selectionEnd = end
        onSelectionChange?(start, end)
    }

    private func monthTitle(_ month: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = AvailabilityDays.utcCalendar
        formatter.locale = Locale.current
        formatter.setLocalizedDateFormatFromTemplate("MMMM yyyy")
        return formatter.string(from: month)
    }

    private func accessibilityLabel(_ date: Date, available: Bool, booked: Bool, withinWindow: Bool) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale.current
        formatter.setLocalizedDateFormatFromTemplate("EEEE MMMM d")
        let day = formatter.string(from: date)
        if !withinWindow { return "\(day), unavailable" }
        if booked { return "\(day), taken" }
        return "\(day), available"
    }
}

// One-view range picker for date filters/searches with no specific listing
// (DOK-216): wraps AvailabilityCalendar over an open future window so every
// from/to picker in the app gets the same tap-check-in-then-check-out flow
// instead of two system DatePickers. Bridges the Date? calendar API to plain
// non-optional Date bindings the callers already use.
struct RangeDatePicker: View {
    @Binding var from: Date
    @Binding var to: Date
    var monthsAhead: Int = 12

    private var windowEnd: Date {
        Calendar.current.date(byAdding: .month, value: monthsAhead, to: Date()) ?? Date()
    }

    var body: some View {
        AvailabilityCalendar(
            days: AvailabilityDays(openWindowFrom: Date(), to: windowEnd),
            mode: .range,
            selectionStart: Binding(get: { from }, set: { if let v = $0 { from = v } }),
            selectionEnd: Binding(get: { to }, set: { to = $0 ?? from }),
            onSelectionChange: { f, t in
                if let f { from = f }
                to = t ?? Calendar.current.date(byAdding: .day, value: 1, to: f ?? from) ?? from
            }
        )
    }
}
