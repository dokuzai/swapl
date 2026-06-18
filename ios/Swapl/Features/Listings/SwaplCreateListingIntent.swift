import AppIntents
import SwiftUI
import PhotosUI
import Foundation
import SwaplDesignTokens

// MARK: - Create Listing Intent
struct CreateListingIntent: AppIntent {
    static let title: LocalizedStringResource = "Create a Home Listing"
    static let description = IntentDescription("Create a new home swap listing with dates and photos")

    static let openAppWhenRun: Bool = true
    
    @Parameter(title: "Start Date")
    var startDate: Date?
    
    @Parameter(title: "End Date")
    var endDate: Date?
    
    @Parameter(title: "Additional Details")
    var details: String?
    
    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        // Extract information from natural language if available
        var extractedInfo: ExtractedListingInfo?
        if let details = details, !details.isEmpty {
            extractedInfo = await extractListingInfo(from: details)
        }
        
        // Return result with snippet
        return .result(
            dialog: "I'll help you create your listing. Opening the app...",
            view: CreateListingSnippet(
                startDate: startDate ?? extractedInfo?.startDate,
                endDate: endDate ?? extractedInfo?.endDate,
                extractedInfo: extractedInfo
            )
        )
    }
    
    // Simple keyword-based extraction (no LLM required)
    private func extractListingInfo(from text: String) async -> ExtractedListingInfo {
        let lowercased = text.lowercased()
        
        // Extract bedroom count
        let bedroomRegex = /(\d+)\s*(bed|bedroom)/
        let bedrooms = lowercased.firstMatch(of: bedroomRegex).map { Int($0.1) ?? nil } ?? nil
        
        // Extract bathroom count
        let bathroomRegex = /(\d+)\s*(bath|bathroom)/
        let bathrooms = lowercased.firstMatch(of: bathroomRegex).map { Int($0.1) ?? nil } ?? nil
        
        // Extract sleeps count
        let sleepsRegex = /sleeps\s*(\d+)|(\d+)\s*guests/
        let sleeps = lowercased.firstMatch(of: sleepsRegex).map { match in
            Int(match.1 ?? match.2 ?? "") ?? nil
        } ?? nil
        
        return ExtractedListingInfo(
            startDate: nil,
            endDate: nil,
            bedrooms: bedrooms ?? nil,
            bathrooms: bathrooms ?? nil,
            sleeps: sleeps ?? nil,
            city: nil,
            neighbourhood: nil,
            amenities: nil,
            title: nil,
            description: details
        )
    }
}

// MARK: - Extracted Listing Info Model
struct ExtractedListingInfo: Codable {
    var startDate: Date?
    var endDate: Date?
    var bedrooms: Int?
    var bathrooms: Int?
    var sleeps: Int?
    var city: String?
    var neighbourhood: String?
    var amenities: [String]?
    var title: String?
    var description: String?
}

// MARK: - Create Listing Snippet View
// NOTE: This snippet is rendered out-of-process by Siri/Shortcuts (ShowsSnippetView),
// where the brand fonts registered at app launch (CTFontManagerRegisterFontsForURL,
// .process scope) are not available. System text styles are intentional here —
// the swapl typography guideline does not apply to App Intents snippet UI.
struct CreateListingSnippet: View {
    let startDate: Date?
    let endDate: Date?
    let extractedInfo: ExtractedListingInfo?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Image(systemName: "house.fill")
                    .font(.largeTitle)
                    .foregroundStyle(SwaplSemanticLight.primary)
                
                VStack(alignment: .leading) {
                    Text("Create Listing")
                        .font(.headline)
                    if let start = startDate, let end = endDate {
                        Text("\(start.formatted(date: .abbreviated, time: .omitted)) - \(end.formatted(date: .abbreviated, time: .omitted))")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            
            if let info = extractedInfo {
                VStack(alignment: .leading, spacing: 8) {
                    if let city = info.city {
                        Label(city, systemImage: "location.fill")
                    }
                    if let bedrooms = info.bedrooms, let bathrooms = info.bathrooms {
                        Label("\(bedrooms) beds · \(bathrooms) baths", systemImage: "bed.double.fill")
                    }
                    if let sleeps = info.sleeps {
                        Label("Sleeps \(sleeps)", systemImage: "person.2.fill")
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            
            Text("Tap to continue creating your listing in the app")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}

// MARK: - Optimize Photos Intent
struct OptimizeListingPhotosIntent: AppIntent {
    static let title: LocalizedStringResource = "Optimize Listing Photos"
    static let description = IntentDescription("Select and optimize photos from your gallery for your home listing")

    static let openAppWhenRun: Bool = true
    
    @Parameter(title: "Number of Photos to Select", default: 5)
    var photoCount: Int
    
    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        return .result(dialog: "Opening photo picker to select your best home photos...")
    }
}

// MARK: - App Shortcuts
struct SwaplAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CreateListingIntent(),
            phrases: [
                "Create a listing in \(.applicationName)",
                "List my home in \(.applicationName)",
                "Add a new listing to \(.applicationName)",
                "Create a swap listing in \(.applicationName)"
            ],
            shortTitle: "Create Listing",
            systemImageName: "house.fill"
        )
        
        AppShortcut(
            intent: OptimizeListingPhotosIntent(),
            phrases: [
                "Optimize photos for my listing in \(.applicationName)",
                "Select photos for \(.applicationName)",
                "Add photos to my listing in \(.applicationName)"
            ],
            shortTitle: "Optimize Photos",
            systemImageName: "photo.on.rectangle"
        )

        AppShortcut(
            intent: FindSwapIntent(),
            phrases: [
                "Find a home swap in \(.applicationName)",
                "Find me a home exchange in \(.applicationName)",
                "Search for homes in \(.applicationName)",
                "Find a place to swap in \(.applicationName)"
            ],
            shortTitle: "Find a Swap",
            systemImageName: "magnifyingglass"
        )

        AppShortcut(
            intent: AcceptSwapIntent(),
            phrases: [
                "Accept a home swap in \(.applicationName)",
                "Accept a swap in \(.applicationName)",
                "Accept my home exchange in \(.applicationName)"
            ],
            shortTitle: "Accept a Swap",
            systemImageName: "checkmark.circle"
        )

        AppShortcut(
            intent: DeclineSwapIntent(),
            phrases: [
                "Decline a home swap in \(.applicationName)",
                "Decline a swap in \(.applicationName)"
            ],
            shortTitle: "Decline a Swap",
            systemImageName: "xmark.circle"
        )
    }
}
