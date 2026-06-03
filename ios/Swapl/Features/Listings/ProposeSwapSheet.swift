import SwiftUI
import Observation
import SwaplDesignTokens

@Observable
final class ProposeSwapViewModel {
    let proposerListingId: String
    let targetListingId: String
    var dateFrom: Date = Date().addingTimeInterval(60 * 60 * 24 * 30)
    var dateTo: Date = Date().addingTimeInterval(60 * 60 * 24 * 37)
    var message: String = ""
    var isSubmitting = false
    var error: String?
    var didSubmit = false

    init(proposerListingId: String, targetListingId: String) {
        self.proposerListingId = proposerListingId
        self.targetListingId = targetListingId
    }

    func submit() async {
        isSubmitting = true; error = nil
        defer { isSubmitting = false }
        let fmt = ISO8601DateFormatter()
        fmt.formatOptions = [.withFullDate]
        let body = ProposalRepository.CreateBody(
            proposerListingId: proposerListingId,
            targetListingId: targetListingId,
            dateFrom: fmt.string(from: dateFrom),
            dateTo: fmt.string(from: dateTo),
            message: message.isEmpty ? nil : message
        )
        do {
            _ = try await ProposalRepository.shared.create(body)
            didSubmit = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ProposeSwapSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State var vm: ProposeSwapViewModel

    var body: some View {
        NavigationStack {
            Form {
                Section("Dates") {
                    DatePicker("From", selection: $vm.dateFrom, displayedComponents: .date)
                    DatePicker("To", selection: $vm.dateTo, displayedComponents: .date)
                }
                Section("Message (optional)") {
                    TextField("Why you'd love a swap…", text: $vm.message, axis: .vertical)
                        .lineLimit(3...10)
                }
                if let err = vm.error {
                    Section { Text(err).foregroundStyle(SwaplSemanticLight.destructive) }
                }
            }
            .navigationTitle("Propose a swap")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") {
                        Task {
                            await vm.submit()
                            if vm.didSubmit { dismiss() }
                        }
                    }
                    .disabled(vm.isSubmitting || vm.dateTo <= vm.dateFrom)
                }
            }
        }
    }
}
