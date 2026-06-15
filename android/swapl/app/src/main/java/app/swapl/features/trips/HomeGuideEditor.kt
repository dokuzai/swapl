package app.swapl.features.trips

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.swapl.R
import app.swapl.core.model.HomeGuideUpdate
import app.swapl.core.repository.TripsRepository
import app.swapl.designtokens.SwaplSpacing
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

// "Guida di casa" editor for the owner's own listing (DOK-152). Loads the
// current guide, edits the field set in sections, and PUTs a partial upsert.
// The 8 core fields drive the completeness bar (matches the server's
// HOME_GUIDE_CORE_FIELDS); house rules / neighbourhood / emergency contact are
// nice-to-have extras outside the percentage.
class HomeGuideEditorState(
    private val listingId: String,
    private val repo: TripsRepository,
    private val scope: CoroutineScope,
) {
    var isLoading by mutableStateOf(false); private set
    var isSaving by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set

    var accessInstructions by mutableStateOf("")
    var keyPickup by mutableStateOf("")
    var wifiName by mutableStateOf("")
    var wifiPassword by mutableStateOf("")
    var heatingCooling by mutableStateOf("")
    var kitchen by mutableStateOf("")
    var bins by mutableStateOf("")
    var petsPlants by mutableStateOf("")
    var houseRules by mutableStateOf("")
    var neighbourhood by mutableStateOf("")
    var emergencyContact by mutableStateOf("")

    // 8 core fields → completeness, mirrors the server denominator.
    val completeness: Int
        get() {
            val core = listOf(
                accessInstructions, keyPickup, wifiName, wifiPassword,
                heatingCooling, kitchen, bins, petsPlants,
            )
            val filled = core.count { it.isNotBlank() }
            return (filled / 8.0 * 100).roundToInt()
        }

    fun load() {
        scope.launch {
            isLoading = true
            error = null
            runCatching { repo.homeGuide(listingId) }
                .onSuccess { resp ->
                    resp.guide?.let { g ->
                        accessInstructions = g.accessInstructions.orEmpty()
                        keyPickup = g.keyPickup.orEmpty()
                        wifiName = g.wifiName.orEmpty()
                        wifiPassword = g.wifiPassword.orEmpty()
                        heatingCooling = g.heatingCooling.orEmpty()
                        kitchen = g.kitchen.orEmpty()
                        bins = g.bins.orEmpty()
                        petsPlants = g.petsPlants.orEmpty()
                        houseRules = g.houseRules.orEmpty()
                        neighbourhood = g.neighbourhood.orEmpty()
                        emergencyContact = g.emergencyContact.orEmpty()
                    }
                }
                .onFailure { error = it.message ?: "Couldn't load your home guide" }
            isLoading = false
        }
    }

    // Send every field (empty string clears it server-side).
    fun save(onSaved: () -> Unit) {
        scope.launch {
            isSaving = true
            error = null
            val update = HomeGuideUpdate(
                accessInstructions = accessInstructions.trim(),
                keyPickup = keyPickup.trim(),
                wifiName = wifiName.trim(),
                wifiPassword = wifiPassword.trim(),
                heatingCooling = heatingCooling.trim(),
                kitchen = kitchen.trim(),
                bins = bins.trim(),
                petsPlants = petsPlants.trim(),
                houseRules = houseRules.trim(),
                neighbourhood = neighbourhood.trim(),
                emergencyContact = emergencyContact.trim(),
            )
            runCatching { repo.saveHomeGuide(listingId, update) }
                .onSuccess { onSaved() }
                .onFailure { error = it.message ?: "Couldn't save your home guide" }
            isSaving = false
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeGuideEditorScreen(
    state: HomeGuideEditorState,
    onClose: () -> Unit,
    onSaved: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.home_guide_title)) },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_close))
                    }
                },
                actions = {
                    if (state.isSaving) {
                        CircularProgressIndicator(
                            Modifier.padding(end = SwaplSpacing.s4).size(20.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        TextButton(onClick = { state.save(onSaved) }) { Text(stringResource(R.string.common_save)) }
                    }
                },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            Column(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(SwaplSpacing.s4),
                verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s5),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                    Text(
                        stringResource(R.string.home_guide_complete_pct, state.completeness),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Medium,
                    )
                    LinearProgressIndicator(
                        progress = { state.completeness / 100f },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Text(
                        stringResource(R.string.home_guide_intro),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                GuideSection(stringResource(R.string.home_guide_section_access)) {
                    GuideField(stringResource(R.string.home_guide_field_access), state.accessInstructions) { state.accessInstructions = it }
                    GuideField(stringResource(R.string.home_guide_field_key_pickup), state.keyPickup) { state.keyPickup = it }
                }
                GuideSection(stringResource(R.string.home_guide_section_wifi)) {
                    GuideField(stringResource(R.string.home_guide_field_wifi_name), state.wifiName) { state.wifiName = it }
                    GuideField(stringResource(R.string.home_guide_field_wifi_password), state.wifiPassword) { state.wifiPassword = it }
                }
                GuideSection(stringResource(R.string.home_guide_section_living)) {
                    GuideField(stringResource(R.string.home_guide_field_heating), state.heatingCooling) { state.heatingCooling = it }
                    GuideField(stringResource(R.string.home_guide_field_kitchen), state.kitchen) { state.kitchen = it }
                    GuideField(stringResource(R.string.home_guide_field_bins), state.bins) { state.bins = it }
                    GuideField(stringResource(R.string.home_guide_field_pets), state.petsPlants) { state.petsPlants = it }
                }
                GuideSection(stringResource(R.string.home_guide_section_good_to_know)) {
                    GuideField(stringResource(R.string.home_guide_field_house_rules), state.houseRules) { state.houseRules = it }
                    GuideField(stringResource(R.string.home_guide_field_neighbourhood), state.neighbourhood) { state.neighbourhood = it }
                    GuideField(stringResource(R.string.home_guide_field_emergency), state.emergencyContact) { state.emergencyContact = it }
                }

                state.error?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }

            if (state.isLoading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
        }
    }
}

@Composable
private fun GuideSection(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
        Text(
            title.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        content()
    }
}

@Composable
private fun GuideField(label: String, value: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        minLines = 1,
        maxLines = 5,
    )
}
