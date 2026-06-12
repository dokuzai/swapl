package app.swapl.features.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.UserSettings
import app.swapl.core.repository.ProfileRepository
import app.swapl.design.components.PrimaryPill
import app.swapl.design.components.SurfaceCard
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

// ---------------------------------------------------------------------------
// Personal information (DOK-147). Mirrors the web /account editor and the iOS
// PersonalInfoView: display name, bio, work, languages, home city/country.
// Prefilled from GET /api/me, saved via PATCH /api/profile (partial; empty
// strings clear the nullable fields server-side).
// ---------------------------------------------------------------------------

@HiltViewModel
class PersonalInfoViewModel @Inject constructor(
    private val repo: ProfileRepository,
) : ViewModel() {
    var name by mutableStateOf("")
    var bio by mutableStateOf("")
    var work by mutableStateOf("")
    // Comma-separated in the UI, array on the wire.
    var languages by mutableStateOf("")
    var homeCity by mutableStateOf("")
    var homeCountry by mutableStateOf("")

    var isLoading by mutableStateOf(true); private set
    var isSaving by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    var saved by mutableStateOf(false); private set

    fun load() = viewModelScope.launch {
        error = null
        runCatching { repo.me() }
            .onSuccess { me ->
                name = me.user.name.orEmpty()
                bio = me.user.bio.orEmpty()
                work = me.user.work.orEmpty()
                languages = me.user.languages.orEmpty().joinToString(", ")
                homeCity = me.user.homeCity.orEmpty()
                homeCountry = me.user.homeCountry.orEmpty()
            }
            .onFailure { error = it.message }
        isLoading = false
    }

    fun save() = viewModelScope.launch {
        isSaving = true
        error = null
        saved = false
        val body = ProfileRepository.ProfileUpdateBody(
            // The API requires a non-empty name; skip the key when blank so
            // the stored name is kept rather than rejected.
            name = name.trim().ifEmpty { null },
            bio = bio.trim(),
            work = work.trim(),
            languages = languages.split(",").map { it.trim() }.filter { it.isNotEmpty() },
            homeCity = homeCity.trim(),
            homeCountry = homeCountry.trim(),
        )
        runCatching { repo.updateProfile(body) }
            .onSuccess { saved = true }
            .onFailure { error = it.message }
        isSaving = false
    }
}

@Composable
fun PersonalInfoScreen(vm: PersonalInfoViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
    ) {
        Text("Personal information", style = MaterialTheme.typography.displaySmall)

        if (vm.isLoading) {
            Box(Modifier.fillMaxWidth().padding(vertical = SwaplSpacing.s10), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            OutlinedTextField(
                vm.name, { vm.name = it },
                label = { Text("Display name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                vm.bio, { vm.bio = it },
                label = { Text("About you") },
                placeholder = { Text("Tell hosts a little about yourself.") },
                modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp),
            )
            OutlinedTextField(
                vm.work, { vm.work = it },
                label = { Text("My work") },
                placeholder = { Text("e.g. Architect") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                vm.languages, { vm.languages = it },
                label = { Text("Languages") },
                placeholder = { Text("e.g. English, Italian") },
                supportingText = { Text("Separate languages with commas.") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                vm.homeCity, { vm.homeCity = it },
                label = { Text("Home city") },
                placeholder = { Text("e.g. Milan") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                vm.homeCountry, { vm.homeCountry = it },
                label = { Text("Home country") },
                placeholder = { Text("e.g. Italy") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            vm.error?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
            if (vm.saved) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                ) {
                    Icon(
                        Icons.Default.CheckCircle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(18.dp),
                    )
                    Text("Saved. Your public profile is up to date.", style = MaterialTheme.typography.bodyMedium)
                }
            }

            PrimaryPill(
                if (vm.isSaving) "Saving…" else "Save changes",
                onClick = { vm.save() },
                enabled = !vm.isSaving,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Privacy & Notifications (DOK-147). Both screens share the same store:
// GET /api/profile/settings on appear, optimistic toggle + partial PATCH per
// switch, with a rollback to the server truth on failure.
// ---------------------------------------------------------------------------

@HiltViewModel
class AccountSettingsViewModel @Inject constructor(
    private val repo: ProfileRepository,
) : ViewModel() {
    var settings by mutableStateOf<UserSettings?>(null); private set
    var error by mutableStateOf<String?>(null); private set

    fun load() = viewModelScope.launch {
        error = null
        runCatching { settings = repo.settings() }
            .onFailure { error = it.message }
    }

    fun update(patch: ProfileRepository.SettingsPatch, optimistic: UserSettings) = viewModelScope.launch {
        val before = settings ?: return@launch
        settings = optimistic
        error = null
        runCatching { settings = repo.updateSettings(patch) }
            .onFailure {
                error = it.message
                // Roll the optimistic toggle back to the last known server state.
                settings = before
            }
    }
}

@Composable
fun PrivacySettingsScreen(vm: AccountSettingsViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    val s = vm.settings

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
    ) {
        Text("Privacy", style = MaterialTheme.typography.displaySmall)

        if (s == null) {
            Box(Modifier.fillMaxWidth().padding(vertical = SwaplSpacing.s10), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            SettingToggleRow(
                title = "Search engine indexing",
                subtitle = "Allow your listing pages to appear in search engines like Google.",
                checked = s.searchEngineIndexing,
                onToggle = { value ->
                    vm.update(
                        ProfileRepository.SettingsPatch(searchEngineIndexing = value),
                        s.copy(searchEngineIndexing = value),
                    )
                },
            )
            SettingToggleRow(
                title = "Show my home city",
                subtitle = "Display your home city and country on your public profile.",
                checked = s.showHomeCity,
                onToggle = { value ->
                    vm.update(
                        ProfileRepository.SettingsPatch(showHomeCity = value),
                        s.copy(showHomeCity = value),
                    )
                },
            )
            vm.error?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
            // The AI travel profile (what the assistant remembers about you,
            // deletable) lives with privacy, like on web and iOS.
            TravelProfileCard()
        }
    }
}

@Composable
fun NotificationSettingsScreen(vm: AccountSettingsViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    val s = vm.settings

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
    ) {
        Text("Notifications", style = MaterialTheme.typography.displaySmall)

        if (s == null) {
            Box(Modifier.fillMaxWidth().padding(vertical = SwaplSpacing.s10), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            SettingToggleRow(
                title = "Email notifications",
                subtitle = "Proposals, confirmations and trip reminders by email.",
                checked = s.emailNotifications,
                onToggle = { value ->
                    vm.update(
                        ProfileRepository.SettingsPatch(emailNotifications = value),
                        s.copy(emailNotifications = value),
                    )
                },
            )
            SettingToggleRow(
                title = "Push notifications",
                subtitle = "Real-time alerts on this device when something needs you.",
                checked = s.pushNotifications,
                onToggle = { value ->
                    vm.update(
                        ProfileRepository.SettingsPatch(pushNotifications = value),
                        s.copy(pushNotifications = value),
                    )
                },
            )
            vm.error?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

// Card-style toggle row shared by the Privacy and Notifications screens.
@Composable
private fun SettingToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onToggle: (Boolean) -> Unit,
) {
    SurfaceCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, style = MaterialTheme.typography.bodyLarge)
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(checked = checked, onCheckedChange = onToggle)
        }
    }
}
