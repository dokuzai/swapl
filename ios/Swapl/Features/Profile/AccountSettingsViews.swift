import SwiftUI
import Observation
import SwaplDesignTokens

// Account → Privacy & Notifications (DOK-147). Both screens share the same
// store: GET /api/profile/settings on appear, optimistic toggle + partial
// PATCH per switch, with a rollback to the server truth on failure.
@MainActor
@Observable
final class AccountSettingsViewModel {
    var searchEngineIndexing = true
    var showHomeCity = true
    var emailNotifications = true
    var pushNotifications = true
    var countDaysAbroad = false

    var isLoading = true
    var error: String?

    // Last state confirmed by the server. `update` no-ops when the toggle
    // already matches it, which breaks the loop that programmatic flips
    // (initial load, error rollback) would otherwise cause via onChange.
    private var synced: UserSettings?

    func load() async {
        error = nil
        do {
            apply(try await ProfileRepository.shared.settings())
            isLoading = false
        } catch {
            self.error = error.localizedDescription
            isLoading = false
        }
    }

    private func apply(_ s: UserSettings) {
        synced = s
        searchEngineIndexing = s.searchEngineIndexing
        showHomeCity = s.showHomeCity
        emailNotifications = s.emailNotifications
        pushNotifications = s.pushNotifications
        countDaysAbroad = s.countDaysAbroad ?? false
    }

    func update(_ patch: ProfileRepository.SettingsPatch) async {
        guard let synced else { return }
        // Skip PATCHes that don't change anything (programmatic flips).
        let changed =
            (patch.searchEngineIndexing.map { $0 != synced.searchEngineIndexing } ?? false) ||
            (patch.showHomeCity.map { $0 != synced.showHomeCity } ?? false) ||
            (patch.emailNotifications.map { $0 != synced.emailNotifications } ?? false) ||
            (patch.pushNotifications.map { $0 != synced.pushNotifications } ?? false) ||
            (patch.countDaysAbroad.map { $0 != (synced.countDaysAbroad ?? false) } ?? false)
        guard changed else { return }

        error = nil
        do {
            apply(try await ProfileRepository.shared.updateSettings(patch))
        } catch {
            self.error = error.localizedDescription
            // Roll the optimistic toggle back to the last known server state.
            apply(synced)
        }
    }
}

// Appearance picker (DOK-219): switch the whole app between the Swapl brand
// look (cream canvas) and a neutral Apple/system look. The choice is persisted
// in @AppStorage and read by SwaplThemeModifier at the app root, so flipping it
// re-skins every screen — and the tab bar — live.
struct AppearanceSettingsView: View {
    @AppStorage(SwaplAppearance.storageKey) private var appearanceRaw = SwaplAppearance.swapl.rawValue

    private var selection: SwaplAppearance { SwaplAppearance.resolve(appearanceRaw) }

    var body: some View {
        ScrollView {
            SwaplPageTitle("Appearance")
            VStack(alignment: .leading, spacing: 14) {
                Text("Choose how Swapl looks. This applies across the whole app.")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                    .padding(.bottom, 2)

                ForEach(SwaplAppearance.allCases) { option in
                    Button {
                        appearanceRaw = option.rawValue
                    } label: {
                        AppearanceOptionRow(option: option, selected: option == selection)
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(option == selection ? [.isSelected] : [])
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 24)
            .padding(.bottom, 60)
        }
        .swaplScreenBackground()
    }
}

private struct AppearanceOptionRow: View {
    let option: SwaplAppearance
    let selected: Bool

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: option.icon)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(selected ? SwaplSemanticLight.primary : AirbnbPalette.text)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 3) {
                Text(option.title)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                Text(option.subtitle)
                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            Spacer()
            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(selected ? SwaplSemanticLight.primary : AirbnbPalette.hairline)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                .stroke(selected ? SwaplSemanticLight.primary : AirbnbPalette.hairline, lineWidth: selected ? 2 : 1)
        }
    }
}

struct PrivacySettingsView: View {
    @State private var vm = AccountSettingsViewModel()

