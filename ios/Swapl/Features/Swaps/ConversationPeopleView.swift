import SwiftUI
import Observation
import SwaplDesignTokens

// People panel for a swap conversation (DOK-187).
//
// A) Everyone on the thread (both principals + active guests) sees the roster:
//    avatars, names, and a "Pending" badge for invitees who haven't joined.
// B) Only the two principals see the "Invite" button + "Add co-travelers"
//    quick-pick, and only they can remove a guest. The button simply doesn't
//    render for guests, so a 403 is never hit in the happy path — but the
//    view model still surfaces a friendly error if the server says no.
// C/D) Co-travelers join the message thread only. The copy makes clear that
//    inviting someone is easy and gives them no power over the swap itself.
@MainActor
@Observable
final class ConversationPeopleViewModel {
    let proposalId: String
    // Whether the *current user* is one of the two principals. Derived from the
    // proposal's meSide ("proposer"/"target") — guests have neither.
    let isPrincipal: Bool

    var participants: [ConversationParticipant] = []
    var suggestions: [ParticipantSuggestion] = []
    var isLoading = false
    var hasLoaded = false
    var loadError: String?

    var isInviting = false
    var inviteError: String?
    var inviteNotice: String?
    var removingId: String?

    init(proposalId: String, isPrincipal: Bool) {
        self.proposalId = proposalId
        self.isPrincipal = isPrincipal
    }

    var principals: [ConversationParticipant] { participants.filter(\.isPrincipal) }
    var guests: [ConversationParticipant] { participants.filter(\.isGuest) }

    func load() async {
        isLoading = true
        loadError = nil
        defer { isLoading = false }
        do {
            participants = try await ParticipantRepository.shared.participants(proposalId: proposalId)
            hasLoaded = true
            if isPrincipal { await loadSuggestions() }
        } catch {
            loadError = error.localizedDescription
            hasLoaded = true
        }
    }

    private func loadSuggestions() async {
        // Suggestions are a nice-to-have; failure is silent.
        suggestions = (try? await ParticipantRepository.shared.suggestions(proposalId: proposalId)) ?? []
    }

    // True once the email looks plausible — keeps the Send button honest.
    func isLikelyEmail(_ raw: String) -> Bool {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return value.contains("@") && value.contains(".") && !value.hasSuffix("@") && value.count >= 5
    }

    func inviteByEmail(_ raw: String) async -> Bool {
        let email = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isLikelyEmail(email) else {
            inviteError = String(localized: "Enter a valid email address.")
            return false
        }
        return await runInvite(notice: "Invite sent to \(email).") {
            try await ParticipantRepository.shared.invite(proposalId: self.proposalId, byEmail: email)
        }
    }

    func inviteSuggestion(_ suggestion: ParticipantSuggestion) async {
        _ = await runInvite(notice: "\(suggestion.displayName) was added.") {
            try await ParticipantRepository.shared.invite(proposalId: self.proposalId, byUserId: suggestion.id)
        }
    }

    private func runInvite(notice: String, _ work: @escaping () async throws -> Void) async -> Bool {
        isInviting = true
        inviteError = nil
        inviteNotice = nil
        defer { isInviting = false }
        do {
            try await work()
            await load()
            inviteNotice = notice
            return true
        } catch {
            inviteError = error.localizedDescription
            return false
        }
    }

    func remove(_ participant: ConversationParticipant) async {
        guard participant.isGuest else { return }
        removingId = participant.id
        defer { removingId = nil }
        do {
            try await ParticipantRepository.shared.remove(proposalId: proposalId, participantId: participant.id)
            await load()
        } catch {
            inviteError = error.localizedDescription
        }
    }
}

struct ConversationPeopleView: View {
    @State private var vm: ConversationPeopleViewModel
    @State private var showInvite = false
    @State private var confirmRemove: ConversationParticipant?
    // Collapsed by default — the roster is secondary to the conversation. Owned
    // by the chat view so it can auto-collapse the roster when the thread scrolls.
    @Binding var isExpanded: Bool

