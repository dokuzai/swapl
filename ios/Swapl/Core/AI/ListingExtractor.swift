import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

// On-device listing extraction (DOK-201). Turns a host's free-text description
// ("3-bed flat in Lisbon, sleeps 6, balcony + pool") into structured listing
// fields using Apple Intelligence's on-device model via guided generation.
//
// Engine selection mirrors ProposalDraftEngine:
//   • On-device (iOS 26+, Apple Intelligence available): guided generation with
//     a @Generable schema — no network, fully private.
//   • Otherwise: returns nil so the caller falls back to the regex extractor.
//
// Image input (analysing the actual photos) is iOS 27+ and lands with the
// in-app "auto-fill from photos" flow — see the follow-up issue; this engine is
// the text foundation it builds on.
enum ListingExtractor {
    #if canImport(FoundationModels)
    @Generable
    struct AIListingDraft {
        @Guide(description: "A catchy listing title, at most 8 words")
        var title: String
        @Guide(description: "A warm, factual one or two sentence description")
        var summary: String
        @Guide(description: "City the home is in; empty string if not stated")
        var city: String
        @Guide(description: "Neighbourhood or district; empty string if not stated")
        var neighbourhood: String
        @Guide(description: "Property type — one of: apartment, house, room, studio")
        var propertyType: String
        @Guide(description: "Number of bedrooms", .range(0...20))
        var bedrooms: Int
        @Guide(description: "Number of bathrooms", .range(0...20))
        var bathrooms: Int
        @Guide(description: "How many guests can sleep over", .range(1...30))
        var sleeps: Int
        @Guide(description: "Amenities explicitly mentioned, as lowercase keywords chosen from: balcony, pool, rooftop, garden, parking, ac, washer, dryer, dishwasher, wfh, gym, piano, bike, pets", .maximumCount(12))
        var amenities: [String]
    }
    #endif

    /// Extract structured listing details from free text using the on-device
    /// model. Returns nil when Apple Intelligence is unavailable or generation
    /// fails, so callers can fall back to the regex extractor.
    static func extract(fromText text: String) async -> ExtractedListingInfo? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        #if canImport(FoundationModels)
        guard SystemLanguageModel.default.availability == .available else { return nil }
        let session = LanguageModelSession(instructions: """
            You extract structured home-listing details from a host's free-text \
            description for a home-swap app. Use only facts present in the text — \
            never invent. Use an empty string or zero when something isn't \
            stated. Keep the title short and the summary factual, not salesy.
            """)
        // Bound the on-device call so a cold/slow model can't stall the App
        // Intent — fall back to regex if it doesn't return promptly.
        do {
            let draft = try await withThrowingTaskGroup(of: AIListingDraft.self) { group in
                group.addTask {
                    try await session.respond(
                        to: "Extract the listing details from this description:\n\(trimmed)",
                        generating: AIListingDraft.self
                    ).content
                }
                group.addTask {
                    try await Task.sleep(for: .seconds(8))
                    throw CancellationError()
                }
                guard let first = try await group.next() else { throw CancellationError() }
                group.cancelAll()
                return first
            }
            return draft.toExtractedInfo()
        } catch {
            return nil  // silent fallback to the regex extractor
        }
        #else
        return nil
        #endif
    }
}

#if canImport(FoundationModels)
extension ListingExtractor.AIListingDraft {
    /// Map the model output onto the app's ExtractedListingInfo, dropping
    /// not-stated values (empty / zero) so the create form only prefills what
    /// the host actually described.
    func toExtractedInfo() -> ExtractedListingInfo {
        ExtractedListingInfo(
            startDate: nil,
            endDate: nil,
            bedrooms: bedrooms > 0 ? bedrooms : nil,
            bathrooms: bathrooms > 0 ? bathrooms : nil,
            sleeps: sleeps > 0 ? sleeps : nil,
            city: city.isEmpty ? nil : city,
            neighbourhood: neighbourhood.isEmpty ? nil : neighbourhood,
            amenities: amenities.isEmpty ? nil : amenities,
            title: title.isEmpty ? nil : title,
            description: summary.isEmpty ? nil : summary,
            propertyType: propertyType.isEmpty ? nil : propertyType
        )
    }
}
#endif
