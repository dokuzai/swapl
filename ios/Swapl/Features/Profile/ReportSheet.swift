import SwiftUI
import Observation
import SwaplDesignTokens

@MainActor
@Observable
final class ReportViewModel {
    let listingId: String?
    let targetUserId: String?
    var reason: String = ""
    var detail: String = ""
    var isSubmitting = false
    var error: String?
    var didSubmit = false

    init(targetUserId: String?, listingId: String?) {
        self.targetUserId = targetUserId
        self.listingId = listingId
    }

    func submit() async {
        isSubmitting = true; error = nil
        defer { isSubmitting = false }
        do {
            _ = try await ProfileRepository.shared.report(.init(
                reason: reason,
                detail: detail.isEmpty ? nil : detail,
                listingId: listingId,
                targetUserId: targetUserId
            ))
            didSubmit = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct ReportSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var vm: ReportViewModel

    init(targetUserId: String?, listingId: String?) {
        _vm = State(initialValue: ReportViewModel(targetUserId: targetUserId, listingId: listingId))
    }

    private let presets = [
        "Inappropriate content",
        "Scam or fake listing",
        "Harassment",
        "Discrimination",
        "Other",
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section("Reason") {
                    Picker("", selection: $vm.reason) {
                        ForEach(presets, id: \.self) { Text($0).tag($0) }
                    }
                    .pickerStyle(.inline)
                }
                Section("Details (optional)") {
                    TextField("What happened?", text: $vm.detail, axis: .vertical)
                        .lineLimit(4...10)
                }
                if let err = vm.error {
                    Section { Text(err).foregroundStyle(SwaplSemanticLight.destructive) }
                }
            }
            .navigationTitle("Report")
            .navigationBarTitleDisplayMode(.inline)
            .swaplScreenBackground()
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
                    .disabled(vm.reason.isEmpty || vm.isSubmitting)
                }
            }
        }
    }
}
