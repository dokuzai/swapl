package app.swapl.features.listings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.network.ApiClient
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.PrimaryPill
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@Serializable
data class ListingCreateBody(
    val title: String,
    val description: String,
    val propertyType: String,
    val city: String,
    val neighbourhood: String,
    val country: String,
    val sizeSqm: Int,
    val sleeps: Int,
    val bedrooms: Int,
    val bathrooms: Int,
    val petsAllowed: Boolean = false,
    val petTypes: List<String> = emptyList(),
    val wfhSetup: Boolean = false,
    val wfhDesks: Int = 0,
    val balcony: Boolean = false,
    val rooftop: Boolean = false,
    val garden: Boolean = false,
    val courtyard: Boolean = false,
    val pool: Boolean = false,
    val ac: Boolean = false,
    val washer: Boolean = false,
    val dryer: Boolean = false,
    val dishwasher: Boolean = false,
    val stepFreeAccess: Boolean = false,
    val hasElevator: Boolean = false,
    val hasParking: Boolean = false,
    val bikeIncluded: Boolean = false,
    val piano: Boolean = false,
    val gym: Boolean = false,
    val availableFrom: String,
    val availableTo: String,
    val minStayDays: Int = 3,
    val maxStayDays: Int = 30,
    val photos: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
)

@Serializable
private data class CreateResponse(val ok: Boolean, val id: String)

@HiltViewModel
class ListingCreateViewModel @Inject constructor(
    private val api: ApiClient,
) : ViewModel() {
    var title by mutableStateOf("")
    var city by mutableStateOf("")
    var neighbourhood by mutableStateOf("")
    var country by mutableStateOf("")
    var description by mutableStateOf("")
    var sizeSqm by mutableStateOf(60)
    var sleeps by mutableStateOf(2)
    var bedrooms by mutableStateOf(1)
    var bathrooms by mutableStateOf(1)
    var propertyType by mutableStateOf("APARTMENT")
    var petsAllowed by mutableStateOf(false)
    var wfhSetup by mutableStateOf(false)
    var stepFreeAccess by mutableStateOf(false)
    var balcony by mutableStateOf(false)
    var pool by mutableStateOf(false)
    var ac by mutableStateOf(false)
    var availableFromIso by mutableStateOf("")     // YYYY-MM-DD
    var availableToIso by mutableStateOf("")

    var step by mutableStateOf(0)
    var isSubmitting by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    var createdId by mutableStateOf<String?>(null); private set

    val stepCount = 4   // location / space / amenities / dates+description

    fun submit() = viewModelScope.launch {
        isSubmitting = true; error = null
        try {
            val body = ListingCreateBody(
                title = title,
                description = description,
                propertyType = propertyType,
                city = city,
                neighbourhood = neighbourhood,
                country = country,
                sizeSqm = sizeSqm,
                sleeps = sleeps,
                bedrooms = bedrooms,
                bathrooms = bathrooms,
                petsAllowed = petsAllowed,
                wfhSetup = wfhSetup,
                stepFreeAccess = stepFreeAccess,
                balcony = balcony,
                pool = pool,
                ac = ac,
                availableFrom = "${availableFromIso}T00:00:00.000Z",
                availableTo = "${availableToIso}T00:00:00.000Z",
            )
            val res: CreateResponse = api.client.post("${api.baseUrl}/api/listings") {
                contentType(ContentType.Application.Json)
                setBody(body)
            }.body()
            createdId = res.id
        } catch (t: Throwable) {
            error = t.message ?: "Submit failed"
        } finally {
            isSubmitting = false
        }
    }
}

@Composable
fun ListingCreateScreen(
    onDone: () -> Unit,
    vm: ListingCreateViewModel = hiltViewModel(),
) {
    if (vm.createdId != null) {
        onDone()
        return
    }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4)
    ) {
        KickerLabel("Step ${vm.step + 1} of ${vm.stepCount}")
        LinearProgressIndicator(
            progress = { (vm.step + 1f) / vm.stepCount.toFloat() },
            modifier = Modifier.fillMaxSize(0.999f).align(Alignment.Start),
        )

        when (vm.step) {
            0 -> {
                OutlinedTextField(vm.title, { vm.title = it }, label = { Text("Title") })
                OutlinedTextField(vm.city, { vm.city = it }, label = { Text("City") })
                OutlinedTextField(vm.neighbourhood, { vm.neighbourhood = it }, label = { Text("Neighbourhood") })
                OutlinedTextField(vm.country, { vm.country = it }, label = { Text("Country") })
            }
            1 -> {
                Text("Size: ${vm.sizeSqm} m²", style = MaterialTheme.typography.bodyMedium)
                NumberStepperRow("− size", "+ size",
                    onMinus = { vm.sizeSqm = (vm.sizeSqm - 5).coerceAtLeast(20) },
                    onPlus = { vm.sizeSqm = (vm.sizeSqm + 5).coerceAtMost(800) })
                Text("Sleeps: ${vm.sleeps}", style = MaterialTheme.typography.bodyMedium)
                NumberStepperRow("−", "+",
                    onMinus = { vm.sleeps = (vm.sleeps - 1).coerceAtLeast(1) },
                    onPlus = { vm.sleeps = (vm.sleeps + 1).coerceAtMost(20) })
            }
            2 -> {
                SwitchRow("Pets allowed", vm.petsAllowed) { vm.petsAllowed = it }
                SwitchRow("WFH setup", vm.wfhSetup) { vm.wfhSetup = it }
                SwitchRow("Step-free access", vm.stepFreeAccess) { vm.stepFreeAccess = it }
                SwitchRow("Balcony", vm.balcony) { vm.balcony = it }
                SwitchRow("Pool", vm.pool) { vm.pool = it }
                SwitchRow("AC", vm.ac) { vm.ac = it }
            }
            else -> {
                OutlinedTextField(vm.availableFromIso, { vm.availableFromIso = it }, label = { Text("Available from (YYYY-MM-DD)") }, singleLine = true)
                OutlinedTextField(vm.availableToIso, { vm.availableToIso = it }, label = { Text("Available to (YYYY-MM-DD)") }, singleLine = true)
                OutlinedTextField(vm.description, { vm.description = it }, label = { Text("Description (min 20 chars)") })
            }
        }

        vm.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
        if (vm.step < vm.stepCount - 1) {
            PrimaryPill("Next", onClick = { vm.step += 1 })
        } else {
            PrimaryPill(
                if (vm.isSubmitting) "Publishing…" else "Publish listing",
                onClick = { vm.submit() },
                enabled = !vm.isSubmitting
                    && vm.title.length >= 4
                    && vm.description.length >= 20
                    && vm.availableFromIso.length == 10
                    && vm.availableToIso.length == 10
            )
        }
        if (vm.step > 0) {
            TextButton(onClick = { vm.step -= 1 }) { Text("Back") }
        }
    }
}

@Composable
private fun SwitchRow(label: String, value: Boolean, onChange: (Boolean) -> Unit) {
    androidx.compose.foundation.layout.Row(
        modifier = Modifier.padding(vertical = 4.dp()),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = value, onCheckedChange = onChange)
    }
}

@Composable
private fun NumberStepperRow(minusLabel: String, plusLabel: String, onMinus: () -> Unit, onPlus: () -> Unit) {
    androidx.compose.foundation.layout.Row {
        TextButton(onClick = onMinus) { Text(minusLabel) }
        TextButton(onClick = onPlus) { Text(plusLabel) }
    }
}

private fun Int.dp() = androidx.compose.ui.unit.Dp(this.toFloat())
