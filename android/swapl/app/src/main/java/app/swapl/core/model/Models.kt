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
    val address: String? = null,
    val sizeSqm: Int,
    val sleeps: Int,
    val bedrooms: Int,
    val bathrooms: Int,
    val floor: Int? = null,
    val petsAllowed: Boolean,
    val petTypes: List<String> = emptyList(),
    val wfhSetup: Boolean,
    val wfhDesks: Int = 0,
    val stepFreeAccess: Boolean,
    val hasElevator: Boolean,
    val hasParking: Boolean = false,
    val bikeIncluded: Boolean = false,
    val balcony: Boolean,
    val rooftop: Boolean,
    val garden: Boolean,
    val courtyard: Boolean = false,
    val piano: Boolean = false,
    val pool: Boolean,
    val gym: Boolean = false,
    val ac: Boolean,
    val washer: Boolean,
    val dryer: Boolean,
    val dishwasher: Boolean,
    val availableFrom: String,
    val availableTo: String,
    val minStayDays: Int = 3,
    val maxStayDays: Int = 30,
    val photos: List<String>,
    val tags: List<String>,
    val palette: String,
    val isFeatured: Boolean,
    val isVerified: Boolean,
)

// Request body for POST /api/listings and PUT /api/listings/{id}.
// Matches lib/validators.ts listingCreateSchema exactly.
@Serializable
data class ListingCreateBody(
    val title: String,
    val description: String,
    val propertyType: String,
    val city: String,
    val neighbourhood: String,
    val country: String,
    val address: String? = null,
    val sizeSqm: Int,
    val sleeps: Int,
    val bedrooms: Int,
    val bathrooms: Int,
    val floor: Int? = null,
    val hasElevator: Boolean = false,
    val stepFreeAccess: Boolean = false,
    val petsAllowed: Boolean = false,
    val petTypes: List<String> = emptyList(),
    val wfhSetup: Boolean = false,
    val wfhDesks: Int = 0,
    val hasParking: Boolean = false,
    val bikeIncluded: Boolean = false,
    val rooftop: Boolean = false,
    val balcony: Boolean = false,
    val garden: Boolean = false,
    val courtyard: Boolean = false,
    val piano: Boolean = false,
    val pool: Boolean = false,
    val gym: Boolean = false,
    val ac: Boolean = false,
    val dishwasher: Boolean = false,
    val washer: Boolean = false,
    val dryer: Boolean = false,
    val availableFrom: String,
    val availableTo: String,
    val minStayDays: Int = 3,
    val maxStayDays: Int = 30,
    val photos: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
)

// `{ ok: true, id }` from POST /api/listings and PUT /api/listings/{id}.
@Serializable
data class ListingMutationResponse(val ok: Boolean, val id: String)

// `{ url }` from POST /api/uploads/listing-photo (multipart).
@Serializable
data class UploadResponse(val url: String)

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

// ---------- proposal detail ----------

