package app.swapl.core.feedback

import android.content.Context
import android.content.SharedPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

// No-re-nag guard for the contextual app-feedback prompts (DOK-190). Each
// trigger is keyed by surface + agreementId so a user is asked at most once per
// (surface, agreement) — the flag is set on submit OR dismiss. Plain (non-
// encrypted) SharedPreferences: these are throwaway booleans, not secrets.
@Singleton
class AppFeedbackPrefs @Inject constructor(@ApplicationContext context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("swapl_appfb", Context.MODE_PRIVATE)

    private fun key(surface: String, agreementId: String) = "swapl.appfb.$surface.$agreementId"

    fun wasPrompted(surface: String, agreementId: String): Boolean =
        prefs.getBoolean(key(surface, agreementId), false)

    fun markPrompted(surface: String, agreementId: String) {
        prefs.edit().putBoolean(key(surface, agreementId), true).apply()
    }
}
