package app.swapl

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.swapl.core.auth.AuthViewModel
import app.swapl.design.SwaplApp
import app.swapl.features.auth.LoginScreen
import app.swapl.features.listings.BrowseScreen
import app.swapl.features.listings.ListingCreateScreen
import app.swapl.features.listings.ListingDetailScreen
import app.swapl.features.profile.AccountScreen
import app.swapl.features.profile.InterestsEditorScreen
import app.swapl.features.profile.PublicProfileScreen
import app.swapl.features.profile.SavedSearchesScreen
import app.swapl.features.swaps.SwapThreadScreen
import app.swapl.features.swaps.SwapsInboxScreen
import dagger.hilt.android.AndroidEntryPoint

// Top-level navigation graph. Each tab has its own NavHost so back-stacks stay
// per-tab (a la iOS NavigationStack-per-tab).

private enum class HomeDest(val title: String, val icon: ImageVector, val route: String) {
    Browse("Browse", Icons.Default.Home, "browse"),
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
        pendingDeepLink = intent?.data
        setContent {
            SwaplApp {
                val sizeClass = calculateWindowSizeClass(this)
                val isExpanded = sizeClass.widthSizeClass == WindowWidthSizeClass.Expanded
                val authVm: AuthViewModel = hiltViewModel()

                if (authVm.uiState.session == null) {
                    LoginScreen(authVm)
                } else {
                    HomeShell(
                        layoutType = if (isExpanded) NavigationSuiteType.NavigationRail else NavigationSuiteType.NavigationBar,
                        deepLink = pendingDeepLink,
                        onDeepLinkHandled = { pendingDeepLink = null },
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        pendingDeepLink = intent.data
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

    // Route the incoming swapl:// or https://swapl.fun/... deep link.
    LaunchedEffect(deepLink) {
        val uri = deepLink ?: return@LaunchedEffect
        val segs = uri.pathSegments
        val head = uri.host?.takeIf { it != "swapl.fun" } ?: segs.firstOrNull() ?: return@LaunchedEffect
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
        onDeepLinkHandled()
    }

    NavigationSuiteScaffold(
        layoutType = layoutType,
        navigationSuiteItems = {
            HomeDest.values().forEach { d ->
                item(
                    selected = current == d,
                    onClick = { current = d },
                    icon = { Icon(d.icon, contentDescription = d.title) },
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
            HomeDest.Swaps -> NavHost(navController = swapsNav, startDestination = "inbox") {
                composable("inbox") { SwapsInboxScreen(onOpen = { id -> swapsNav.navigate("thread/$id") }) }
                composable("thread/{proposalId}", arguments = listOf(navArgument("proposalId") { type = NavType.StringType })) {
                    SwapThreadScreen()
                }
            }
            HomeDest.Account -> {
                val accountNav = rememberNavController()
                NavHost(navController = accountNav, startDestination = "home") {
                    composable("home") {
                        AccountScreen(
                            onOpenInterests = { accountNav.navigate("interests") },
                            onOpenSavedSearches = { accountNav.navigate("savedSearches") },
                            onOpenPublicProfile = { id -> accountNav.navigate("profile/$id") },
                        )
                    }
                    composable("interests") {
                        InterestsEditorScreen(onDone = { accountNav.popBackStack() })
                    }
                    composable("savedSearches") { SavedSearchesScreen() }
                    composable("profile/{userId}", arguments = listOf(navArgument("userId") { type = NavType.StringType })) {
                        PublicProfileScreen()
                    }
                }
            }
        }
    }
}