@Serializable
data class Proposal(
    val id: String,
    val status: String,
    val meSide: String,
    val dateFrom: String,
    val dateTo: String,
    val message: String? = null,
    val counterDateFrom: String? = null,
    val counterDateTo: String? = null,
    val counterMessage: String? = null,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class OtherParty(
    val id: String,
    val name: String? = null,
    val avatar: String? = null,
    val verified: Boolean,
)

@Serializable
data class Insurance(
    val policyNumber: String,
    val coverageAmount: Int,
    val status: String,
    val expiresAt: String,
)

@Serializable
data class Agreement(
    val id: String,
    val dateFrom: String,
    val dateTo: String,
    val keyCode1: String? = null,
    val keyCode2: String? = null,
    val status: String,
    val insurance: Insurance? = null,
)

@Serializable
data class ProposalDetail(
    val proposal: Proposal,
    val proposerListing: Listing,
    val targetListing: Listing,
    val other: OtherParty,
    val agreement: Agreement? = null,
)

// ---------- public profile ----------

@Serializable
data class PublicProfileUser(
    val id: String,
    val name: String? = null,
    val avatar: String? = null,
    val bio: String? = null,
    val bioVibe: String? = null,
    val verified: Boolean,
    val memberSince: String,
    val interests: List<String>,
)

@Serializable
data class PublicProfile(
    val user: PublicProfileUser,
    val listings: List<Listing>,
)

// ---------- interests catalog ----------

@Serializable
data class InterestTag(val slug: String, val label: String, val category: String)

@Serializable
data class InterestCategory(val id: String, val label: String)

@Serializable
data class InterestsCatalog(
    val catalog: List<InterestTag>,
    val categories: List<InterestCategory>,
    val selected: List<String>,
)

// ---------- saved searches ----------

@Serializable
data class SavedSearch(
    val id: String,
    val name: String,
    val query: String,
    val alertEnabled: Boolean,
    val createdAt: String,
)

@Serializable
data class SavedSearchesResponse(val items: List<SavedSearch>)

// ---------- favorites (wishlists) ----------

@Serializable
data class FavoritesResponse(val items: List<Listing>)

@Serializable
data class FavoriteIdsResponse(val ids: List<String>)

@Serializable
data class FavoriteToggleResponse(val ok: Boolean, val favorited: Boolean)

// ---------- me ----------

@Serializable
data class MeUser(
    val id: String,
    val email: String,
    val name: String? = null,
    val avatar: String? = null,
    val bio: String? = null,
    val bioVibe: String? = null,
    val verified: Boolean,
    val role: String,
    val interests: List<String>,
    val createdAt: String,
)

@Serializable
data class MeCounts(
    val listings: Int,
    val incomingProposals: Int,
    val outgoingProposals: Int,
    val activeSwaps: Int,
)

@Serializable
data class MeSubscription(
    val planId: String,
    val status: String,
    val currentPeriodEnd: String,
    val cancelAtPeriodEnd: Boolean,
)

@Serializable
data class MeResponse(
    val user: MeUser,
    val counts: MeCounts,
    val subscription: MeSubscription? = null,
)

// ---------- admin metrics ----------

@Serializable
data class MetricsNow(
    val online: Int,
    val dau: Int,
    val wau: Int,
    val mau: Int,
)

@Serializable
data class MetricsUsers(
    val total: Int,
    val emailVerified: Int,
    val withActiveListing: Int,
    val new7d: Int,
    val new30d: Int,
)

@Serializable
data class MetricsListingDistribution(
    val zero: Int,
    val one: Int,
    val two: Int,
    val threePlus: Int,
)

@Serializable
data class MetricsTopUser(
    val id: String,
    val name: String? = null,
    val email: String,
    val listings: Int,
)

@Serializable
data class MetricsListingsPerUser(
    val distribution: MetricsListingDistribution,
    val avgPerUserWithListing: Double,
    val topUsers: List<MetricsTopUser>,
)

@Serializable
data class MetricsCity(
    val city: String,
    val listings: Int,
    val share: Double,
)

@Serializable
data class MetricsCities(
    val totalActiveListings: Int,
    val top: List<MetricsCity>,
)

@Serializable
data class MetricsEngagement(
    val proposalsByStatus: Map<String, Int>,
    val proposalsTotal: Int,
    val proposalAcceptRate: Double,
    val agreementsActive: Int,
    val agreementsCompleted: Int,
    val messagesTotal: Int,
    val messages7d: Int,
    val favoritesTotal: Int,
    val favorites7d: Int,
    val savedSearches: Int,
)

@Serializable
data class AdminMetrics(
    val now: MetricsNow,
    val users: MetricsUsers,
    val listingsPerUser: MetricsListingsPerUser,
    val cities: MetricsCities,
    val engagement: MetricsEngagement,
    val generatedAt: String,
)
