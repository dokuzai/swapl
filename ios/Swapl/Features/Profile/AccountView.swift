import SwiftUI
import CoreLocation
import MapKit
import SwaplDesignTokens

struct AccountView: View {
    @Environment(AuthService.self) private var auth
    @State private var isConfirmingSignOut = false
    @State private var isCreatingListing = false

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottom) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        header
                        profileCard
                        quickCards
                        becomeHostCard
                        Color.clear.frame(height: 42)
                        menuSection(primaryMenu)
                        menuSection(hostMenu)

                        NavigationLink { InterestsEditorView() } label: { portedMenuRow("Interests", "heart.text.square") }
                            .buttonStyle(.plain)
                        NavigationLink { SavedSearchesView() } label: { portedMenuRow("Saved searches", "magnifyingglass") }
                            .buttonStyle(.plain)
                        signOutRow
                    }
                    .padding(.horizontal, 22)
                    .padding(.top, 22)
                    .padding(.bottom, 148)
                }
                .background(SwaplSemanticLight.background)

                Button {
                    isCreatingListing = true
                } label: {
                    Label("Switch to hosting", systemImage: "arrow.up.arrow.down")
                        .font(.swaplBody(17, weight: .bold))
                        .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        .padding(.horizontal, 26)
                        .frame(height: 58)
                        .background(SwaplColor.navyDark, in: Capsule())
                        .shadow(color: .black.opacity(0.18), radius: 18, x: 0, y: 10)
                }
                .padding(.bottom, 18)
            }
            .toolbar(.hidden, for: .navigationBar)
            .fullScreenCover(isPresented: $isCreatingListing) {
                ListingCreationView()
            }
            .confirmationDialog("Sign out of Swapl?", isPresented: $isConfirmingSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) {
                    Task { await auth.signOut() }
                }
                Button("Cancel", role: .cancel) {}
            }
        }
    }

    private func portedMenuRow(_ title: String, _ icon: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon).font(.system(size: 18, weight: .semibold))
            Text(title).font(.swaplBody(16, weight: .semibold))
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 14, weight: .semibold)).foregroundStyle(AirbnbPalette.secondaryText)
        }
        .foregroundStyle(AirbnbPalette.text)
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var header: some View {
        HStack(alignment: .center) {
            Text("Profile")
                .font(.swaplDisplay(SwaplDesignSystem.FontSize.display, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Spacer()
            Button(action: {}) {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: "bell")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                        .frame(width: 54, height: 54)
                        .background(SwaplSemanticLight.card, in: Circle())
                    Circle()
                        .fill(SwaplSemanticLight.primary)
                        .frame(width: 10, height: 10)
                        .padding(13)
                }
            }
        }
    }

    private var profileCard: some View {
        HStack(spacing: 22) {
            VStack(spacing: 12) {
                ZStack(alignment: .bottomTrailing) {
                    Circle()
                        .fill(SwaplSemanticLight.primary)
                        .frame(width: 118, height: 118)
                        .overlay {
                            Text(initials)
                                .font(.swaplDisplay(44, weight: .semibold))
                                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        }
                    Image(systemName: "checkmark.shield.fill")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primaryForeground)
                        .frame(width: 44, height: 44)
                        .background(SwaplSemanticLight.primary, in: Circle())
                        .overlay(Circle().stroke(SwaplSemanticLight.card, lineWidth: 4))
                }
                Text(displayName)
                    .font(.swaplDisplay(30, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .lineLimit(1)
                Text("Swapl member")
                    .font(.swaplBody(15))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .frame(maxWidth: .infinity)

            VStack(alignment: .leading, spacing: 14) {
                profileStat("2", "Trips")
                Divider()
                profileStat("1", "Home")
                Divider()
                profileStat("2026", "Member since")
            }
            .frame(width: 120, alignment: .leading)
        }
        .padding(24)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.xLarge, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
        .shadow(color: .black.opacity(0.05), radius: 20, x: 0, y: 10)
    }

    private var quickCards: some View {
        HStack(spacing: 14) {
            ProfileFeatureCard(title: "Past trips", subtitle: "Your completed swaps", systemImage: "suitcase.rolling")
            ProfileFeatureCard(title: "Connections", subtitle: "Hosts you know", systemImage: "person.2")
        }
    }

    private var becomeHostCard: some View {
        Button {
            isCreatingListing = true
        } label: {
            HStack(spacing: 18) {
                ZStack {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .fill(SwaplSemanticLight.accent)
                    Image(systemName: "house.and.flag")
                        .font(.system(size: 32, weight: .semibold))
                        .foregroundStyle(SwaplSemanticLight.primary)
                }
                .frame(width: 86, height: 86)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Become a host")
                        .font(.swaplDisplay(23, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text("Create your home listing and start proposing swaps.")
                        .font(.swaplBody(15))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(18)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
        .buttonStyle(.plain)
    }

    private var primaryMenu: [ProfileMenuItem] {
        [
            .init(title: "Account settings", systemImage: "gearshape"),
            .init(title: "Get help", systemImage: "questionmark.circle"),
            .init(title: "View profile", systemImage: "person"),
            .init(title: "Privacy", systemImage: "hand.raised")
        ]
    }

    private var hostMenu: [ProfileMenuItem] {
        [
            .init(title: "Your listings", systemImage: "rectangle.stack"),
            .init(title: "Saved searches", systemImage: "bell.badge"),
            .init(title: "Legal", systemImage: "book.closed")
        ]
    }

    private var signOutRow: some View {
        Button {
            isConfirmingSignOut = true
        } label: {
            HStack(spacing: 18) {
                Image(systemName: "door.left.hand.open")
                    .font(.system(size: 24, weight: .regular))
                    .frame(width: 34)
                Text("Log out")
                    .font(.swaplBody(18, weight: .semibold))
                Spacer()
            }
            .foregroundStyle(AirbnbPalette.text)
            .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
    }

    private func menuSection(_ items: [ProfileMenuItem]) -> some View {
        VStack(spacing: 0) {
            ForEach(items) { item in
                HStack(spacing: 18) {
                    Image(systemName: item.systemImage)
                        .font(.system(size: 24, weight: .regular))
                        .frame(width: 34)
                    Text(item.title)
                        .font(.swaplBody(18, weight: .semibold))
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                }
                .foregroundStyle(AirbnbPalette.text)
                .padding(.vertical, 18)

                if item.id != items.last?.id {
                    Divider().padding(.leading, 52)
                }
            }
        }
    }

    private func profileStat(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.swaplDisplay(28, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text(label)
                .font(.swaplBody(14, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
        }
    }

    private var displayName: String {
        auth.session?.name ?? auth.session?.email.components(separatedBy: "@").first ?? "Guest"
    }

    private var initials: String {
        String(displayName.prefix(1)).uppercased()
    }
}

private struct ProfileMenuItem: Identifiable {
    let id = UUID()
    let title: String
    let systemImage: String
}

private struct ProfileFeatureCard: View {
    let title: String
    let subtitle: String
    let systemImage: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(SwaplSemanticLight.primary)
                .frame(width: 54, height: 54)
                .background(SwaplSemanticLight.accent, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            Spacer(minLength: 10)
            Text(title)
                .font(.swaplDisplay(20, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
                .lineLimit(1)
            Text(subtitle)
                .font(.swaplBody(13))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, minHeight: 170, alignment: .leading)
        .padding(18)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }
}

struct ListingCreationView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var locationService = ListingLocationService()
    @State private var step = 0
    @State private var draft = ListingCreationDraft()
    @State private var error: String?
    @State private var isPublishing = false
    @State private var createdListingId: String?

    private let steps = ["Location", "Space", "Amenities", "Dates", "Review"]

    init(extractedInfo: ExtractedListingInfo? = nil) {
        _draft = State(initialValue: ListingCreationDraft(extractedInfo: extractedInfo))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                topBar
                progressHeader

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        currentStep
                        if let error {
                            Text(error)
                                .font(.swaplBody(14, weight: .semibold))
                                .foregroundStyle(SwaplSemanticLight.destructive)
                                .padding(.top, 4)
                        }
                    }
                    .padding(.horizontal, 22)
                    .padding(.top, 24)
                    .padding(.bottom, 120)
                }
                .background(SwaplSemanticLight.background)
            }
            .safeAreaInset(edge: .bottom) {
                bottomBar
            }
            .alert("Listing published", isPresented: createdBinding) {
                Button("Done") { dismiss() }
            } message: {
                Text("Your home is now ready for swaps.")
            }
            .toolbar(.hidden, for: .navigationBar)
            .onChange(of: locationService.detectedAddress) { _, address in
                guard let address else { return }
                applyDetectedAddress(address)
            }
        }
    }

    private var topBar: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(width: 44, height: 44)
                    .background(SwaplSemanticLight.card, in: Circle())
            }
            Spacer()
            Text("Create listing")
                .font(.swaplBody(17, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            Spacer()
            Button(action: {}) {
                Image(systemName: "gearshape")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(width: 44, height: 44)
                    .background(SwaplSemanticLight.card, in: Circle())
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
        .background(SwaplSemanticLight.background)
    }

    private var progressHeader: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Step \(step + 1) of \(steps.count)")
                .font(.swaplMono(11, weight: .medium))
                .foregroundStyle(SwaplSemanticLight.primary)
                .textCase(.uppercase)
            Text(steps[step])
                .font(.swaplDisplay(34, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            ProgressView(value: Double(step + 1), total: Double(steps.count))
                .tint(SwaplSemanticLight.primary)
        }
        .padding(.horizontal, 22)
        .padding(.bottom, 18)
        .background(SwaplSemanticLight.background)
    }

    @ViewBuilder
    private var currentStep: some View {
        switch step {
        case 0:
            locationStep
        case 1:
            spaceStep
        case 2:
            amenitiesStep
        case 3:
            datesStep
        default:
            reviewStep
        }
    }

    private var locationStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Start with where you are")
                .font(.swaplDisplay(26, weight: .semibold))
                .foregroundStyle(AirbnbPalette.text)
            Text("Most hosts create the listing while they are at home. Use location once to fill the address, city, neighbourhood, country and map pin.")
                .font(.swaplBody(15))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .fixedSize(horizontal: false, vertical: true)

            LocationAutofillCard(
                status: locationService.statusText,
                isResolving: locationService.isResolving,
                action: { locationService.requestCurrentHomeLocation() }
            )

            AddressSearchField(text: $draft.address)
            ListingField(title: "City", text: $draft.city, placeholder: "Istanbul")
            ListingField(title: "Neighbourhood", text: $draft.neighbourhood, placeholder: "Cihangir")
            ListingField(title: "Country", text: $draft.country, placeholder: "Turkey")
        }
    }

    private var spaceStep: some View {
        VStack(spacing: 14) {
            ListingField(title: "Title", text: $draft.title, placeholder: "Sunny apartment near the water")
            ListingLongField(title: "Description", text: $draft.description, placeholder: "Describe the home, light, neighbourhood, and what makes the stay easy.")
            ListingPicker(title: "Property type", selection: $draft.propertyType, values: ["APARTMENT", "HOUSE", "ROOM", "STUDIO"])
            StepperCard(title: "Size", value: $draft.sizeSqm, range: 20...800, suffix: "sqm", step: 5)
            StepperCard(title: "Guests", value: $draft.sleeps, range: 1...20, suffix: "guests")
            StepperCard(title: "Bedrooms", value: $draft.bedrooms, range: 0...15, suffix: "bedrooms")
            StepperCard(title: "Bathrooms", value: $draft.bathrooms, range: 0...10, suffix: "bathrooms")
        }
    }

    private var amenitiesStep: some View {
        VStack(spacing: 14) {
            ToggleCard(title: "Elevator", systemImage: "arrow.up.arrow.down", isOn: $draft.hasElevator)
            ToggleCard(title: "Step-free access", systemImage: "figure.roll", isOn: $draft.stepFreeAccess)
            ToggleCard(title: "Pets allowed", systemImage: "pawprint", isOn: $draft.petsAllowed)
            ToggleCard(title: "Work setup", systemImage: "desktopcomputer", isOn: $draft.wfhSetup)
            ToggleCard(title: "Balcony", systemImage: "sun.max", isOn: $draft.balcony)
            ToggleCard(title: "Air conditioning", systemImage: "snowflake", isOn: $draft.ac)
            ToggleCard(title: "Washer", systemImage: "washer", isOn: $draft.washer)
            ToggleCard(title: "Dishwasher", systemImage: "dishwasher", isOn: $draft.dishwasher)
        }
    }

    private var datesStep: some View {
        VStack(spacing: 14) {
            DateCard(title: "Available from", date: $draft.availableFrom)
            DateCard(title: "Available to", date: $draft.availableTo)
            StepperCard(title: "Minimum stay", value: $draft.minStayDays, range: 1...180, suffix: "nights")
            StepperCard(title: "Maximum stay", value: $draft.maxStayDays, range: 1...365, suffix: "nights")
            ListingField(title: "Photo URL", text: $draft.photoURL, placeholder: "https://...")
        }
    }

    private var reviewStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text(draft.title.isEmpty ? "Untitled home" : draft.title)
                    .font(.swaplDisplay(28, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.text)
                    .lineLimit(2)
                Text("\(draft.neighbourhood), \(draft.city), \(draft.country)")
                    .font(.swaplBody(16))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                Text("\(draft.sleeps) guests · \(draft.bedrooms) bedrooms · \(draft.bathrooms) baths")
                    .font(.swaplBody(15))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(22)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }

            Text("Once published, your listing appears in Browse and can be used in swap proposals.")
                .font(.swaplBody(15))
                .foregroundStyle(AirbnbPalette.secondaryText)
                .padding(.horizontal, 4)
        }
    }

    private var bottomBar: some View {
        HStack(spacing: 12) {
            Button {
                error = nil
                step = max(0, step - 1)
            } label: {
                Text("Back")
                    .font(.swaplBody(16, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                    .background(SwaplSemanticLight.card, in: Capsule())
            }
            .disabled(step == 0 || isPublishing)
            .opacity(step == 0 ? 0.45 : 1)

            Button {
                advance()
            } label: {
                HStack {
                    if isPublishing { ProgressView().tint(SwaplSemanticLight.primaryForeground) }
                    Text(step == steps.count - 1 ? "Publish" : "Continue")
                }
                .font(.swaplBody(16, weight: .bold))
                .foregroundStyle(SwaplSemanticLight.primaryForeground)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(SwaplSemanticLight.primary, in: Capsule())
            }
            .disabled(isPublishing)
        }
        .padding(.horizontal, 22)
        .padding(.top, 12)
        .padding(.bottom, 12)
        .background(.ultraThinMaterial)
    }

    private var createdBinding: Binding<Bool> {
        Binding(
            get: { createdListingId != nil },
            set: { if !$0 { createdListingId = nil } }
        )
    }

    private func advance() {
        error = validate()
        guard error == nil else { return }
        if step < steps.count - 1 {
            step += 1
        } else {
            Task { await publish() }
        }
    }

    private func validate() -> String? {
        switch step {
        case 0:
            if draft.city.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 { return "Add a city." }
            if draft.neighbourhood.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 { return "Add a neighbourhood." }
            if draft.country.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 { return "Add a country." }
        case 1:
            if draft.title.trimmingCharacters(in: .whitespacesAndNewlines).count < 4 { return "Add a clearer title." }
            if draft.description.trimmingCharacters(in: .whitespacesAndNewlines).count < 20 { return "Write at least 20 characters about your home." }
        case 3:
            if draft.availableTo <= draft.availableFrom { return "End date must be after start date." }
            if draft.maxStayDays < draft.minStayDays { return "Maximum stay must be at least the minimum stay." }
        default:
            break
        }
        return nil
    }

    private func publish() async {
        isPublishing = true
        error = nil
        defer { isPublishing = false }
        do {
            let response = try await ListingRepository.shared.create(draft.payload)
            createdListingId = response.id
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func applyDetectedAddress(_ address: DetectedHomeAddress) {
        if !address.city.isEmpty { draft.city = address.city }
        if !address.neighbourhood.isEmpty { draft.neighbourhood = address.neighbourhood }
        if !address.country.isEmpty { draft.country = address.country }
        if !address.address.isEmpty { draft.address = address.address }
        draft.lat = address.latitude
        draft.lng = address.longitude
    }
}

private struct ListingCreationDraft {
    var city = "Istanbul"
    var neighbourhood = "Cihangir"
    var country = "Turkey"
    var address = ""
    var lat: Double?
    var lng: Double?
    var title = "Sunny apartment in Cihangir"
    var description = "A calm, light-filled home close to cafes, galleries, transit, and long walks by the water."
    var propertyType = "APARTMENT"
    var sizeSqm = 80
    var sleeps = 3
    var bedrooms = 2
    var bathrooms = 1
    var hasElevator = false
    var stepFreeAccess = false
    var petsAllowed = false
    var wfhSetup = true
    var balcony = true
    var ac = true
    var washer = true
    var dishwasher = true
    var availableFrom = Calendar.current.date(byAdding: .day, value: 60, to: Date()) ?? Date()
    var availableTo = Calendar.current.date(byAdding: .day, value: 90, to: Date()) ?? Date()
    var minStayDays = 7
    var maxStayDays = 30
    var photoURL = ""

    init() {}

    init(extractedInfo: ExtractedListingInfo?) {
        self.init()
        guard let extractedInfo else { return }
        if let title = extractedInfo.title, !title.isEmpty { self.title = title }
        if let description = extractedInfo.description, !description.isEmpty { self.description = description }
        if let city = extractedInfo.city, !city.isEmpty { self.city = city }
        if let neighbourhood = extractedInfo.neighbourhood, !neighbourhood.isEmpty { self.neighbourhood = neighbourhood }
        if let bedrooms = extractedInfo.bedrooms { self.bedrooms = bedrooms }
        if let bathrooms = extractedInfo.bathrooms { self.bathrooms = bathrooms }
        if let sleeps = extractedInfo.sleeps { self.sleeps = sleeps }
        if let startDate = extractedInfo.startDate { self.availableFrom = startDate }
        if let endDate = extractedInfo.endDate { self.availableTo = endDate }
        if let amenities = extractedInfo.amenities {
            let normalized = Set(amenities.map { $0.lowercased() })
            balcony = normalized.contains("balcony")
            ac = normalized.contains("ac") || normalized.contains("air conditioning")
            washer = normalized.contains("washer")
            dishwasher = normalized.contains("dishwasher")
            wfhSetup = normalized.contains("workspace") || normalized.contains("desk")
        }
    }

    var payload: ListingCreateDraft {
        ListingCreateDraft(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            description: description.trimmingCharacters(in: .whitespacesAndNewlines),
            propertyType: propertyType,
            city: city.trimmingCharacters(in: .whitespacesAndNewlines),
            neighbourhood: neighbourhood.trimmingCharacters(in: .whitespacesAndNewlines),
            country: country.trimmingCharacters(in: .whitespacesAndNewlines),
            address: address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : address,
            lat: lat,
            lng: lng,
            sizeSqm: sizeSqm,
            sleeps: sleeps,
            bedrooms: bedrooms,
            bathrooms: bathrooms,
            floor: nil,
            hasElevator: hasElevator,
            stepFreeAccess: stepFreeAccess,
            petsAllowed: petsAllowed,
            petTypes: petsAllowed ? ["dogs", "cats"] : [],
            wfhSetup: wfhSetup,
            wfhDesks: wfhSetup ? 1 : 0,
            hasParking: false,
            bikeIncluded: false,
            rooftop: false,
            balcony: balcony,
            garden: false,
            courtyard: false,
            piano: false,
            pool: false,
            gym: false,
            ac: ac,
            dishwasher: dishwasher,
            washer: washer,
            dryer: false,
            availableFrom: SwaplDateText.apiString(from: availableFrom),
            availableTo: SwaplDateText.apiString(from: availableTo),
            minStayDays: minStayDays,
            maxStayDays: maxStayDays,
            photos: photoURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? [] : [photoURL],
            tags: []
        )
    }
}

private struct ListingField: View {
    let title: String
    @Binding var text: String
    let placeholder: String

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title)
                .font(.swaplBody(15, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            TextField(placeholder, text: $text)
                .font(.swaplBody(17))
                .textInputAutocapitalization(.words)
                .padding(16)
                .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                        .stroke(AirbnbPalette.hairline)
                }
        }
    }
}

private struct AddressSearchField: View {
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("Address")
                .font(.swaplBody(15, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
                TextField("Search or enter your home address", text: $text)
                    .font(.swaplBody(17))
                    .textInputAutocapitalization(.words)
            }
            .padding(.horizontal, 18)
            .frame(height: 58)
            .background(SwaplSemanticLight.card, in: Capsule())
            .overlay {
                Capsule().stroke(AirbnbPalette.hairline)
            }
            Text("Only the approximate area is shown publicly.")
                .font(.swaplBody(13))
                .foregroundStyle(AirbnbPalette.secondaryText)
        }
    }
}

private struct LocationAutofillCard: View {
    let status: String
    let isResolving: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(SwaplSemanticLight.accent)
                    if isResolving {
                        ProgressView()
                            .tint(SwaplSemanticLight.primary)
                    } else {
                        Image(systemName: "location.fill")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(SwaplSemanticLight.primary)
                    }
                }
                .frame(width: 54, height: 54)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Use my current location")
                        .font(.swaplBody(17, weight: .bold))
                        .foregroundStyle(AirbnbPalette.text)
                    Text(status)
                        .font(.swaplBody(14))
                        .foregroundStyle(AirbnbPalette.secondaryText)
                        .lineLimit(2)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            .padding(18)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.large, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
        }
        .buttonStyle(.plain)
        .disabled(isResolving)
    }
}

