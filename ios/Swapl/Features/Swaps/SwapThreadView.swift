import SwiftUI
import Observation
import SwaplDesignTokens

@Observable
final class SwapThreadViewModel {
    let proposalId: String
    var detail: ProposalDetail?
    var error: String?
    var isActing = false
    var counterFrom: Date = Date().addingTimeInterval(60 * 60 * 24 * 30)
    var counterTo: Date = Date().addingTimeInterval(60 * 60 * 24 * 37)
    var counterMessage: String = ""

    init(proposalId: String) { self.proposalId = proposalId }

    func load() async {
        do { detail = try await ProposalRepository.shared.detail(id: proposalId) }
        catch { self.error = error.localizedDescription }
    }

    func act(_ action: ProposalRepository.Action) async {
        isActing = true
        defer { isActing = false }
        do {
            _ = try await ProposalRepository.shared.act(proposalId: proposalId, action)
            await load()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct SwapThreadView: View {
    @State private var vm: SwapThreadViewModel
    @State private var showCounter = false

    init(proposalId: String) {
        _vm = State(initialValue: SwapThreadViewModel(proposalId: proposalId))
    }

    var body: some View {
        ScrollView {
            if let d = vm.detail {
                VStack(alignment: .leading, spacing: SwaplSpacing.s5) {
                    header(d)
                    listingPair(d)
                    proposalBody(d)
                    if let agreement = d.agreement, d.proposal.status == "ACCEPTED" {
                        agreedPanel(agreement, otherName: d.other.name ?? "your host")
                    }
                    actions(d)
                }
                .padding(SwaplSpacing.s4)
            } else if let err = vm.error {
                Text(err).foregroundStyle(SwaplSemanticLight.destructive).padding()
            } else {
                ProgressView().padding(40)
            }
        }
        .background(SwaplSemanticLight.background)
        .navigationTitle("Swap")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .sheet(isPresented: $showCounter) {
            counterSheet
        }
    }

    // ---------- sections ----------

    @ViewBuilder
    private func header(_ d: ProposalDetail) -> some View {
        VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
            TagChip(label: d.proposal.status)
            Text("\(d.proposerListing.city) ⇄ \(d.targetListing.city)")
                .font(.swaplDisplay(28))
                .foregroundStyle(SwaplSemanticLight.foreground)
            if let name = d.other.name {
                Text("with \(name)")
                    .font(.swaplBody(15))
                    .foregroundStyle(SwaplSemanticLight.mutedForeground)
            }
        }
    }

    @ViewBuilder
    private func listingPair(_ d: ProposalDetail) -> some View {
        HStack(spacing: SwaplSpacing.s3) {
            listingThumb(d.proposerListing)
            Image(systemName: "arrow.left.arrow.right")
                .foregroundStyle(SwaplColor.pink)
            listingThumb(d.targetListing)
        }
    }

    @ViewBuilder
    private func listingThumb(_ l: Listing) -> some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
                CityIllust(palette: SwaplCityPalettes.forName(l.palette))
                Text("\(l.neighbourhood) · \(l.city)")
                    .font(.swaplDisplay(15))
                Text("\(l.sizeSqm) m² · sleeps \(l.sleeps)")
                    .font(.swaplMono(11))
                    .foregroundStyle(SwaplSemanticLight.mutedForeground)
            }
        }
    }

    @ViewBuilder
    private func proposalBody(_ d: ProposalDetail) -> some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
                KickerLabel(text: "Proposal")
                Text(dateRange(d.proposal.dateFrom, d.proposal.dateTo))
                    .font(.swaplDisplay(20))
                if let m = d.proposal.message, !m.isEmpty {
                    Text(m).font(.swaplBody(15))
                }
                if let cf = d.proposal.counterDateFrom, let ct = d.proposal.counterDateTo {
                    Divider().background(SwaplSemanticLight.border)
                    KickerLabel(text: "Counter")
                    Text(dateRange(cf, ct))
                        .font(.swaplDisplay(18))
                        .foregroundStyle(SwaplColor.pink)
                    if let cm = d.proposal.counterMessage, !cm.isEmpty {
                        Text(cm).font(.swaplBody(14))
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func agreedPanel(_ a: ProposalDetail.Agreement, otherName: String) -> some View {
        // The "keys for keys" dark navy block from the web /swaps/[id] page.
        VStack(alignment: .leading, spacing: SwaplSpacing.s4) {
            Text("Swap agreed — keys for keys")
                .font(.swaplDisplay(22))
                .foregroundStyle(SwaplColor.cream)
            Text("Stay between \(dateRange(a.dateFrom, a.dateTo)) with \(otherName).")
                .font(.swaplBody(14))
                .foregroundStyle(SwaplColor.cream.opacity(0.85))

            HStack(spacing: SwaplSpacing.s4) {
                keyCard(title: "Your code (use at their place)", code: a.keyCode1)
                keyCard(title: "Their code (guest at your place)", code: a.keyCode2)
            }

            if let ins = a.insurance {
                Divider().background(SwaplColor.cream.opacity(0.2))
                VStack(alignment: .leading, spacing: 4) {
                    Text("Insurance · €\(ins.coverageAmount / 1000)k cover")
                        .font(.swaplMono(11))
                        .foregroundStyle(SwaplColor.cream.opacity(0.6))
                    Text(ins.policyNumber)
                        .font(.swaplMono(15, weight: .medium))
                        .foregroundStyle(SwaplColor.cream)
                    Text("Auto-issued · 24/7 line +44 800 000 swap")
                        .font(.swaplBody(13))
                        .foregroundStyle(SwaplColor.cream.opacity(0.7))
                }
            }
        }
        .padding(SwaplSpacing.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplColor.navy, in: RoundedRectangle(cornerRadius: SwaplRadius.lg))
    }

    @ViewBuilder
    private func keyCard(title: String, code: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.swaplMono(10))
                .foregroundStyle(SwaplColor.cream.opacity(0.6))
            Text(code ?? "----")
                .font(.swaplMono(28, weight: .medium))
                .foregroundStyle(SwaplColor.cream)
                .tracking(4)
        }
        .padding(SwaplSpacing.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplColor.navy2, in: RoundedRectangle(cornerRadius: SwaplRadius.md))
    }

    @ViewBuilder
    private func actions(_ d: ProposalDetail) -> some View {
        let isTarget = d.proposal.meSide == "target"
        let isProposer = d.proposal.meSide == "proposer"
        let canRespond = d.proposal.status == "PENDING" || d.proposal.status == "COUNTERED"

        VStack(spacing: SwaplSpacing.s2) {
            if canRespond && isTarget {
                PrimaryPill(title: "Accept swap", action: { Task { await vm.act(.accept) } }, isLoading: vm.isActing)
                GhostPill(title: "Counter-offer", action: { showCounter = true })
                GhostPill(title: "Decline", action: { Task { await vm.act(.decline) } })
            }
            if canRespond && isProposer {
                GhostPill(title: "Withdraw", action: { Task { await vm.act(.withdraw) } })
                GhostPill(title: "Counter-offer", action: { showCounter = true })
            }
        }
    }

    // ---------- counter sheet ----------

    private var counterSheet: some View {
        NavigationStack {
            Form {
                Section("New dates") {
                    DatePicker("From", selection: $vm.counterFrom, displayedComponents: .date)
                    DatePicker("To", selection: $vm.counterTo, displayedComponents: .date)
                }
                Section("Message (optional)") {
                    TextField("e.g. would these dates work?", text: $vm.counterMessage, axis: .vertical)
                        .lineLimit(3...8)
                }
            }
            .navigationTitle("Counter-offer")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showCounter = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        let from = ISO8601DateFormatter.dateOnly.string(from: vm.counterFrom)
                        let to = ISO8601DateFormatter.dateOnly.string(from: vm.counterTo)
                        let msg = vm.counterMessage.isEmpty ? nil : vm.counterMessage
                        showCounter = false
                        Task { await vm.act(.counter(dateFrom: from, dateTo: to, message: msg)) }
                    }
                    .disabled(vm.counterTo <= vm.counterFrom)
                }
            }
        }
    }

    private func dateRange(_ from: String, _ to: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let alt = ISO8601DateFormatter()
        alt.formatOptions = [.withInternetDateTime]
        let parse = { (s: String) -> Date? in parser.date(from: s) ?? alt.date(from: s) }
        guard let f = parse(from), let t = parse(to) else { return "\(from) – \(to)" }
        let fmt = DateFormatter()
        fmt.dateFormat = "MMM d"
        return "\(fmt.string(from: f)) – \(fmt.string(from: t))"
    }
}

private extension ISO8601DateFormatter {
    static let dateOnly: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withFullDate]
        return f
    }()
}
