package app.swapl

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Luggage
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteType
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import app.swapl.designtokens.SwaplSpacing
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.swapl.core.auth.AuthViewModel
import app.swapl.design.SwaplApp
import app.swapl.features.auth.LoginScreen
import app.swapl.features.inspire.InspireScreen
import app.swapl.features.listings.BrowseScreen
import app.swapl.features.listings.ListingCreateScreen
import app.swapl.features.listings.ListingDetailScreen
import app.swapl.features.metrics.MetricsScreen
import app.swapl.features.trips.TripDetailScreen
import app.swapl.features.trips.TripsScreen
import app.swapl.features.wishlists.WishlistsScreen
import app.swapl.features.profile.AccountScreen
import app.swapl.features.profile.InterestsEditorScreen
import app.swapl.features.profile.NotificationSettingsScreen
import app.swapl.features.profile.PersonalInfoScreen
import app.swapl.features.profile.PrivacySettingsScreen
import app.swapl.features.profile.PublicProfileScreen
import app.swapl.features.profile.SavedSearchesScreen
import app.swapl.features.swaps.SwapChatScreen
import app.swapl.features.swaps.SwapThreadScreen
import app.swapl.features.swaps.SwapsInboxScreen
import app.swapl.features.swaps.UnreadViewModel
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.runtime.DisposableEffect
import dagger.hilt.android.AndroidEntryPoint

// Top-level navigation graph. Each tab has its own NavHost so back-stacks stay
// per-tab (a la iOS NavigationStack-per-tab).

private enum class HomeDest(val title: String, val icon: ImageVector, val route: String) {
    Browse("Browse", Icons.Default.Home, "browse"),
    Wishlists("Wishlists", Icons.Default.FavoriteBorder, "wishlists"),
    Trips("Trips", Icons.Default.Luggage, "trips"),
    Swaps("Swaps", Icons.Default.SwapHoriz, "swaps"),
    Account("Account", Icons.Default.Person, "account"),
}

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    private var pendingDeepLink by mutableStateOf<Uri?>(null)

    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        pendingDeepLink = runCatching { intent?.data }.getOrNull()
        setContent {
            SwaplApp {
                val sizeClass = calculateWindowSizeClass(this)
                val isExpanded = sizeClass.widthSizeClass == WindowWidthSizeClass.Expanded
                val authVm: AuthViewModel = hiltViewModel()

                if (authVm.uiState.session == null) {
                    LoginScreen(authVm)
                } else {
                    Column {
                        if (!authVm.uiState.emailVerified) {
                            VerifyEmailBanner(
                                isResending = authVm.uiState.isResendingVerification,
                                onResend = { authVm.resendVerification() },
                            )
                        }
                        HomeShell(
                            layoutType = if (isExpanded) NavigationSuiteType.NavigationRail else NavigationSuiteType.NavigationBar,
                            deepLink = pendingDeepLink,
                            onDeepLinkHandled = { pendingDeepLink = null },
                        )
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        pendingDeepLink = runCatching { intent.data }.getOrNull()
    }
}

// Mirrors the iOS unverified-email banner: persistent strip with a Resend action.
@Composable
private fun VerifyEmailBanner(isResending: Boolean, onResend: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.secondaryContainer) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s1),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Verify your email to unlock swaps.",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = onResend, enabled = !isResending) {
                Text(if (isResending) "Sending…" else "Resend")
            }
        }
    }
}

