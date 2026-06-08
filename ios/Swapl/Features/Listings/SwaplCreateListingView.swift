import SwiftUI

struct CreateListingView: View {
    var extractedInfo: ExtractedListingInfo?

    var body: some View {
        ListingCreationView(extractedInfo: extractedInfo)
    }
}

#Preview {
    CreateListingView()
}

#Preview("With Extracted Info") {
    CreateListingView(extractedInfo: ExtractedListingInfo(
        startDate: Date(),
        endDate: Date().addingTimeInterval(14 * 24 * 60 * 60),
        bedrooms: 3,
        bathrooms: 2,
        sleeps: 6,
        city: "San Francisco",
        neighbourhood: "Mission District",
        amenities: ["balcony", "parking"],
        title: "Cozy Mission District Apartment",
        description: "Beautiful 3-bedroom apartment with city views"
    ))
}
