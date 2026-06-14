package app.swapl.core.model

import kotlinx.serialization.Serializable

// GET /api/config/support-contacts — the 24/7 phone line and help-centre URL
// surfaced from the "Report a problem" flow. These used to be hardcoded in the
// app; now they come from one server endpoint so ops can change them without a
// release. Public, no auth.
@Serializable
data class SupportContacts(
    val phone: String,
    val helpUrl: String,
) {
    companion object {
        // Launch defaults, used until the server payload loads or if it fails.
        val FALLBACK = SupportContacts(
            phone = "+44 800 000 swap",
            helpUrl = "https://swapl.fun/help",
        )
    }
}