private struct DetectedHomeAddress: Equatable {
    let city: String
    let neighbourhood: String
    let country: String
    let address: String
    let latitude: Double
    let longitude: Double
}

@MainActor
private final class ListingLocationService: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var isResolving = false
    @Published var statusText = "Fill location automatically while you are at the home."
    @Published var detectedAddress: DetectedHomeAddress?

    private let manager = CLLocationManager()
    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    func requestCurrentHomeLocation() {
        guard CLLocationManager.locationServicesEnabled() else {
            statusText = "Location services are off. Enter the address manually."
            return
        }

        switch manager.authorizationStatus {
        case .notDetermined:
            statusText = "Allow location access to prefill your home details."
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            locate()
        case .denied, .restricted:
            statusText = "Location access is off for Swapl. Enter the address manually or enable it in Settings."
        @unknown default:
            statusText = "Enter the address manually."
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in
            switch status {
            case .authorizedWhenInUse, .authorizedAlways:
                locate()
            case .denied, .restricted:
                statusText = "Location access is off for Swapl. Enter the address manually or enable it in Settings."
            default:
                break
            }
        }
    }

    private func locate() {
        isResolving = true
        statusText = "Finding this home..."
        manager.requestLocation()
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }
        Task { @MainActor in
            await resolve(location)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            isResolving = false
            statusText = "Could not get your location. Enter the address manually."
        }
    }

    private func resolve(_ location: CLLocation) async {
        do {
            guard let request = MKReverseGeocodingRequest(location: location) else {
                statusText = "Location found, but address lookup failed. Enter the address manually."
                isResolving = false
                return
            }
            let mapItem = try await request.mapItems.first
            let representations = mapItem?.addressRepresentations
            let city = representations?.cityName ?? mapItem?.name ?? ""
            let country = representations?.regionName ?? ""
            let address = [
                mapItem?.address?.shortAddress,
                representations?.fullAddress(includingRegion: true, singleLine: true)
            ]
                .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .uniqued()
                .joined(separator: ", ")
            let neighbourhood = inferNeighbourhood(from: address, fallback: city)

            detectedAddress = DetectedHomeAddress(
                city: city,
                neighbourhood: neighbourhood,
                country: country,
                address: address,
                latitude: location.coordinate.latitude,
                longitude: location.coordinate.longitude
            )
            statusText = city.isEmpty ? "Location found. Add the address details manually." : "Filled from your current location."
        } catch {
            statusText = "Location found, but address lookup failed. Enter the address manually."
        }
        isResolving = false
    }

    private func inferNeighbourhood(from address: String, fallback: String) -> String {
        let parts = address
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard parts.count > 1 else { return fallback }
        return parts.dropFirst().first ?? fallback
    }
}

