import SwiftUI
import Observation
import SwaplDesignTokens

@Observable
final class ListingCreateViewModel {
    // Step 1: Location
    var title: String = ""
    var city: String = ""
    var neighbourhood: String = ""
    var country: String = ""
    var address: String = ""

    // Step 2: Space
    var propertyType: String = "APARTMENT"
    var sizeSqm: Int = 60
    var bedrooms: Int = 1
    var bathrooms: Int = 1
    var sleeps: Int = 2
    var floor: Int = 1

    // Step 3: Accessibility & pets
    var hasElevator = false
    var stepFreeAccess = false
    var petsAllowed = false

    // Step 4: Work & amenities
    var wfhSetup = false
    var wfhDesks = 0
    var hasParking = false
    var bikeIncluded = false
    var balcony = false
    var rooftop = false
    var garden = false
    var courtyard = false
    var piano = false
    var pool = false
    var ac = false
    var dishwasher = false
    var washer = false
    var dryer = false

    // Step 5: Availability
    var availableFrom = Date().addingTimeInterval(60 * 60 * 24 * 60)
    var availableTo = Date().addingTimeInterval(60 * 60 * 24 * 90)
    var minStayDays = 3
    var maxStayDays = 30

    // Step 6: Photos (URLs for now; full upload flow lands in slice 3)
    var photoUrls: [String] = []

    // Step 7: Description
    var description: String = ""

    // State
    var step: Int = 0
    var isSubmitting = false
    var error: String?
    var createdId: String?

    let steps = ["Location", "Space", "Access & pets", "Amenities", "Dates", "Photos", "Description", "Review"]

    var canProceed: Bool {
        switch step {
        case 0: return city.count >= 2 && neighbourhood.count >= 2 && country.count >= 2 && title.count >= 4
        case 1: return sizeSqm >= 20 && sleeps >= 1
        case 4: return availableTo > availableFrom
        case 6: return description.count >= 20
        default: return true
        }
    }

    func next() { if step < steps.count - 1 { step += 1 } }
    func prev() { if step > 0 { step -= 1 } }

    func submit() async {
        isSubmitting = true; error = nil
        defer { isSubmitting = false }
        do {
            let res = try await ListingRepository.shared.create(payload)
            createdId = res.id
        } catch {
            self.error = error.localizedDescription
        }
    }

    private var payload: ListingRepository.CreateBody {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        return ListingRepository.CreateBody(
            title: title,
            description: description,
            propertyType: propertyType,
            city: city,
            neighbourhood: neighbourhood,
            country: country,
            address: address.isEmpty ? nil : address,
            sizeSqm: sizeSqm,
            sleeps: sleeps,
            bedrooms: bedrooms,
            bathrooms: bathrooms,
            floor: floor,
            hasElevator: hasElevator,
            stepFreeAccess: stepFreeAccess,
            petsAllowed: petsAllowed,
            petTypes: [],
            wfhSetup: wfhSetup,
            wfhDesks: wfhDesks,
            hasParking: hasParking,
            bikeIncluded: bikeIncluded,
            rooftop: rooftop,
            balcony: balcony,
            garden: garden,
            courtyard: courtyard,
            piano: piano,
            pool: pool,
            gym: false,
            ac: ac,
            dishwasher: dishwasher,
            washer: washer,
            dryer: dryer,
            availableFrom: iso.string(from: availableFrom),
            availableTo: iso.string(from: availableTo),
            minStayDays: minStayDays,
            maxStayDays: maxStayDays,
            photos: photoUrls,
            tags: []
        )
    }
}