    var body: some View {
        ScrollView {
            SwaplPageTitle("Privacy")
            VStack(alignment: .leading, spacing: 14) {
                if vm.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 160)
                        .accessibilityLabel("Loading privacy settings")
                } else {
                    SettingToggleRow(
                        title: "Search engine indexing",
                        subtitle: "Allow your listing pages to appear in search engines like Google.",
                        systemImage: "magnifyingglass",
                        isOn: Bindable(vm).searchEngineIndexing,
                        onChange: { value in
                            Task { await vm.update(.init(searchEngineIndexing: value)) }
                        }
                    )
                    SettingToggleRow(
                        title: "Show my home city",
                        subtitle: "Display your home city and country on your public profile.",
                        systemImage: "mappin.and.ellipse",
                        isOn: Bindable(vm).showHomeCity,
                        onChange: { value in
                            Task { await vm.update(.init(showHomeCity: value)) }
                        }
                    )
                    SettingToggleRow(
                        title: "Count my days abroad",
                        subtitle: "Track your approximate location (country/city only) once a day to power Swapalitics. Off by default; nothing is stored until you turn this on.",
                        systemImage: "globe.europe.africa",
                        isOn: Bindable(vm).countDaysAbroad,
                        onChange: { value in
                            Task {
                                await vm.update(.init(countDaysAbroad: value))
                                // Start collecting right away when turned on.
                                if value { await LocationPingService.shared.pingNow() }
                            }
                        }
                    )

                    if let error = vm.error {
                        Text(error)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.destructive)
                    }

                    // The AI travel profile (what the assistant remembers
                    // about you, deletable) lives with privacy, like on web.
                    NavigationLink { TravelProfileView() } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 18, weight: .semibold))
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Your travel profile")
                                    .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                                Text("See and delete what the AI assistant remembers about you.")
                                    .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                                    .foregroundStyle(AirbnbPalette.secondaryText)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.secondaryText)
                        }
                        .foregroundStyle(AirbnbPalette.text)
                        .padding(18)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                                .stroke(AirbnbPalette.hairline)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 24)
            .padding(.bottom, 60)
        }
        .swaplScreenBackground()
        .task { await vm.load() }
    }
}

struct NotificationSettingsView: View {
    @State private var vm = AccountSettingsViewModel()

    var body: some View {
        ScrollView {
            SwaplPageTitle("Notifications")
            VStack(alignment: .leading, spacing: 14) {
                if vm.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 160)
                        .accessibilityLabel("Loading notification settings")
                } else {
                    SettingToggleRow(
                        title: "Email notifications",
                        subtitle: "Proposals, confirmations and trip reminders by email.",
                        systemImage: "envelope",
                        isOn: Bindable(vm).emailNotifications,
                        onChange: { value in
                            Task { await vm.update(.init(emailNotifications: value)) }
                        }
                    )
                    SettingToggleRow(
                        title: "Push notifications",
                        subtitle: "Real-time alerts on this device when something needs you.",
                        systemImage: "bell.badge",
                        isOn: Bindable(vm).pushNotifications,
                        onChange: { value in
                            Task { await vm.update(.init(pushNotifications: value)) }
                        }
                    )

                    if let error = vm.error {
                        Text(error)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.destructive)
                    }
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 24)
            .padding(.bottom, 60)
        }
        .swaplScreenBackground()
        .task { await vm.load() }
    }
}

// Account → Login & security → Change password (DOK-149). Three secure
// fields posted to /api/auth/change-password; the bearer token used for the
// request survives the server-side revocation of every other device.
struct ChangePasswordSheet: View {
    @Environment(\.dismiss) private var dismiss

    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isSubmitting = false
    @State private var error: String?
    @State private var didSucceed = false

    private var validationError: String? {
        if newPassword.count < 6 { return String(localized: "Use at least 6 characters.") }
        if newPassword != confirmPassword { return String(localized: "Passwords don't match.") }
        return nil
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("Current password", text: $currentPassword)
                        .textContentType(.password)
                } footer: {
                    Text("Leave empty if you signed up with Google, Telegram or an email code and never set a password.")
                }
                Section {
                    SecureField("New password", text: $newPassword)
                        .textContentType(.newPassword)
                    SecureField("Confirm new password", text: $confirmPassword)
                        .textContentType(.newPassword)
                } footer: {
                    Text("At least 6 characters. Changing your password signs out your other devices.")
                }

                if let error {
                    Section {
                        Text(error)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.destructive)
                    }
                }

                Section {
                    Button {
                        Task { await submit() }
                    } label: {
                        if isSubmitting {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Text("Change password")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(isSubmitting || newPassword.isEmpty || confirmPassword.isEmpty)
                }
            }
            .navigationTitle("Change password")
            .navigationBarTitleDisplayMode(.inline)
            .swaplScreenBackground()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .alert("Password changed", isPresented: $didSucceed) {
                Button("OK") { dismiss() }
            } message: {
                Text("Your other devices were signed out.")
            }
        }
    }

    private func submit() async {
        error = nil
        if let validationError {
            error = validationError
            return
        }
        isSubmitting = true
        defer { isSubmitting = false }

        struct ChangePasswordRequest: Encodable {
            let currentPassword: String?
            let newPassword: String
        }
        do {
            let trimmedCurrent = currentPassword.isEmpty ? nil : currentPassword
            let _: EmptyResponse = try await APIClient.shared.send(
                "POST", "/api/auth/change-password",
                body: ChangePasswordRequest(currentPassword: trimmedCurrent, newPassword: newPassword)
            )
            didSucceed = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// Card-style toggle row shared by the Privacy and Notifications screens.
struct SettingToggleRow: View {
    let title: String
    let subtitle: String
    let systemImage: String
    @Binding var isOn: Bool
    let onChange: (Bool) -> Void

    var body: some View {
        Toggle(isOn: $isOn) {
            HStack(spacing: 14) {
                Image(systemName: systemImage)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(width: 26)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text(subtitle)
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .tint(SwaplSemanticLight.primary)
        .onChange(of: isOn) { _, value in onChange(value) }
        .padding(18)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }
}
