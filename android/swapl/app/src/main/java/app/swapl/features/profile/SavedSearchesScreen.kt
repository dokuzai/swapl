package app.swapl.features.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.SavedSearch
import app.swapl.core.repository.ProfileRepository
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.SurfaceCard
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SavedSearchesViewModel @Inject constructor(
    private val repo: ProfileRepository,
) : ViewModel() {
    val items = mutableStateListOf<SavedSearch>()
    var requiresUpgrade by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set

    fun load() = viewModelScope.launch {
        try {
            items.clear()
            items.addAll(repo.savedSearches())
        } catch (t: io.ktor.client.plugins.ClientRequestException) {
            if (t.response.status.value == 402) requiresUpgrade = true
            else error = t.message
        } catch (t: Throwable) {
            error = t.message
        }
    }
}

@Composable
fun SavedSearchesScreen(vm: SavedSearchesViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    Column(Modifier.fillMaxSize().padding(SwaplSpacing.s4)) {
        Text("Saved searches", style = MaterialTheme.typography.displaySmall)
        if (vm.requiresUpgrade) {
            SurfaceCard(modifier = Modifier.padding(top = SwaplSpacing.s3)) {
                KickerLabel("Plus / Pro")
                Text(
                    "Saved searches are a Plus member feature.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
            contentPadding = PaddingValues(vertical = SwaplSpacing.s3),
        ) {
            items(vm.items, key = { it.id }) { s ->
                SurfaceCard {
                    Text(s.name, style = MaterialTheme.typography.titleLarge)
                    Text(s.query, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
        vm.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
    }
}
