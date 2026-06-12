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
    }

    func update(_ patch: ProfileRepository.SettingsPatch) async {
        guard let synced else { return }
        // Skip PATCHes that don't change anything (programmatic flips).
        let changed =
            (patch.searchEngineIndexing.map { $0 != synced.searchEngineIndexing } ?? false) ||
            (patch.showHomeCity.map { $0 != synced.showHomeCity } ?? false) ||
            (patch.emailNotifications.map { $0 != synced.emailNotifications } ?? false) ||
            (patch.pushNotifications.map { $0 != synced.pushNotifications } ?? false)
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
        .background(SwaplSemanticLight.background)
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
        .background(SwaplSemanticLight.background)
        .task { await vm.load() }
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
