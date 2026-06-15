package app.swapl.core.repository

import app.swapl.core.network.ApiClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import javax.inject.Inject
import javax.inject.Singleton

// Optional owner-proof verification (DOK-162). Strictly a trust badge — never a
// gate to publishing. The host attaches documents (deed, utility bill, …) and
// an admin approves; approval flips Listing.ownerVerified true.

@kotlinx.serialization.Serializable
data class PropertyVerificationDocument(
    val url: String,
    val label: String,
)

@kotlinx.serialization.Serializable
data class PropertyVerification(
    val id: String,
    /** "pending" | "approved" | "rejected" */
    val status: String,
    val documents: List<PropertyVerificationDocument> = emptyList(),
    val note: String? = null,
    // AI document analysis (DOK-186). The AI only proposes; an admin can always
    // override. Null when the AI is unconfigured → plain manual review.
    /** "private_owner" | "private_tenant" | "business" | "uncertain" | null */
    val aiClassification: String? = null,
    val aiConfidence: Float? = null,
    val aiReasons: List<String> = emptyList(),
    val aiEntityType: String? = null,
    /** "deed" | "lease" | "other" | null */
    val documentType: String? = null,
    val createdAt: String,
    val updatedAt: String,
) {
    /** True when this listing was rejected because the AI read it as a business. */
    val rejectedAsBusiness: Boolean
        get() = status == "rejected" && aiClassification == "business"
}

// GET/POST /api/listings/{id}/property-verification response.
@kotlinx.serialization.Serializable
data class PropertyVerificationStatus(
    val ownerVerified: Boolean = false,
    val verification: PropertyVerification? = null,
)

@kotlinx.serialization.Serializable
data class PropertyVerificationSubmit(
    val documents: List<PropertyVerificationDocument>,
    /** "deed" | "lease" | "other" — optional hint for the AI classifier. */
    val documentType: String? = null,
)

@Singleton
class PropertyVerificationRepository @Inject constructor(private val api: ApiClient) {

    // Owner-only status: current ownerVerified flag + latest submission.
    suspend fun status(listingId: String): PropertyVerificationStatus =
        api.client.get("${api.baseUrl}/api/listings/$listingId/property-verification").body()

    // Owner-only submit: attach documents and open/reopen a pending review.
    suspend fun submit(
        listingId: String,
        documents: List<PropertyVerificationDocument>,
        documentType: String? = null,
    ): PropertyVerificationStatus =
        api.client.post("${api.baseUrl}/api/listings/$listingId/property-verification") {
            contentType(ContentType.Application.Json)
            setBody(PropertyVerificationSubmit(documents = documents, documentType = documentType))
        }.body()
}