    init(proposalId: String, isPrincipal: Bool, isExpanded: Binding<Bool>) {
        _vm = State(initialValue: ConversationPeopleViewModel(proposalId: proposalId, isPrincipal: isPrincipal))
        _isExpanded = isExpanded
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header

            if isExpanded {
                if vm.isLoading && !vm.hasLoaded {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .accessibilityLabel("Loading people")
                } else if let error = vm.loadError, vm.participants.isEmpty {
                    Text(error)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                } else {
                    roster
                    if let notice = vm.inviteNotice {
                        Label(notice, systemImage: "checkmark.circle.fill")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.primary)
                    }
                    if vm.isPrincipal {
                        inviteButton
                        reassurance
                    }
                }
            }
        }
        .padding(.top, 10)
        .padding(.bottom, 60)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Not a solid bar: a long cream→clear fade (same concept as the hero fade
        // on the other pages). Only a thin band behind the label stays opaque for
        // legibility; below it the gradient is mostly transparent, so messages
        // are faintly visible and dissolve gradually as they scroll up.
        .background {
            LinearGradient(
                stops: [
                    .init(color: SwaplSemanticLight.background, location: 0),
                    .init(color: SwaplSemanticLight.background, location: 0.28),
                    .init(color: SwaplSemanticLight.background.opacity(0), location: 1)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .task { await vm.load() }
        .sheet(isPresented: $showInvite) {
            InvitePeopleSheet(vm: vm)
        }
        .confirmationDialog(
            confirmRemove.map { String(localized: "Remove \($0.displayName)?") } ?? String(localized: "Remove this person?"),
            isPresented: Binding(get: { confirmRemove != nil }, set: { if !$0 { confirmRemove = nil } }),
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {
                if let target = confirmRemove { Task { await vm.remove(target) } }
                confirmRemove = nil
            }
            Button("Cancel", role: .cancel) { confirmRemove = nil }
        } message: {
            Text("They'll lose access to this conversation. You can invite them again anytime.")
        }
    }

    private var header: some View {
        Button {
            withAnimation(.snappy) { isExpanded.toggle() }
        } label: {
            HStack(spacing: 10) {
                Text("People")
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Spacer()
                Text("\(vm.participants.count)")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                Image(systemName: "chevron.down")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .rotationEffect(.degrees(isExpanded ? 180 : 0))
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isExpanded ? "Collapse people" : "Expand people")
        .accessibilityValue("\(vm.participants.count)")
    }

    private var roster: some View {
        VStack(spacing: 10) {
            ForEach(vm.participants) { person in
                ParticipantRow(
                    participant: person,
                    canRemove: vm.isPrincipal && person.isGuest,
                    isRemoving: vm.removingId == person.id,
                    onRemove: { confirmRemove = person }
                )
            }
        }
    }

    private var inviteButton: some View {
        Button {
            vm.inviteNotice = nil
            showInvite = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "person.badge.plus")
                    .font(.system(size: 15, weight: .semibold))
                Text("Invite")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .foregroundStyle(AirbnbPalette.text)
            .padding(.vertical, 13)
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
            .background(AirbnbPalette.softBackground, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Invite someone to this conversation")
    }

    private var reassurance: some View {
        Text("Add a co-traveler in seconds. They can chat here, but only you and your swap partner can accept, counter, or cancel the swap.")
            .font(.swaplBody(SwaplDesignSystem.FontSize.small))
            .foregroundStyle(AirbnbPalette.secondaryText)
            .fixedSize(horizontal: false, vertical: true)
    }
}

// One roster line: avatar + name, a role/status badge, and (principals only) a
// remove affordance for guests.
struct ParticipantRow: View {
    let participant: ConversationParticipant
    let canRemove: Bool
    let isRemoving: Bool
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            ParticipantAvatar(name: participant.displayName, avatar: participant.avatar, size: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(participant.displayName)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .lineLimit(1)
                Text(participant.isPrincipal ? String(localized: "Swap partner") : String(localized: "Co-traveler"))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            if participant.isPending {
                StatusBadge(text: "Pending", tint: AirbnbPalette.secondaryText)
            }

            if canRemove {
                if isRemoving {
                    ProgressView().frame(width: 28, height: 28)
                } else {
                    Button(action: onRemove) {
                        Image(systemName: "minus.circle")
                            .font(.system(size: 19, weight: .semibold))
                            .foregroundStyle(AirbnbPalette.secondaryText)
                            .frame(width: 28, height: 28)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove \(participant.displayName)")
                }
            }
        }
    }
}

struct StatusBadge: View {
    let text: String
    let tint: Color

    var body: some View {
        Text(text)
            .font(.swaplBody(SwaplDesignSystem.FontSize.small, weight: .semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(tint.opacity(0.12), in: Capsule())
    }
}

struct ParticipantAvatar: View {
    let name: String
    let avatar: String?
    var size: CGFloat = 40

    var body: some View {
        ZStack {
            Circle().fill(SwaplSemanticLight.primary)
            if let avatar, let url = URL(string: avatar) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        initials
                    }
                }
            } else {
                initials
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var initials: some View {
        Text(String(name.prefix(1)).uppercased())
            .font(.swaplBody(size > 36 ? SwaplDesignSystem.FontSize.body : SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
            .foregroundStyle(SwaplSemanticLight.primaryForeground)
    }
}

// Invite sheet (principals only). Two ways in: an email field (or handle/user
// id pasted as-is into the same field via the segmented control) and the
// one-tap "Add co-travelers" quick-pick of people you've already swapped with.
struct InvitePeopleSheet: View {
    @Bindable var vm: ConversationPeopleViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @FocusState private var fieldFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text("Inviting someone is easy — they join the chat to help plan, and it gives them no say over the swap itself. Only you and your swap partner can accept, counter, or cancel.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)

                    emailSection

                    if !vm.suggestions.isEmpty {
                        suggestionsSection
                    }
                }
                .padding(20)
            }
            .swaplScreenBackground()
            .navigationTitle("Add co-travelers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task { fieldFocused = true }
        }
        .presentationDetents([.medium, .large])
    }

    private var emailSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Invite by email or username")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            HStack(spacing: 10) {
                TextField("name@email.com", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body))
                    .foregroundStyle(AirbnbPalette.text)
                    .focused($fieldFocused)
                    .submitLabel(.send)
                    .onSubmit { Task { await submit() } }
                    .padding(.horizontal, 16)
                    .frame(height: 50)
                    .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous).stroke(AirbnbPalette.hairline))

                Button { Task { await submit() } } label: {
                    Group {
                        if vm.isInviting {
                            ProgressView().tint(SwaplSemanticLight.primaryForeground)
                        } else {
                            Text("Send")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        }
                    }
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
                    .padding(.horizontal, 18)
                    .frame(height: 50)
                    .background(
                        vm.isLikelyEmail(email) && !vm.isInviting ? SwaplSemanticLight.primary : SwaplSemanticLight.primary.opacity(0.4),
                        in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    )
                }
                .disabled(!vm.isLikelyEmail(email) || vm.isInviting)
                .accessibilityLabel("Send invite")
            }

            if let error = vm.inviteError {
                Text(error)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.destructive)
            }

            Text("If they already have a Swapl account they join right away. Otherwise we'll email them an invite.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var suggestionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Add co-travelers")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text("People you've swapped with before — one tap to add.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)

            VStack(spacing: 8) {
                ForEach(vm.suggestions) { suggestion in
                    Button {
                        Task { await vm.inviteSuggestion(suggestion) }
                    } label: {
                        HStack(spacing: 12) {
                            ParticipantAvatar(name: suggestion.displayName, avatar: suggestion.avatar, size: 36)
                            Text(suggestion.displayName)
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                                .lineLimit(1)
                            Spacer()
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 22))
                                .foregroundStyle(SwaplSemanticLight.primary)
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 12)
                        .frame(maxWidth: .infinity)
                        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous).stroke(AirbnbPalette.hairline))
                    }
                    .buttonStyle(.plain)
                    .disabled(vm.isInviting)
                }
            }
        }
    }

    private func submit() async {
        let ok = await vm.inviteByEmail(email)
        if ok { email = "" }
    }
}
