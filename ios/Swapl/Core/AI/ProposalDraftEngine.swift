import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

// Two-engine "Draft with AI" for the swap-proposal cover message.
//
// Engine selection:
//   1. On-device (iOS 26+, Apple Intelligence): when the FoundationModels
//      framework is present (`#if canImport`), the OS is new enough
//      (`#available(iOS 26.0, *)`) AND the system model reports
//      `.available` at runtime, draft locally with LanguageModelSession,
//      fed the same bag of facts the backend uses.
//   2. Backend (every device, and the silent fallback for any on-device
//      miss — old OS, model not ready, generation error, empty output):
//      POST /api/ai/proposal-message via AIDraftRepository.
enum ProposalDraftEngine {
    struct Draft: Sendable {
        let message: String
        /// True when Apple Intelligence drafted the message locally.
        let onDevice: Bool
    }

    /// Everything either engine needs to write the note. The backend
    /// re-derives its copy server-side from the two listing ids; the
    /// on-device prompt is built from this client-side bag.
    struct Facts: Sendable {
        let viewerName: String?
        let viewerInterests: [String]
        let proposerListing: Listing?
        let targetListing: Listing
        let dateFrom: String  // yyyy-MM-dd
        let dateTo: String    // yyyy-MM-dd
    }

    static func draft(
        proposerListingId: String,
        targetListing: Listing,
        viewerName: String?,
        viewerUserId: String?,
        dateFrom: String,
        dateTo: String
    ) async throws -> Draft {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), SystemLanguageModel.default.availability == .available {
            // Gather the prompt facts best-effort; any miss just thins the
            // prompt, and any on-device failure falls through to the backend.
            let proposerListing = (try? await ListingRepository.shared.detail(id: proposerListingId))?.listing
            var interests: [String] = []
            if let viewerUserId,
               let profile = try? await ProfileRepository.shared.publicProfile(id: viewerUserId) {
                interests = profile.user.interests
            }

            let facts = Facts(
                viewerName: viewerName,
                viewerInterests: interests,
                proposerListing: proposerListing,
                targetListing: targetListing,
                dateFrom: dateFrom,
                dateTo: dateTo
            )
            if let message = await draftOnDevice(facts), !message.isEmpty {
                return Draft(message: message, onDevice: true)
            }
        }
        #endif

        let response = try await AIDraftRepository.shared.proposalMessage(
            proposerListingId: proposerListingId,
            targetListingId: targetListing.id,
            dateFrom: dateFrom,
            dateTo: dateTo
        )
        return Draft(message: response.message, onDevice: false)
    }

    // MARK: - On-device engine (Apple Intelligence)

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private static func draftOnDevice(_ facts: Facts) async -> String? {
        let session = LanguageModelSession(instructions: """
            You write short, sincere first-contact messages for a home-swap \
            marketplace. The user wants to propose swapping homes with another \
            member. Write in the first person as the user. At most 90 words, \
            at most 2 short paragraphs, no emojis, no subject line, no \
            placeholders — only use facts you were given. Warm and specific, \
            never salesy.
            """)
        do {
            let response = try await session.respond(to: prompt(for: facts))
            return response.content.trimmingCharacters(in: .whitespacesAndNewlines)
        } catch {
            return nil  // silent fallback to the backend engine
        }
    }
    #endif

    /// The same bag of facts the backend prompt uses, flattened to text.
    private static func prompt(for facts: Facts) -> String {
        var lines: [String] = []
        if let name = facts.viewerName, !name.isEmpty { lines.append("My name: \(name)") }
        if !facts.viewerInterests.isEmpty {
            lines.append("My interests: \(facts.viewerInterests.prefix(6).joined(separator: ", "))")
        }
        if let mine = facts.proposerListing {
            lines.append("My home: \"\(mine.title)\" in \(mine.neighbourhood), \(mine.city)\(amenitySuffix(mine))")
        }
        let target = facts.targetListing
        lines.append("Their home: \"\(target.title)\" in \(target.neighbourhood), \(target.city)\(amenitySuffix(target))")
        lines.append("Proposed dates: \(facts.dateFrom) to \(facts.dateTo)")
        return "Draft my swap-proposal message using only these facts:\n" + lines.joined(separator: "\n")
    }

    private static func amenitySuffix(_ l: Listing) -> String {
        var amenities: [String] = []
        if l.balcony { amenities.append("balcony") }
        if l.rooftop { amenities.append("rooftop") }
        if l.garden { amenities.append("garden") }
        if l.pool { amenities.append("pool") }
        if l.wfhSetup { amenities.append("work-from-home setup") }
        if l.petsAllowed { amenities.append("pet friendly") }
        if l.piano { amenities.append("piano") }
        guard !amenities.isEmpty else { return "" }
        return " — \(amenities.prefix(4).joined(separator: ", "))"
    }
}
