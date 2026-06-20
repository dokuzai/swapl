import SwiftUI
import Observation
import PhotosUI
import UIKit
import SwaplDesignTokens

// Account → Personal information (DOK-147). Mirrors the web /account editor:
// display name, bio, work, languages, home city/country. Prefilled from
// GET /api/me, saved via PATCH /api/profile (partial; empty strings clear
// the nullable fields server-side).
@MainActor
@Observable
final class PersonalInfoViewModel {
    var name = ""
    var avatar: String?  // current profile-picture URL (DOK-216)
    var isUploadingAvatar = false
    var bio = ""
    var work = ""
    var languages = ""   // comma-separated in the UI, array on the wire
    var homeCity = ""
    var homeCountry = ""
    // Off-platform contact channels (DOK-204) — only shared with a swap partner
    // after both sides accept.
    var contact = ContactChannels()

    var isLoading = true
    var isSaving = false
    var error: String?
    var savedAt: Date?

    func load() async {
        error = nil
        do {
            let me = try await ProfileRepository.shared.me()
            name = me.user.name ?? ""
            avatar = me.user.avatar
            bio = me.user.bio ?? ""
            work = me.user.work ?? ""
            languages = (me.user.languages ?? []).joined(separator: ", ")
            homeCity = me.user.homeCity ?? ""
            homeCountry = me.user.homeCountry ?? ""
            contact = me.user.contactChannels ?? ContactChannels()
            isLoading = false
        } catch {
            self.error = error.localizedDescription
            isLoading = false
        }
    }

