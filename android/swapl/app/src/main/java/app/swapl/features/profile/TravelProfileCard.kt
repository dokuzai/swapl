package app.swapl.features.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.TravelProfile
import app.swapl.core.repository.AssistantRepository
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.TagChip
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import io.ktor.client.plugins.ResponseException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

// "Your travel profile" (DOK-146) — the transparent AI profile, built ONLY
// from in-app signals. The user reads exactly what the assistant knows, can
// rebuild it on demand (429 after 5/hour) and can delete it entirely.

data class TravelProfileState(
    val profile: TravelProfile? = null,
    val isLoading: Boolean = false,
    val isWorking: Boolean = false,
    val error: String? = null,
    /** True right after a delete — GET would silently rebuild, so we wait
     *  for an explicit "Build it again" tap instead. */
    val deleted: Boolean = false,
)

@HiltViewModel
class TravelProfileViewModel @Inject constructor(
    private val repo: AssistantRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(TravelProfileState())
    val state: StateFlow<TravelProfileState> = _state.asStateFlow()

    /** GET builds on first read, so this always yields a profile. */
    fun load(force: Boolean = false) {
        val s = _state.value
        if (!force && (s.profile != null || s.isLoading || s.deleted)) return
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null, deleted = false) }
            try {
                val profile = repo.profile()
                _state.update { it.copy(isLoading = false, profile = profile) }
            } catch (t: Throwable) {
                _state.update { it.copy(isLoading = false, error = friendlyError(t)) }
            }
        }
    }

    fun refresh() {
        if (_state.value.isWorking) return
        viewModelScope.launch {
            _state.update { it.copy(isWorking = true, error = null) }
            try {
                val profile = repo.refreshProfile()
                _state.update { it.copy(isWorking = false, profile = profile, deleted = false) }
            } catch (t: Throwable) {
                _state.update { it.copy(isWorking = false, error = friendlyError(t)) }
            }
        }
    }

    fun delete() {
        if (_state.value.isWorking) return
        viewModelScope.launch {
            _state.update { it.copy(isWorking = true, error = null) }
            try {
                repo.deleteProfile()
                _state.update { it.copy(isWorking = false, profile = null, deleted = true) }
            } catch (t: Throwable) {
                _state.update { it.copy(isWorking = false, error = friendlyError(t)) }
            }
        }
    }

    private fun friendlyError(t: Throwable): String =
        when ((t as? ResponseException)?.response?.status?.value) {
            429 -> "Profile refreshed too recently — try again in a bit."
            else -> t.message ?: "Something went wrong. Please try again."
        }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TravelProfileCard(vm: TravelProfileViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    var confirmDelete by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { vm.load() }

    SurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                Icon(
                    Icons.Default.AutoAwesome,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp),
                )
                Column(Modifier.weight(1f)) {
                    KickerLabel("Your travel profile")
                }
                if (state.isLoading || state.isWorking) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                }
            }

            when {
                state.deleted -> Text(
                    "Profile deleted. We'll only rebuild it if you ask.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                state.profile != null -> {
                    val profile = state.profile!!
                    Text(profile.summary, style = MaterialTheme.typography.bodyMedium)
                    val chips = profile.traits.themes + profile.traits.cities
                    if (chips.isNotEmpty()) {
                        FlowRow(
                            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s1),
                            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1),
                        ) {
                            chips.take(8).forEach { TagChip(it) }
                        }
                    }
                    Text(
                        "Built only from what you do on Swapl" +
                            (profile.sourcesUsed.takeIf { it.isNotEmpty() }
                                ?.let { ": " + it.joinToString(", ") { s -> s.replace('_', ' ') } } ?: "") +
                            ". You can refresh or delete it anytime.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                state.isLoading -> Text(
                    "Reading your profile…",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            state.error?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }

            Row(modifier = Modifier.fillMaxWidth()) {
                if (state.deleted) {
                    TextButton(onClick = { vm.load(force = true) }, enabled = !state.isWorking && !state.isLoading) {
                        Text("Build it again")
                    }
                } else {
                    TextButton(onClick = { vm.refresh() }, enabled = !state.isWorking && !state.isLoading) {
                        Text("Refresh")
                    }
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = { confirmDelete = true }, enabled = !state.isWorking && state.profile != null) {
                        Text("Delete", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete travel profile?") },
            text = { Text("This erases the AI's summary of your tastes. It won't come back unless you rebuild it.") },
            confirmButton = {
                TextButton(onClick = { confirmDelete = false; vm.delete() }) {
                    Text("Delete", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }) { Text("Cancel") }
            },
        )
    }
}