private extension Array where Element: Hashable {
    func uniqued() -> [Element] {
        var seen = Set<Element>()
        return filter { seen.insert($0).inserted }
    }
}

private struct ListingLongField: View {
    let title: String
    @Binding var text: String
    let placeholder: String

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title)
                .font(.swaplBody(15, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
            TextEditor(text: $text)
                .font(.swaplBody(17))
                .frame(minHeight: 132)
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

private struct ListingPicker: View {
    let title: String
    @Binding var selection: String
    let values: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title)
                .font(.swaplBody(15, weight: .bold))
            Picker(title, selection: $selection) {
                ForEach(values, id: \.self) { value in
                    Text(value.capitalized).tag(value)
                }
            }
            .pickerStyle(.segmented)
        }
    }
}

private struct StepperCard: View {
    let title: String
    @Binding var value: Int
    let range: ClosedRange<Int>
    let suffix: String
    var step = 1

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.swaplBody(16, weight: .bold))
                    .foregroundStyle(AirbnbPalette.text)
                Text("\(value) \(suffix)")
                    .font(.swaplBody(15))
                    .foregroundStyle(AirbnbPalette.secondaryText)
            }
            Spacer()
            Stepper("", value: $value, in: range, step: step)
                .labelsHidden()
        }
        .padding(18)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }
}

private struct ToggleCard: View {
    let title: String
    let systemImage: String
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            Label(title, systemImage: systemImage)
                .font(.swaplBody(16, weight: .bold))
                .foregroundStyle(AirbnbPalette.text)
        }
        .tint(SwaplSemanticLight.primary)
        .padding(18)
        .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                .stroke(AirbnbPalette.hairline)
        }
    }
}

private struct DateCard: View {
    let title: String
    @Binding var date: Date

    var body: some View {
        DatePicker(title, selection: $date, displayedComponents: .date)
            .font(.swaplBody(16, weight: .bold))
            .tint(SwaplSemanticLight.primary)
            .padding(18)
            .background(SwaplSemanticLight.card, in: RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: SwaplDesignSystem.CornerRadius.medium, style: .continuous)
                    .stroke(AirbnbPalette.hairline)
            }
    }
}
