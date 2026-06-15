package app.swapl.features.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.AddHome
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PrivacyTip
import androidx.compose.material.icons.filled.QueryStats
import androidx.compose.material.icons.filled.Redeem
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.auth.AuthViewModel
import app.swapl.core.model.MeResponse
import app.swapl.core.repository.ListingRepository
import app.swapl.core.repository.ProfileRepository
import app.swapl.core.repository.SearchFilters
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.TagChip
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AccountOverviewViewModel @Inject constructor(
    private val repo: ProfileRepository,
    private val listings: ListingRepository,
) : ViewModel() {
    var me by mutableStateOf<MeResponse?>(null); private set
    var ownListingId by mutableStateOf<String?>(null); private set
    fun load() = viewModelScope.launch {
        runCatching { me = repo.me() }
        runCatching { ownListingId = listings.search(SearchFilters()).viewerListingId }
    }
}

@Composable
fun AccountScreen(
    onOpenInterests: () -> Unit = {},
    onOpenSavedSearches: () -> Unit = {},
    onOpenTravelWindows: () -> Unit = {},
    onOpenKeys: () -> Unit = {},
    onOpenInvite: () -> Unit = {},
    onOpenMetrics: () -> Unit = {},
    onOpenPublicProfile: (String) -> Unit = {},
    onOpenPersonalInfo: () -> Unit = {},
    onOpenPrivacy: () -> Unit = {},
    onOpenNotifications: () -> Unit = {},
    onBecomeHost: () -> Unit = {},
    onEditHome: (String) -> Unit = {},
    authVm: AuthViewModel = hiltViewModel(),
    overview: AccountOverviewViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { overview.load() }
    val s = authVm.uiState.session
    val uriHandler = LocalUriHandler.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var confirmSignOut by remember { mutableStateOf(false) }
    var passkeyMessage by remember { mutableStateOf<String?>(null) }
    var addingPasskey by remember { mutableStateOf(false) }
    var showChangePassword by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }

    // "Passkeys" menu entry: options from the backend → Credential Manager
    // sheet → verify. Graceful on every exit: dismissal is silent, anything
    // else lands in a plain dialog (never a crash).
    fun addPasskey() {
        if (addingPasskey) return
        addingPasskey = true
        scope.launch {
            try {
                val optionsJson = authVm.passkeyRegistrationOptionsJson()
                val result = CredentialManager.create(context).createCredential(
                    context,
                    CreatePublicKeyCredentialRequest(requestJson = optionsJson),
                )
                val responseJson =
                    (result as? CreatePublicKeyCredentialResponse)?.registrationResponseJson
                if (responseJson == null) {
                    passkeyMessage = "Could not add a passkey on this device."
                } else {
                    val device = android.os.Build.MODEL?.takeIf { it.isNotBlank() }
                    authVm.completePasskeyRegistration(responseJson, device)
                    passkeyMessage = "Passkey added — next time you can sign in without a password."
                }
            } catch (_: CreateCredentialCancellationException) {
                // User dismissed the sheet — not an error.
            } catch (_: CreateCredentialException) {
                passkeyMessage = "Could not add a passkey on this device."
            } catch (_: Throwable) {
                passkeyMessage = "Passkeys aren't available right now. Try again later."
            } finally {
                addingPasskey = false
            }
        }
    }

    // Box overlay so the change-password snackbar can float over the
    // scrolling settings column (the screen has no Scaffold of its own).
    Box(Modifier.fillMaxSize()) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
    ) {
        Text("Profile", style = MaterialTheme.typography.displaySmall)

        if (s != null) {
            SurfaceCard {
                Column(
                    Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
                ) {
                    AvatarCircle(initials = initialsFor(s.name, s.email))
                    Text(s.name ?: s.email.substringBefore("@"), style = MaterialTheme.typography.titleLarge)
                    Text(
                        s.email,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TagChip("Swapl member")

                    overview.me?.let { me ->
                        Spacer(Modifier.height(SwaplSpacing.s1))
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                        Spacer(Modifier.height(SwaplSpacing.s1))
                        Row(Modifier.fillMaxWidth()) {
                            Stat("Waiting", me.counts.incomingProposals, Modifier.weight(1f))
                            Stat("Sent", me.counts.outgoingProposals, Modifier.weight(1f))
                            Stat("Active", me.counts.activeSwaps, Modifier.weight(1f), accent = true)
                            Stat("Homes", me.counts.listings, Modifier.weight(1f))
                        }
                    }
                }
            }
        }

        // "Become a host" / "Edit your home" card, mirroring the iOS profile card.
        SurfaceCard(
            modifier = Modifier.clickable {
                overview.ownListingId?.let(onEditHome) ?: onBecomeHost()
            },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                Icon(
                    if (overview.ownListingId != null) Icons.Default.Edit else Icons.Default.AddHome,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
                Column {
                    Text(
                        if (overview.ownListingId != null) "Edit your home" else "Become a host",
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(
                        if (overview.ownListingId != null) "Update photos, dates and details."
                        else "List your home to start swapping.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        // Didit identity verification — env-gated, hidden once verified.
        // A paid referral reward surfaces as a one-time snackbar.
        IdentityVerificationCard(
            onReward = { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } },
        )

        overview.me?.subscription?.let { sub ->
            SurfaceCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        KickerLabel("Plan")
                        Text(sub.planId.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.titleLarge)
                    }
                    TagChip(sub.status)
                }
            }
        }

        // Airbnb-style structured settings (DOK-147), mirroring the iOS
        // AccountView and web /account sections.
        Column {
            KickerLabel("Settings")
            MenuRow(Icons.Default.AccountCircle, "Personal information", onClick = onOpenPersonalInfo)
            // Login & security (DOK-149): in-place password change + passkeys.
            MenuRow(Icons.Default.Lock, "Change password") { showChangePassword = true }
            MenuRow(Icons.Default.Key, if (addingPasskey) "Login & security — Passkeys…" else "Login & security — Passkeys") { addPasskey() }
            MenuRow(Icons.Default.PrivacyTip, "Privacy", onClick = onOpenPrivacy)
            MenuRow(Icons.Default.Notifications, "Notifications", onClick = onOpenNotifications)
        }

        Column {
            KickerLabel("Profile")
            MenuRow(Icons.Default.Person, "View profile") { s?.id?.let(onOpenPublicProfile) }
            // Keys wallet (DOK-155) — "travel points", never money.
            MenuRow(Icons.Default.Key, "Travel points", onClick = onOpenKeys)
            // Invite & earn (DOK-157) — referrals earn KEYS, never money.
            MenuRow(Icons.Default.Redeem, "Invite & earn", onClick = onOpenInvite)
            MenuRow(Icons.Default.Favorite, "Interests", onClick = onOpenInterests)
            MenuRow(Icons.Default.Search, "Saved searches", onClick = onOpenSavedSearches)
            // Travel windows (DOK-161) — saved "when I want to go" intents the
            // assistant turns into ready-made swaps.
            MenuRow(Icons.Default.CalendarMonth, "Travel windows", onClick = onOpenTravelWindows)
            if (overview.me?.user?.role == "swapl_admin") {
                MenuRow(Icons.Default.QueryStats, "Metrics", onClick = onOpenMetrics)
            }
        }

        Column {
            KickerLabel("Support")
            MenuRow(Icons.AutoMirrored.Filled.HelpOutline, "Get help") { uriHandler.openUri("https://swapl.fun/contact") }
            MenuRow(Icons.Default.PrivacyTip, "Privacy policy") { uriHandler.openUri("https://swapl.fun/privacy") }
            MenuRow(Icons.Default.Description, "Terms of service") { uriHandler.openUri("https://swapl.fun/terms") }
            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
            MenuRow(Icons.AutoMirrored.Filled.Logout, "Log out", destructive = true) { confirmSignOut = true }
        }

        // Real version footer from BuildConfig — no hardcoded numbers.
        Text(
            "Version ${app.swapl.BuildConfig.VERSION_NAME} (${app.swapl.BuildConfig.VERSION_CODE})",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = SwaplSpacing.s4),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    }

    // Real-time referrer toast (DOK-157): "NAME just verified — you earned
    // Keys!" while the account screen is open, reusing the same snackbar host.
    app.swapl.features.referrals.ReferrerNotificationsPoller(
        showMessage = { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } },
    )

    SnackbarHost(
        hostState = snackbarHostState,
        modifier = Modifier.align(Alignment.BottomCenter),
    )
    }

    if (showChangePassword) {
        ChangePasswordDialog(
            onDismiss = { showChangePassword = false },
            onSuccess = {
                showChangePassword = false
                scope.launch { snackbarHostState.showSnackbar("Password changed. Other devices were signed out.") }
            },
        )
    }

    passkeyMessage?.let { msg ->
        AlertDialog(
            onDismissRequest = { passkeyMessage = null },
            title = { Text("Passkeys") },
            text = { Text(msg) },
            confirmButton = {
                TextButton(onClick = { passkeyMessage = null }) { Text("OK") }
            },
        )
    }

    if (confirmSignOut) {
        AlertDialog(
            onDismissRequest = { confirmSignOut = false },
            title = { Text("Log out?") },
            text = { Text("You'll need to sign in again to see your swaps.") },
            confirmButton = {
                TextButton(onClick = { confirmSignOut = false; authVm.signOut() }) {
                    Text("Log out", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmSignOut = false }) { Text("Cancel") }
            },
        )
    }
}

private fun initialsFor(name: String?, email: String): String {
    val source = name?.takeIf { it.isNotBlank() } ?: email.substringBefore("@")
    return source.split(" ", ".", "_", "-")
        .filter { it.isNotBlank() }
        .take(2)
        .joinToString("") { it.first().uppercase() }
        .ifEmpty { "?" }
}

@Composable
private fun AvatarCircle(initials: String) {
    Box(
        modifier = Modifier
            .size(96.dp())
            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(initials, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
    }
}

private fun Int.dp() = androidx.compose.ui.unit.Dp(this.toFloat())

@Composable
private fun Stat(label: String, value: Int, modifier: Modifier = Modifier, accent: Boolean = false) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value.toString(),
            style = MaterialTheme.typography.titleLarge,
            color = if (accent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
        )
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun MenuRow(
    icon: ImageVector,
    label: String,
    destructive: Boolean = false,
    onClick: () -> Unit,
) {
    val tint = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
    ListItem(
        headlineContent = { Text(label, color = tint) },
        leadingContent = { Icon(icon, contentDescription = null, tint = tint) },
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.background),
        modifier = Modifier.clickable(onClick = onClick),
    )
}
