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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import android.content.Context
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.R
import app.swapl.core.model.UserSettings
import app.swapl.core.repository.ProfileRepository
import app.swapl.design.components.PrimaryPill
import app.swapl.design.components.SurfaceCard
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.ktor.client.plugins.ResponseException
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
        Text(stringResource(R.string.settings_personal_info_title), style = MaterialTheme.typography.displaySmall)

        if (vm.isLoading) {
            Box(Modifier.fillMaxWidth().padding(vertical = SwaplSpacing.s10), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            OutlinedTextField(
                vm.name, { vm.name = it },
                label = { Text(stringResource(R.string.settings_display_name)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                vm.bio, { vm.bio = it },
                label = { Text(stringResource(R.string.settings_about_you)) },
                placeholder = { Text(stringResource(R.string.settings_about_you_placeholder)) },
                modifier = Modifier.fillMaxWidth().heightIn(min = 120.dp),
            )
            OutlinedTextField(
                vm.work, { vm.work = it },
                label = { Text(stringResource(R.string.settings_my_work)) },
                placeholder = { Text(stringResource(R.string.settings_my_work_placeholder)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                vm.languages, { vm.languages = it },
                label = { Text(stringResource(R.string.settings_languages)) },
                placeholder = { Text(stringResource(R.string.settings_languages_placeholder)) },
                supportingText = { Text(stringResource(R.string.settings_languages_hint)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                vm.homeCity, { vm.homeCity = it },
                label = { Text(stringResource(R.string.settings_home_city)) },
                placeholder = { Text(stringResource(R.string.settings_home_city_placeholder)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                vm.homeCountry, { vm.homeCountry = it },
                label = { Text(stringResource(R.string.settings_home_country)) },
                placeholder = { Text(stringResource(R.string.settings_home_country_placeholder)) },
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
                    Text(stringResource(R.string.settings_saved_confirm), style = MaterialTheme.typography.bodyMedium)
                }
            }

            PrimaryPill(
                if (vm.isSaving) stringResource(R.string.common_saving) else stringResource(R.string.settings_save_changes),
                onClick = { vm.save() },
                enabled = !vm.isSaving,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Change password (DOK-149). Dialog with the three fields posted to
// /api/auth/change-password — this device's token survives, every other one
// is revoked server-side. Social/OTP accounts leave "current" empty to set
// their first password.
// ---------------------------------------------------------------------------

@HiltViewModel
class ChangePasswordViewModel @Inject constructor(
    private val repo: ProfileRepository,
    @ApplicationContext private val appContext: Context,
) : ViewModel() {
    var currentPassword by mutableStateOf("")
    var newPassword by mutableStateOf("")
    var confirmPassword by mutableStateOf("")
    var isSubmitting by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set

    fun submit(onSuccess: () -> Unit) {
        if (isSubmitting) return
        error = when {
            newPassword.length < 6 -> appContext.getString(R.string.pw_error_min6)
            newPassword != confirmPassword -> appContext.getString(R.string.pw_error_mismatch)
            else -> null
        }
        if (error != null) return
        isSubmitting = true
        viewModelScope.launch {
            runCatching { repo.changePassword(currentPassword.ifEmpty { null }, newPassword) }
                .onSuccess {
                    isSubmitting = false
                    onSuccess()
                }
                .onFailure {
                    isSubmitting = false
                    error = friendlyError(it)
                }
        }
    }

    private fun friendlyError(t: Throwable): String =
        when ((t as? ResponseException)?.response?.status?.value) {
            400 -> appContext.getString(R.string.pw_error_min6)
            403 -> appContext.getString(R.string.pw_error_incorrect)
            429 -> appContext.getString(R.string.pw_error_too_many)
            else -> appContext.getString(R.string.pw_error_generic)
        }
}

@Composable
fun ChangePasswordDialog(
    onDismiss: () -> Unit,
    onSuccess: () -> Unit,
    vm: ChangePasswordViewModel = hiltViewModel(),
) {
    AlertDialog(
        onDismissRequest = { if (!vm.isSubmitting) onDismiss() },
        title = { Text(stringResource(R.string.settings_change_password)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                OutlinedTextField(
                    vm.currentPassword, { vm.currentPassword = it },
                    label = { Text(stringResource(R.string.pw_current_label)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    supportingText = { Text(stringResource(R.string.pw_current_hint)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    vm.newPassword, { vm.newPassword = it },
                    label = { Text(stringResource(R.string.pw_new_label)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    supportingText = { Text(stringResource(R.string.pw_new_hint)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    vm.confirmPassword, { vm.confirmPassword = it },
                    label = { Text(stringResource(R.string.pw_confirm_label)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                )
                vm.error?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { vm.submit(onSuccess) },
                enabled = !vm.isSubmitting && vm.newPassword.isNotEmpty() && vm.confirmPassword.isNotEmpty(),
            ) {
                Text(if (vm.isSubmitting) stringResource(R.string.common_saving) else stringResource(R.string.settings_change_password))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !vm.isSubmitting) { Text(stringResource(R.string.common_cancel)) }
        },
    )
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
        Text(stringResource(R.string.settings_privacy_title), style = MaterialTheme.typography.displaySmall)

        if (s == null) {
            Box(Modifier.fillMaxWidth().padding(vertical = SwaplSpacing.s10), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            SettingToggleRow(
                title = stringResource(R.string.settings_seo_title),
                subtitle = stringResource(R.string.settings_seo_subtitle),
                checked = s.searchEngineIndexing,
                onToggle = { value ->
                    vm.update(
                        ProfileRepository.SettingsPatch(searchEngineIndexing = value),
                        s.copy(searchEngineIndexing = value),
                    )
                },
            )
            SettingToggleRow(
                title = stringResource(R.string.settings_show_home_city_title),
                subtitle = stringResource(R.string.settings_show_home_city_subtitle),
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
        Text(stringResource(R.string.settings_notifications_title), style = MaterialTheme.typography.displaySmall)

        if (s == null) {
            Box(Modifier.fillMaxWidth().padding(vertical = SwaplSpacing.s10), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            SettingToggleRow(
                title = stringResource(R.string.settings_email_notif_title),
                subtitle = stringResource(R.string.settings_email_notif_subtitle),
                checked = s.emailNotifications,
                onToggle = { value ->
                    vm.update(
                        ProfileRepository.SettingsPatch(emailNotifications = value),
                        s.copy(emailNotifications = value),
                    )
                },
            )
            SettingToggleRow(
                title = stringResource(R.string.settings_push_notif_title),
                subtitle = stringResource(R.string.settings_push_notif_subtitle),
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
