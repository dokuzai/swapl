package app.swapl.core.model

import kotlinx.serialization.Serializable

@Serializable
data class Listing(
    val id: String,
    val userId: String,
    val ownerName: String? = null,
    val title: String,
    val description: String,
    val propertyType: String,
    val city: String,
    val neighbourhood: String,
    val country: String,
    val sizeSqm: Int,
    val sleeps: Int,
    val bedrooms: Int,
    val bathrooms: Int,
    val petsAllowed: Boolean,
    val wfhSetup: Boolean,
    val stepFreeAccess: Boolean,
    val hasElevator: Boolean,
    val balcony: Boolean,
    val rooftop: Boolean,
    val garden: Boolean,
    val pool: Boolean,
    val ac: Boolean,
    val washer: Boolean,
    val dryer: Boolean,
    val dishwasher: Boolean,
    val availableFrom: String,
    val availableTo: String,
    val photos: List<String>,
    val tags: List<String>,
    val palette: String,
    val isFeatured: Boolean,
    val isVerified: Boolean,
)

@Serializable
data class ListingWithScore(
    val listing: Listing,
    val matchScore: Int? = null,
    val band: String,
)

@Serializable
data class ListingSearchResponse(
    val items: List<ListingWithScore>,
    val page: Int,
    val pageSize: Int,
    val total: Int,
    val viewerListingId: String? = null,
)

@Serializable
data class Host(
    val id: String,
    val name: String? = null,
    val avatar: String? = null,
    val bio: String? = null,
    val bioVibe: String? = null,
    val verified: Boolean,
    val memberSince: String,
)

@Serializable
data class ListingDetailResponse(
    val listing: Listing,
    val host: Host,
    val matchScore: Int? = null,
    val viewerListingId: String? = null,
)

@Serializable
data class AuthUser(
    val id: String,
    val email: String,
    val name: String? = null,
    val avatar: String? = null,
)

@Serializable
data class TokenResponse(
    val token: String,
    val expiresAt: String,
    val user: AuthUser,
)

@Serializable
data class ProposalSummary(
    val id: String,
    val status: String,
    val meSide: String,
    val dateFrom: String,
    val dateTo: String,
    val message: String? = null,
    val myCity: String,
    val myNeighbourhood: String,
    val theirCity: String,
    val theirNeighbourhood: String,
    val otherName: String? = null,
    val updatedAt: String,
)

@Serializable
data class InboxBuckets(
    val waitingOnYou: List<ProposalSummary>,
    val sent: List<ProposalSummary>,
    val active: List<ProposalSummary>,
    val archived: List<ProposalSummary>,
)

@Serializable
data class InboxResponse(val buckets: InboxBuckets)
