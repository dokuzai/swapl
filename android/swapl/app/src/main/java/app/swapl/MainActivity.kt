package app.swapl

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteType
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material3.Text
import androidx.hilt.navigation.compose.hiltViewModel
import app.swapl.design.SwaplApp
import app.swapl.features.auth.LoginScreen
import app.swapl.features.listings.BrowseScreen
import app.swapl.features.profile.AccountScreen
import app.swapl.features.swaps.SwapsInboxScreen
import app.swapl.core.auth.AuthViewModel
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SwaplApp {
                val sizeClass = calculateWindowSizeClass(this)
                val isExpanded = sizeClass.widthSizeClass == WindowWidthSizeClass.Expanded
                val authVm: AuthViewModel = hiltViewModel()
                val state = authVm.uiState

                if (state.session == null) {
                    LoginScreen(authVm)
                } else if (isExpanded) {
                    AdaptiveHomeShell()
                } else {
                    PhoneHomeShell()
                }
            }
        }
    }
}

private enum class HomeDest(val title: String, val icon: ImageVector) {
    Browse("Browse", Icons.Default.Home),
    Swaps("Swaps", Icons.Default.SwapHoriz),
    Account("Account", Icons.Default.Person),
}

@Composable
private fun PhoneHomeShell() {
    var current by remember { mutableStateOf(HomeDest.Browse) }
    NavigationSuiteScaffold(
        layoutType = NavigationSuiteType.NavigationBar,
        navigationSuiteItems = {
            HomeDest.values().forEach { d ->
                item(
                    selected = current == d,
                    onClick = { current = d },
                    icon = { /* icon */ },
                    label = { Text(d.title) }
                )
            }
        }
    ) {
        when (current) {
            HomeDest.Browse -> BrowseScreen()
            HomeDest.Swaps -> SwapsInboxScreen()
            HomeDest.Account -> AccountScreen()
        }
    }
}

@Composable
private fun AdaptiveHomeShell() {
    var current by remember { mutableStateOf(HomeDest.Browse) }
    NavigationSuiteScaffold(
        layoutType = NavigationSuiteType.NavigationRail,
        navigationSuiteItems = {
            HomeDest.values().forEach { d ->
                item(
                    selected = current == d,
                    onClick = { current = d },
                    icon = { /* icon */ },
                    label = { Text(d.title) }
                )
            }
        }
    ) {
        when (current) {
            HomeDest.Browse -> BrowseScreen()
            HomeDest.Swaps -> SwapsInboxScreen()
            HomeDest.Account -> AccountScreen()
        }
    }
}
