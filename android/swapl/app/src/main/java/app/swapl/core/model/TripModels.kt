package app.swapl.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

// Trip cockpit models (DOK-152). Mirror app/app/api/agreements/[id]/trip and
// app/app/api/listings/[id]/home-guide, and the iOS Trip.swift models. Reveal
// gating is enforced SERVER-SIDE: before the gate opens, `otherAddress` and the
// other guide's fields are null and the payload only carries a locked/unlocksAt
// hint — the client renders the locked state but never has the other home's
// address or guide content.

// GET /api/agreements/{id}/trip
@Serializable
data class TripCockpit(
    val agreementId: String,
    val proposalId: String,
    val phase: String,            // AGREED|PREPARING|READY|IN_PROGRESS|COMPLETED|INTERRUPTED
    val role: String,             // host1 | host2
    val dates: TripDates,
    val countdown: TripCountdown,
    val keyCodes: TripKeyCodes,
    val insurance: TripInsurance? = null,
    val addressUnlocked: Boolean = false,
    val otherAddress: String? = null,   // null until addressUnlocked
    val otherCity: String? = null,
    val otherGuide: OtherGuide? = null,
    val myGuideCompleteness: Int = 0,   // 0..100
    val otherGuideCompleteness: Int = 0,
    val checklist: TripChecklist,
    val checkEvents: List<TripCheckEvent> = emptyList(),
)

@Serializable
data class TripDates(val from: String, val to: String)

@Serializable
data class TripCountdown(val days: Int, val hours: Int)

@Serializable
data class TripKeyCodes(val mine: String? = null)

@Serializable
data class TripInsurance(
    val policyNumber: String,
    val coverageAmount: Int,
    val status: String,
    val expiresAt: String,
    // DOK-156: optional tamper-proof proof-of-cover anchored on TON. All null
    // when the server has no TON env (no-op): the policy stays off-chain exactly
    // as before. The badge renders ONLY when anchored. NO personal data on-chain.
    val onChainRef: String? = null,
    val onChainNetwork: String? = null,
    val onChainStatus: String? = null,
    val anchoredAt: String? = null,
    val explorerUrl: String? = null,
)

@Serializable
data class TripChecklist(
    val guideFilled: Boolean = false,
    val detailsRead: Boolean = false,
    val checkedIn: Boolean = false,
    val checkedOut: Boolean = false,
)

// The other home's guide. When the reveal gate is open the server sends the
// guide fields inline; before that it sends { locked: true, unlocksAt }. The
// payload is the SAME json key (`otherGuide`) for both shapes, so we decode it
// as a raw JsonObject and project the two views off it. Reveal gating stays
// server-side — `fields` is only populated when the server chose to send them.
@Serializable(with = OtherGuideSerializer::class)
data class OtherGuide(
    val locked: Boolean,
    val unlocksAt: String? = null,
    val fields: HomeGuideFields? = null,
)

object OtherGuideSerializer : kotlinx.serialization.KSerializer<OtherGuide> {
    override val descriptor =
        kotlinx.serialization.descriptors.buildClassSerialDescriptor("OtherGuide")

    override fun deserialize(decoder: kotlinx.serialization.encoding.Decoder): OtherGuide {
        val input = decoder as? kotlinx.serialization.json.JsonDecoder
            ?: error("OtherGuide is only deserializable from JSON")
        val obj = input.decodeJsonElement().jsonObject
        val locked = (obj["locked"] as? JsonElement)
            ?.let { runCatching { it.jsonPrimitive.boolean }.getOrDefault(false) } ?: false
        val unlocksAt = obj["unlocksAt"]?.jsonPrimitive?.contentOrNullSafe()
        val fields = if (locked) null else input.json.decodeFromJsonElement(
            HomeGuideFields.serializer(), obj as JsonObject,
        )
        return OtherGuide(locked = locked, unlocksAt = unlocksAt, fields = fields)
    }

    override fun serialize(
        encoder: kotlinx.serialization.encoding.Encoder,
        value: OtherGuide,
    ) = error("OtherGuide is read-only")
}

private fun kotlinx.serialization.json.JsonPrimitive.contentOrNullSafe(): String? =
    if (this is kotlinx.serialization.json.JsonNull) null else content

@Serializable
data class TripCheckEvent(
    val id: String,
    val userId: String,
    val type: String,          // checkin | checkout
    val note: String? = null,
    val photos: List<String> = emptyList(),
    val createdAt: String,
    val mine: Boolean = false,
)

// The full guide field set shared by the trip cockpit ("Where you're staying")
// and the owner's editor. All optional — a guide is a partial upsert.
@Serializable
data class HomeGuideFields(
    val accessInstructions: String? = null,
    val keyPickup: String? = null,
    val wifiName: String? = null,
    val wifiPassword: String? = null,
    val heatingCooling: String? = null,
    val kitchen: String? = null,
    val bins: String? = null,
    val petsPlants: String? = null,
    val houseRules: String? = null,
    val neighbourhood: String? = null,
    val emergencyContact: String? = null,
)

// GET /api/listings/{id}/home-guide. The owner always reads/writes; a
// counterparty reads only once the gate opens, else { locked, unlocksAt }.
@Serializable
data class HomeGuideResponse(
    val guide: HomeGuide? = null,
    val isOwner: Boolean = false,
    val locked: Boolean = false,
    val unlocksAt: String? = null,
)

@Serializable
data class HomeGuide(
    val accessInstructions: String? = null,
    val keyPickup: String? = null,
    val wifiName: String? = null,
    val wifiPassword: String? = null,
    val heatingCooling: String? = null,
    val kitchen: String? = null,
    val bins: String? = null,
    val petsPlants: String? = null,
    val houseRules: String? = null,
    val neighbourhood: String? = null,
    val emergencyContact: String? = null,
    val updatedAt: String? = null,
    val completeness: Int? = null,   // 0..100 over the 8 core fields
    val complete: Boolean? = null,
)

// PUT body for the owner editor. We send every field (empty string clears it
// server-side, non-empty sets it) — mirrors the iOS editor's behaviour where
// the editor always submits the full known field set.
@Serializable
data class HomeGuideUpdate(
    val accessInstructions: String,
    val keyPickup: String,
    val wifiName: String,
    val wifiPassword: String,
    val heatingCooling: String,
    val kitchen: String,
    val bins: String,
    val petsPlants: String,
    val houseRules: String,
    val neighbourhood: String,
    val emergencyContact: String,
)

@Serializable
data class HomeGuidePutResponse(
    val ok: Boolean = false,
    val guide: HomeGuide? = null,
)

// POST /api/agreements/{id}/check-in | check-out request + response.
@Serializable
data class CheckEventBody(
    val note: String? = null,
    val photos: List<String>? = null,
)

@Serializable
data class CheckEventResponse(
    val ok: Boolean = false,
    val event: CheckEventDto? = null,
    val duplicate: Boolean? = null,
) {
    @Serializable
    data class CheckEventDto(
        val id: String,
        val type: String,
        @SerialName("note") val note: String? = null,
        val photos: List<String> = emptyList(),
        val createdAt: String,
    )
}