    func save() async {
        isSaving = true
        error = nil
        savedAt = nil
        defer { isSaving = false }
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = ProfileRepository.ProfileUpdateBody(
            // The API requires a non-empty name; skip the key when blank so
            // the stored name is kept rather than rejected.
            name: trimmedName.isEmpty ? nil : trimmedName,
            avatar: avatar,
            bio: bio.trimmingCharacters(in: .whitespacesAndNewlines),
            work: work.trimmingCharacters(in: .whitespacesAndNewlines),
            languages: languages
                .split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty },
            homeCity: homeCity.trimmingCharacters(in: .whitespacesAndNewlines),
            homeCountry: homeCountry.trimmingCharacters(in: .whitespacesAndNewlines),
            // Full-replace: send the complete current set each save.
            contactChannels: contact
        )
        do {
            _ = try await ProfileRepository.shared.updateProfile(body)
            savedAt = Date()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // Upload a picked image, then persist its URL onto the profile immediately so
    // the new avatar shows everywhere without waiting for the Save tap (DOK-216).
    func setAvatar(from data: Data) async {
        isUploadingAvatar = true
        error = nil
        defer { isUploadingAvatar = false }
        guard let jpeg = Self.downscaledJPEG(from: data) else {
            error = String(localized: "Couldn't read that image.")
            return
        }
        do {
            let url = try await APIClient.shared.uploadAvatar(jpeg)
            avatar = url
            await save()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // Downscale + JPEG-encode so we never upload a 12 MP original for a thumbnail.
    private static func downscaledJPEG(from data: Data, maxDimension: CGFloat = 1024, quality: CGFloat = 0.85) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let longest = max(image.size.width, image.size.height)
        let scale = longest > maxDimension ? maxDimension / longest : 1
        if scale >= 1 { return image.jpegData(compressionQuality: quality) }
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        let resized = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
        return resized.jpegData(compressionQuality: quality)
    }
}

struct PersonalInfoView: View {
    @Environment(AuthService.self) private var auth
    @State private var vm = PersonalInfoViewModel()
    @State private var avatarItem: PhotosPickerItem?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if vm.isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 200)
                        .accessibilityLabel("Loading your details")
                } else {
                    avatarSection
                    AccountField(title: "Display name", text: Bindable(vm).name, placeholder: "Your name")
                    AccountLongField(title: "About you", text: Bindable(vm).bio, placeholder: "Tell hosts a little about yourself.")
                    AccountField(title: "My work", text: Bindable(vm).work, placeholder: "e.g. Architect", icon: "briefcase")
                    AccountField(title: "Languages", text: Bindable(vm).languages, placeholder: "e.g. English, Italian", icon: "globe")
                    Text("Separate languages with commas.")
                        .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .padding(.top, -10)
                    AccountField(title: "Home city", text: Bindable(vm).homeCity, placeholder: "e.g. Milan", icon: "mappin.and.ellipse")
                    AccountField(title: "Home country", text: Bindable(vm).homeCountry, placeholder: "e.g. Italy")

                    contactSection

                    if let error = vm.error {
                        Text(error)
                            .font(.swaplBody(SwaplDesignSystem.FontSize.caption, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.destructive)
                    }
                    if vm.savedAt != nil {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(SwaplSemanticLight.primary)
                            Text("Saved. Your public profile is up to date.")
                                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                                .foregroundStyle(AirbnbPalette.text)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                    }

                    PrimaryPill(
                        title: "Save changes",
                        action: {
                            Task {
                                await vm.save()
                                // Refresh the session so the new name shows
                                // up on the Profile tab immediately.
                                if vm.savedAt != nil { await auth.refreshSession() }
                            }
                        },
                        isLoading: vm.isSaving
                    )
                }
            }
            .padding(.horizontal, 22)
            .padding(.top, 24)
            .padding(.bottom, 60)
        }
        .swaplFloatingHeader(String(localized: "Personal information"))
        .task { await vm.load() }
        .onChange(of: avatarItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    await vm.setAvatar(from: data)
                    if vm.savedAt != nil { await auth.refreshSession() }
                }
                avatarItem = nil
            }
        }
    }

    // MARK: - Profile picture (DOK-216)

    @ViewBuilder
    private var avatarSection: some View {
        HStack(spacing: 16) {
            ZStack {
                if let raw = vm.avatar, let url = URL(string: raw) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image): image.resizable().scaledToFill()
                        default: avatarPlaceholder
                        }
                    }
                } else {
                    avatarPlaceholder
                }
                if vm.isUploadingAvatar {
                    Color.black.opacity(0.35)
                    ProgressView().tint(.white)
                }
            }
            .frame(width: 72, height: 72)
            .clipShape(Circle())
            .overlay(Circle().stroke(AirbnbPalette.hairline))

            VStack(alignment: .leading, spacing: 4) {
                Text("Profile picture")
                    .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                PhotosPicker(selection: $avatarItem, matching: .images) {
                    Text(vm.avatar == nil ? String(localized: "Add a photo") : String(localized: "Change photo"))
                        .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                }
                .disabled(vm.isUploadingAvatar)
            }
            Spacer(minLength: 0)
        }
        .padding(.bottom, 4)
    }

    private var avatarPlaceholder: some View {
        ZStack {
            SwaplSemanticLight.accent
            Text(vm.name.first.map { String($0).uppercased() } ?? "?")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.h2, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
        }
    }

    // MARK: Contact channels (DOK-204)

    @ViewBuilder
    private var contactSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Contact")
                .font(.swaplBody(SwaplDesignSystem.FontSize.body, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
                .padding(.top, 8)
            Text("Only shared with a swap partner once you both accept a swap. Leave blank to keep private.")
                .font(.swaplBody(SwaplDesignSystem.FontSize.small))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .padding(.top, -6)

            ForEach(ContactChannelKind.allCases) { kind in
                AccountField(
                    title: kind.label,
                    text: contactBinding(kind),
                    placeholder: kind.placeholder,
                    icon: kind.systemImage,
                    autocapitalization: .never,
                    keyboard: keyboard(for: kind),
                    disableAutocorrection: true
                )
            }
        }
    }

    private func contactBinding(_ kind: ContactChannelKind) -> Binding<String> {
        Binding(
            get: { vm.contact.value(for: kind) ?? "" },
            set: { vm.contact.set(kind, $0) }
        )
    }

    private func keyboard(for kind: ContactChannelKind) -> UIKeyboardType {
        switch kind {
        case .email: .emailAddress
        // numbersAndPunctuation (not phonePad) so the "+" country prefix the
        // placeholder shows is reachable.
        case .phone, .whatsapp: .numbersAndPunctuation
        case .website: .URL
        default: .default
        }
    }
}

// MARK: - Shared field styles (account editors)

struct AccountField: View {
    let title: String
    @Binding var text: String
    let placeholder: String
    var icon: String?
    var autocapitalization: TextInputAutocapitalization = .words
    var keyboard: UIKeyboardType = .default
    var disableAutocorrection: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            HStack(spacing: 12) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                TextField(placeholder, text: $text)
                    .font(.swaplBody(17))
                    .textInputAutocapitalization(autocapitalization)
                    .keyboardType(keyboard)
                    .autocorrectionDisabled(disableAutocorrection)
            }
            .padding(16)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
    }
}

struct AccountLongField: View {
    let title: String
    @Binding var text: String
    let placeholder: String

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title)
                .font(.swaplBody(SwaplDesignSystem.FontSize.bodySmall, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            TextEditor(text: $text)
                .font(.swaplBody(17))
                .frame(minHeight: 110)
                .padding(12)
                .scrollContentBackground(.hidden)
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay(alignment: .topLeading) {
                    if text.isEmpty {
                        Text(placeholder)
                            .font(.swaplBody(17))
                            .foregroundStyle(AirbnbPalette.secondaryText.opacity(0.75))
                            .padding(.horizontal, 18)
                            .padding(.vertical, 20)
                            .allowsHitTesting(false)
                    }
                }
                .overlay {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                }
        }
    }
}
