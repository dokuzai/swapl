import SwiftUI
import Observation
import SwaplDesignTokens

@MainActor
@Observable
final class InterestsEditorViewModel {
    var catalog: InterestsCatalog?
    var selected: Set<String> = []
    var bioVibe: String = ""
    var error: String?
    var isSaving = false
    var didSave = false

    func load() async {
        do {
            let r = try await ProfileRepository.shared.interests()
            catalog = r
            selected = Set(r.selected)
        } catch { self.error = error.localizedDescription }
    }

    func toggle(_ slug: String) {
        if selected.contains(slug) { selected.remove(slug) }
        else if selected.count < 12 { selected.insert(slug) }
    }

    func save() async {
        isSaving = true; error = nil
        defer { isSaving = false }
        do {
            _ = try await ProfileRepository.shared.updateInterests(.init(
                interests: Array(selected),
                bioVibe: bioVibe.isEmpty ? nil : bioVibe
            ))
            didSave = true
        } catch { self.error = error.localizedDescription }
    }
}

struct InterestsEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var vm = InterestsEditorViewModel()

    var body: some View {
        Form {
            if let c = vm.catalog {
                Section("Your vibe (one line)") {
                    TextField("e.g. coffee, vintage shops, long walks", text: $vm.bioVibe)
                }
                ForEach(c.categories, id: \.id) { cat in
                    Section(cat.label) {
                        FlowChips(
                            tags: c.catalog.filter { $0.category == cat.id },
                            selected: vm.selected,
                            onToggle: { vm.toggle($0) }
                        )
                    }
                }
                if let err = vm.error {
                    Section { Text(err).foregroundStyle(SwaplSemanticLight.destructive) }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Interests · \(vm.selected.count) / 12")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    Task {
                        await vm.save()
                        if vm.didSave { dismiss() }
                    }
                }
                .disabled(vm.isSaving)
            }
        }
        .task { await vm.load() }
    }
}

private struct FlowChips: View {
    let tags: [InterestsCatalog.Tag]
    let selected: Set<String>
    let onToggle: (String) -> Void

    var body: some View {
        let columns = [GridItem(.adaptive(minimum: 120), spacing: SwaplSpacing.s2)]
        LazyVGrid(columns: columns, alignment: .leading, spacing: SwaplSpacing.s2) {
            ForEach(tags, id: \.slug) { t in
                Button(action: { onToggle(t.slug) }) {
                    Text(t.label)
                        .font(.swaplBody(13))
                        .padding(.vertical, 6)
                        .padding(.horizontal, 10)
                        .background(
                            selected.contains(t.slug) ? SwaplColor.pink : SwaplColor.tagBg,
                            in: Capsule()
                        )
                        .foregroundStyle(
                            selected.contains(t.slug) ? Color.white : SwaplColor.navy
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }
}