struct ListingCreateView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var vm = ListingCreateViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                progressHeader
                Form {
                    switch vm.step {
                    case 0: locationStep
                    case 1: spaceStep
                    case 2: accessStep
                    case 3: amenitiesStep
                    case 4: datesStep
                    case 5: photosStep
                    case 6: descriptionStep
                    default: reviewStep
                    }
                    if let err = vm.error {
                        Section { Text(err).foregroundStyle(SwaplSemanticLight.destructive) }
                    }
                }
                footerButtons
            }
            .navigationTitle(vm.steps[vm.step])
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onChange(of: vm.createdId) { _, newId in
                if newId != nil { dismiss() }
            }
        }
    }

    // ---------- steps ----------

    private var locationStep: some View {
        Group {
            Section("About the listing") {
                TextField("Title (e.g. Sunlit canal apartment)", text: $vm.title)
            }
            Section("Where is it?") {
                TextField("City", text: $vm.city)
                TextField("Neighbourhood", text: $vm.neighbourhood)
                TextField("Country", text: $vm.country)
                TextField("Address (optional)", text: $vm.address)
            }
        }
    }

    private var spaceStep: some View {
        Group {
            Picker("Property type", selection: $vm.propertyType) {
                Text("Apartment").tag("APARTMENT")
                Text("House").tag("HOUSE")
                Text("Loft").tag("LOFT")
                Text("Townhouse").tag("TOWNHOUSE")
            }
            Stepper("Size: \(vm.sizeSqm) m²", value: $vm.sizeSqm, in: 20...800, step: 5)
            Stepper("Sleeps: \(vm.sleeps)", value: $vm.sleeps, in: 1...20)
            Stepper("Bedrooms: \(vm.bedrooms)", value: $vm.bedrooms, in: 0...15)
            Stepper("Bathrooms: \(vm.bathrooms)", value: $vm.bathrooms, in: 0...10)
            Stepper("Floor: \(vm.floor)", value: $vm.floor, in: -2...60)
        }
    }

    private var accessStep: some View {
        Group {
            Toggle("Has elevator", isOn: $vm.hasElevator)
            Toggle("Step-free access", isOn: $vm.stepFreeAccess)
            Toggle("Pets allowed", isOn: $vm.petsAllowed)
        }
    }

    private var amenitiesStep: some View {
        Group {
            Toggle("WFH setup", isOn: $vm.wfhSetup)
            if vm.wfhSetup {
                Stepper("Desks: \(vm.wfhDesks)", value: $vm.wfhDesks, in: 0...10)
            }
            Toggle("Parking", isOn: $vm.hasParking)
            Toggle("Bike included", isOn: $vm.bikeIncluded)
            Toggle("Balcony", isOn: $vm.balcony)
            Toggle("Rooftop", isOn: $vm.rooftop)
            Toggle("Garden", isOn: $vm.garden)
            Toggle("Courtyard", isOn: $vm.courtyard)
            Toggle("Piano", isOn: $vm.piano)
            Toggle("Pool", isOn: $vm.pool)
            Toggle("AC", isOn: $vm.ac)
            Toggle("Dishwasher", isOn: $vm.dishwasher)
            Toggle("Washer", isOn: $vm.washer)
            Toggle("Dryer", isOn: $vm.dryer)
        }
    }

    private var datesStep: some View {
        Group {
            DatePicker("Available from", selection: $vm.availableFrom, displayedComponents: .date)
            DatePicker("Available to", selection: $vm.availableTo, displayedComponents: .date)
            Stepper("Min stay: \(vm.minStayDays) days", value: $vm.minStayDays, in: 1...180)
            Stepper("Max stay: \(vm.maxStayDays) days", value: $vm.maxStayDays, in: 1...365)
        }
    }

    private var photosStep: some View {
        Group {
            Text("Paste image URLs (one per line). Image upload via R2 lands in slice 3.")
                .font(.swaplBody(13))
                .foregroundStyle(SwaplSemanticLight.mutedForeground)
            ForEach(0..<max(vm.photoUrls.count + 1, 1), id: \.self) { idx in
                TextField("https://…", text: Binding(
                    get: { vm.photoUrls.indices.contains(idx) ? vm.photoUrls[idx] : "" },
                    set: { newVal in
                        if vm.photoUrls.indices.contains(idx) {
                            if newVal.isEmpty { vm.photoUrls.remove(at: idx) } else { vm.photoUrls[idx] = newVal }
                        } else if !newVal.isEmpty {
                            vm.photoUrls.append(newVal)
                        }
                    }
                ))
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
            }
        }
    }

    private var descriptionStep: some View {
        Group {
            TextField("Describe your home (min 20 chars)", text: $vm.description, axis: .vertical)
                .lineLimit(6...20)
            Text("\(vm.description.count) characters")
                .font(.swaplMono(11))
                .foregroundStyle(SwaplSemanticLight.mutedForeground)
        }
    }

    private var reviewStep: some View {
        Group {
            Text("\(vm.title) — \(vm.city)").font(.swaplDisplay(20))
            Text("\(vm.sizeSqm) m² · sleeps \(vm.sleeps) · \(vm.bedrooms) br / \(vm.bathrooms) ba")
            Text(vm.description).font(.swaplBody(14))
            Text("Available \(vm.availableFrom.formatted(date: .abbreviated, time: .omitted)) → \(vm.availableTo.formatted(date: .abbreviated, time: .omitted))")
                .font(.swaplMono(12))
        }
    }

    // ---------- progress + footer ----------

    private var progressHeader: some View {
        VStack(alignment: .leading, spacing: SwaplSpacing.s2) {
            ProgressView(value: Double(vm.step + 1), total: Double(vm.steps.count))
                .tint(SwaplColor.pink)
            Text("Step \(vm.step + 1) of \(vm.steps.count)")
                .font(.swaplMono(11))
                .foregroundStyle(SwaplSemanticLight.mutedForeground)
        }
        .padding(.horizontal, SwaplSpacing.s4)
        .padding(.top, SwaplSpacing.s2)
    }

    private var footerButtons: some View {
        HStack {
            if vm.step > 0 {
                Button("Back") { vm.prev() }
            }
            Spacer()
            if vm.step < vm.steps.count - 1 {
                Button("Next") { vm.next() }
                    .disabled(!vm.canProceed)
            } else {
                PrimaryPill(
                    title: "Publish listing",
                    action: { Task { await vm.submit() } },
                    isLoading: vm.isSubmitting,
                    isDisabled: !vm.canProceed
                )
                .frame(maxWidth: 220)
            }
        }
        .padding(SwaplSpacing.s4)
    }
}
