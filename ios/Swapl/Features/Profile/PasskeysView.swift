import SwiftUI
import SwaplDesignTokens

// MARK: - API models

// Mirrors PasskeySummary from the web app (lib/auth/passkeys.ts), returned by
// GET /api/auth/passkey as { "passkeys": [...] }.
struct PasskeySummary: Decodable, Identifiable, Sendable, Equatable {
    let id: String
    let name: String?
    let deviceType: String?
    let backedUp: Bool
    let createdAt: String
    let lastUsedAt: String?
}

struct PasskeyListResponse: Decodable, Sendable {
    let passkeys: [PasskeySummary]
}

// Profile → Passkeys. Lists the account's registered passkeys
// (GET /api/auth/passkey), lets the user remove one with confirmation
// (DELETE /api/auth/passkey/{id}) and enroll a new one via the system sheet.
struct PasskeysView: View {
    @Environment(AuthService.self) private var auth

    private enum LoadState {
        case loading
        case loaded([PasskeySummary])
        case failed(String)
    }

    @State private var state: LoadState = .loading
    @State private var isAdding = false
    @State private var removingId: String?
    @State private var pendingRemoval: PasskeySummary?
    @State private var addedThisSession = 0
    @State private var error: String?

    var body: some View {
        ScrollView {
            SwaplPageTitle("Passkeys")
            VStack(alignment: .leading, spacing: 18) {
                explainerCard

                if addedThisSession > 0 {
                    successCard
                }

                listSection

                if let error {
                    Text(error)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.destructive)
                }

                Button {
                    addPasskey()
                } label: {
                    HStack(spacing: 10) {
                        if isAdding {
                            ProgressView().tint(SwaplSemanticLight.primaryForeground)
                        } else {
                            Image(systemName: "plus")
                        }
                        Text(addedThisSession > 0 ? String(localized: "Add another passkey") : String(localized: "Add a passkey"))
                    }
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                    .foregroundStyle(SwaplSemanticLight.primaryForeground)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(SwaplSemanticLight.primary, in: Capsule())
                }
                .disabled(isAdding)
            }
            .padding(.horizontal, 22)
            .padding(.top, 24)
            .padding(.bottom, 60)
        }
        .swaplScreenBackground()
        .refreshable { await load() }
        .task { await load() }
        .confirmationDialog(
            "Remove this passkey?",
            isPresented: Binding(
                get: { pendingRemoval != nil },
                set: { if !$0 { pendingRemoval = nil } }
            ),
            titleVisibility: .visible,
            presenting: pendingRemoval
        ) { passkey in
            Button("Remove \u{201C}\(passkey.name ?? String(localized: "Passkey"))\u{201D}", role: .destructive) {
                removePasskey(passkey)
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("You won't be able to sign in with it anymore. The credential may still appear in your device's password settings until you delete it there.")
        }
    }

    // MARK: - Sections

    private var explainerCard: some View {
        HStack(alignment: .top, spacing: 16) {
            Image(systemName: "person.badge.key.fill")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .frame(width: 54, height: 54)
                .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            VStack(alignment: .leading, spacing: 6) {
                Text("Sign in without a password")
                    .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text("A passkey uses Face ID or Touch ID and syncs with iCloud Keychain. It can't be phished or guessed.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }

    private var successCard: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
            Text("Passkey saved. Next time, pick \u{201C}Sign in with a passkey\u{201D} on the login screen.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
    }

    @ViewBuilder
    private var listSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Your passkeys")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h3, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)

            switch state {
            case .loading:
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Loading passkeys…")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                .padding(.vertical, 18)
                .frame(maxWidth: .infinity)

            case .failed(let message):
                VStack(alignment: .leading, spacing: 10) {
                    Text(message)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                    Button {
                        state = .loading
                        Task { await load() }
                    } label: {
                        Text("Try again")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                            .foregroundStyle(SwaplSemanticLight.primary)
                    }
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                }

            case .loaded(let passkeys):
                if passkeys.isEmpty {
                    Text("No passkeys yet.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .padding(.vertical, 8)
                } else {
                    VStack(spacing: 0) {
                        ForEach(passkeys) { passkey in
                            passkeyRow(passkey)
                            if passkey.id != passkeys.last?.id {
                                Divider().overlay(AirbnbPalette.hairline)
                            }
                        }
                    }
                    .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                            .stroke(AirbnbPalette.hairline)
                    }
                }
            }
        }
    }

    private func passkeyRow(_ passkey: PasskeySummary) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: "key.fill")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .frame(width: 36, height: 36)
                .background(SwaplSemanticLight.accent, in: Circle())

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 8) {
                    Text(passkey.name ?? String(localized: "Passkey"))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .lineLimit(1)
                    if passkey.backedUp {
                        Text("Synced")
                            .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.primary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(SwaplSemanticLight.accent, in: Capsule())
                    }
                }
                Text(subtitle(for: passkey))
                    .font(.swaplBody(SwaplDesignSystem.FontSize.caption))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .lineLimit(2)
            }

            Spacer(minLength: 8)

            Button {
                pendingRemoval = passkey
            } label: {
                if removingId == passkey.id {
                    ProgressView()
                } else {
                    Text("Remove")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.destructive)
                }
            }
            .disabled(removingId != nil)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    // MARK: - Formatting

    // "Added Jun 12, 2026 · Last used Jun 12, 2026" — same content as web.
    private func subtitle(for passkey: PasskeySummary) -> String {
        var parts: [String] = []
        if let added = Self.shortDate(passkey.createdAt) {
            parts.append("Added \(added)")
        }
        if let lastUsed = passkey.lastUsedAt, let used = Self.shortDate(lastUsed) {
            parts.append("Last used \(used)")
        }
        return parts.isEmpty ? "—" : parts.joined(separator: " · ")
    }

    private static func shortDate(_ iso: String) -> String? {
        parseISO(iso)?.formatted(date: .abbreviated, time: .omitted)
    }

    // API timestamps are toISOString() — fractional seconds included.
    private static func parseISO(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    // MARK: - Actions

    private func load() async {
        do {
            let response: PasskeyListResponse = try await APIClient.shared.send("GET", "/api/auth/passkey")
            state = .loaded(response.passkeys)
        } catch {
            // Keep showing data we already have; only swap to the error state
            // when there's nothing on screen yet.
            if case .loaded = state { return }
            state = .failed("Couldn't load your passkeys. Check your connection and try again.")
        }
    }

    private func addPasskey() {
        guard !isAdding else { return }
        isAdding = true
        error = nil
        Task {
            defer { isAdding = false }
            do {
                try await auth.addPasskey()
                addedThisSession += 1
                await load()
            } catch PasskeyError.canceled {
                // User dismissed the system sheet — not an error.
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    private func removePasskey(_ passkey: PasskeySummary) {
        guard removingId == nil else { return }
        removingId = passkey.id
        error = nil
        Task {
            defer { removingId = nil }
            do {
                _ = try await APIClient.shared.send(
                    "DELETE", "/api/auth/passkey/\(passkey.id)", as: EmptyResponse.self
                )
                if case .loaded(let passkeys) = state {
                    state = .loaded(passkeys.filter { $0.id != passkey.id })
                }
                await load()
            } catch {
                self.error = String(localized: "Could not remove the passkey. Try again.")
            }
        }
    }
}