@Composable
private fun HomeShell(
    layoutType: NavigationSuiteType,
    deepLink: Uri?,
    onDeepLinkHandled: () -> Unit,
) {
    var current by remember { mutableStateOf(HomeDest.Browse) }

    val browseNav = rememberNavController()
    val swapsNav = rememberNavController()

    // Unread badge on the Messages (Swaps) tab — light foreground poll of
    // GET /api/conversations (DOK-154). Pause in the background.
    val unreadVm: UnreadViewModel = hiltViewModel()
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> unreadVm.startPolling()
                Lifecycle.Event.ON_PAUSE -> unreadVm.stopPolling()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    // Refresh promptly when the user lands on the tab so the badge clears as
    // threads are read.
    LaunchedEffect(current) { if (current == HomeDest.Swaps) unreadVm.refresh() }

    // Route the incoming swapl:// or https://swapl.fun/... deep link. Malformed
    // URIs (push payload typos, hostile intents) must never crash the shell.
    LaunchedEffect(deepLink) {
        val uri = deepLink ?: return@LaunchedEffect
        try {
            val segs = uri.pathSegments
            val head = uri.host?.takeIf { it != "swapl.fun" } ?: segs.firstOrNull()
            val id = if (uri.host == null || uri.host == "swapl.fun") segs.getOrNull(1) else segs.getOrNull(0)
            when (head) {
                "swaps" -> id?.let {
                    current = HomeDest.Swaps
                    swapsNav.navigate("thread/$it")
                }
                "listings" -> id?.let {
                    current = HomeDest.Browse
                    browseNav.navigate("detail/$it")
                }
            }
        } catch (e: Exception) {
            Log.w("swapl/deeplink", "could not route $uri", e)
        }
        onDeepLinkHandled()
    }

    NavigationSuiteScaffold(
        layoutType = layoutType,
        navigationSuiteItems = {
            HomeDest.values().forEach { d ->
                item(
                    selected = current == d,
                    onClick = { current = d },
                    icon = {
                        if (d == HomeDest.Swaps && unreadVm.totalUnread > 0) {
                            BadgedBox(badge = {
                                Badge { Text(if (unreadVm.totalUnread > 99) "99+" else unreadVm.totalUnread.toString()) }
                            }) {
                                Icon(d.icon, contentDescription = d.title)
                            }
                        } else {
                            Icon(d.icon, contentDescription = d.title)
                        }
                    },
                    label = { Text(d.title) }
                )
            }
        }
    ) {
        when (current) {
            HomeDest.Browse -> NavHost(navController = browseNav, startDestination = "list") {
                composable("list") {
                    BrowseScreen(
                        onOpen = { id -> browseNav.navigate("detail/$id") },
                        onNew = { browseNav.navigate("new") },
                        onEditOwn = { id -> browseNav.navigate("edit/$id") },
                        onInspire = { browseNav.navigate("inspire") },
                    )
                }
                composable("inspire") {
                    // Get Inspired (DOK-146). Confirm creates a REAL proposal —
                    // jump to the existing Swaps thread; dismiss just pops.
                    InspireScreen(
                        onFinished = { proposalId ->
                            browseNav.popBackStack()
                            if (proposalId != null) {
                                current = HomeDest.Swaps
                                swapsNav.navigate("thread/$proposalId")
                            }
                        },
                    )
                }
                composable("detail/{listingId}", arguments = listOf(navArgument("listingId") { type = NavType.StringType })) {
                    ListingDetailScreen(
                        onOpenHost = { id -> browseNav.navigate("profile/$id") },
                        onEdit = { id -> browseNav.navigate("edit/$id") },
                    )
                }
                composable("profile/{userId}", arguments = listOf(navArgument("userId") { type = NavType.StringType })) {
                    PublicProfileScreen(onOpenListing = { id -> browseNav.navigate("detail/$id") })
                }
                composable("new") {
                    ListingCreateScreen(onDone = { browseNav.popBackStack() })
                }
                composable("edit/{listingId}", arguments = listOf(navArgument("listingId") { type = NavType.StringType })) {
                    ListingCreateScreen(onDone = { browseNav.popBackStack() })
                }
            }
            HomeDest.Wishlists -> {
                val wishlistsNav = rememberNavController()
                NavHost(navController = wishlistsNav, startDestination = "grid") {
                    composable("grid") {
                        WishlistsScreen(onOpen = { id -> wishlistsNav.navigate("detail/$id") })
                    }
                    composable("detail/{listingId}", arguments = listOf(navArgument("listingId") { type = NavType.StringType })) {
                        ListingDetailScreen(
                            onOpenHost = { id -> wishlistsNav.navigate("profile/$id") },
                            onEdit = {},
                        )
                    }
                    composable("profile/{userId}", arguments = listOf(navArgument("userId") { type = NavType.StringType })) {
                        PublicProfileScreen(onOpenListing = { id -> wishlistsNav.navigate("detail/$id") })
                    }
                }
            }
            HomeDest.Trips -> {
                val tripsNav = rememberNavController()
                NavHost(navController = tripsNav, startDestination = "list") {
                    composable("list") {
                        TripsScreen(onOpen = { id -> tripsNav.navigate("detail/$id") })
                    }
                    composable("detail/{proposalId}", arguments = listOf(navArgument("proposalId") { type = NavType.StringType })) {
                        TripDetailScreen(onOpenProfile = { id -> tripsNav.navigate("profile/$id") })
                    }
                    composable("profile/{userId}", arguments = listOf(navArgument("userId") { type = NavType.StringType })) {
                        PublicProfileScreen()
                    }
                }
            }
            HomeDest.Swaps -> NavHost(navController = swapsNav, startDestination = "inbox") {
                composable("inbox") { SwapsInboxScreen(onOpen = { id -> swapsNav.navigate("thread/$id") }) }
                composable("thread/{proposalId}", arguments = listOf(navArgument("proposalId") { type = NavType.StringType })) {
                    SwapThreadScreen(
                        onOpenProfile = { id -> swapsNav.navigate("profile/$id") },
                        onOpenChat = { id -> swapsNav.navigate("chat/$id") },
                    )
                }
                composable("chat/{proposalId}", arguments = listOf(navArgument("proposalId") { type = NavType.StringType })) {
                    // Reading the thread clears its unread; refresh the badge on exit.
                    DisposableEffect(Unit) { onDispose { unreadVm.refresh() } }
                    SwapChatScreen()
                }
                composable("profile/{userId}", arguments = listOf(navArgument("userId") { type = NavType.StringType })) {
                    PublicProfileScreen()
                }
            }
            HomeDest.Account -> {
                val accountNav = rememberNavController()
                NavHost(navController = accountNav, startDestination = "home") {
                    composable("home") {
                        AccountScreen(
                            onOpenInterests = { accountNav.navigate("interests") },
                            onOpenSavedSearches = { accountNav.navigate("savedSearches") },
                            onOpenMetrics = { accountNav.navigate("metrics") },
                            onOpenPublicProfile = { id -> accountNav.navigate("profile/$id") },
                            onOpenPersonalInfo = { accountNav.navigate("personalInfo") },
                            onOpenPrivacy = { accountNav.navigate("privacy") },
                            onOpenNotifications = { accountNav.navigate("notifications") },
                            onBecomeHost = { accountNav.navigate("new") },
                            onEditHome = { id -> accountNav.navigate("edit/$id") },
                        )
                    }
                    composable("personalInfo") { PersonalInfoScreen() }
                    composable("privacy") { PrivacySettingsScreen() }
                    composable("notifications") { NotificationSettingsScreen() }
                    composable("interests") {
                        InterestsEditorScreen(onDone = { accountNav.popBackStack() })
                    }
                    composable("savedSearches") { SavedSearchesScreen() }
                    composable("metrics") { MetricsScreen() }
                    composable("profile/{userId}", arguments = listOf(navArgument("userId") { type = NavType.StringType })) {
                        PublicProfileScreen()
                    }
                    composable("new") {
                        ListingCreateScreen(onDone = { accountNav.popBackStack() })
                    }
                    composable("edit/{listingId}", arguments = listOf(navArgument("listingId") { type = NavType.StringType })) {
                        ListingCreateScreen(onDone = { accountNav.popBackStack() })
                    }
                }
            }
        }
    }
}
