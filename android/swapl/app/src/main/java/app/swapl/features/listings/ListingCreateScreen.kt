package app.swapl.features.listings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.Listing
import app.swapl.core.model.ListingCreateBody
import app.swapl.core.repository.ListingRepository
import app.swapl.design.components.DateField
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.PrimaryPill
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject

// Drives both the create wizard ("new" route) and the edit wizard
// ("edit/{listingId}" route — prefilled from GET, submitted via PUT).
@HiltViewModel
class ListingCreateViewModel @Inject constructor(
    private val repo: ListingRepository,
    savedState: SavedStateHandle,
) : ViewModel() {

    private val editListingId: String? = savedState["listingId"]
    val isEditing: Boolean get() = editListingId != null

    // Step 1: Location
    var title by mutableStateOf("")
    var city by mutableStateOf("")
    var neighbourhood by mutableStateOf("")
    var country by mutableStateOf("")
    var address by mutableStateOf("")

    // Step 2: Space
    var propertyType by mutableStateOf("APARTMENT")
    var sizeSqm by mutableStateOf(60)
    var bedrooms by mutableStateOf(1)
    var bathrooms by mutableStateOf(1)
    var sleeps by mutableStateOf(2)
    var floor by mutableStateOf(1)

    // Step 3: Access & pets
    var hasElevator by mutableStateOf(false)
    var stepFreeAccess by mutableStateOf(false)
    var petsAllowed by mutableStateOf(false)

    // Step 4: Amenities
    var wfhSetup by mutableStateOf(false)
    var wfhDesks by mutableStateOf(0)
    var hasParking by mutableStateOf(false)
    var bikeIncluded by mutableStateOf(false)
    var balcony by mutableStateOf(false)
    var rooftop by mutableStateOf(false)
    var garden by mutableStateOf(false)
    var courtyard by mutableStateOf(false)
    var piano by mutableStateOf(false)
    var pool by mutableStateOf(false)
    var gym by mutableStateOf(false)
    var ac by mutableStateOf(false)
    var dishwasher by mutableStateOf(false)
    var washer by mutableStateOf(false)
    var dryer by mutableStateOf(false)

    // Step 5: Dates — default 60-90 days out, matching iOS.
    var availableFrom by mutableStateOf(LocalDate.now().plusDays(60).format(DateTimeFormatter.ISO_LOCAL_DATE))
    var availableTo by mutableStateOf(LocalDate.now().plusDays(90).format(DateTimeFormatter.ISO_LOCAL_DATE))
    var minStayDays by mutableStateOf(3)
    var maxStayDays by mutableStateOf(30)

    // Step 6: Photos (URLs — full upload pipeline lands when R2 sign endpoint ships)
    val photoUrls = mutableStateListOf<String>()

    // Step 7: Description (title is on step 1)
    var description by mutableStateOf("")

    // Set on the server, not editable in the wizard — carried through on update
    // so a PUT doesn't wipe them.
    private var petTypes: List<String> = emptyList()
    private var tags: List<String> = emptyList()

    // Wizard state
    var step by mutableStateOf(0)
    var isLoading by mutableStateOf(false); private set
    var isSubmitting by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    var createdId by mutableStateOf<String?>(null); private set

    init {
        editListingId?.let { id ->
            viewModelScope.launch {
                isLoading = true
                try {
                    prefill(repo.detail(id).listing)
                } catch (t: Throwable) {
                    error = t.message ?: "Could not load listing"
                } finally {
                    isLoading = false
                }
            }
        }
    }

    // Maps a fetched listing onto the wizard draft. Dates arrive as ISO
    // datetimes ("2026-08-01T00:00:00.000Z") and the steps work in YYYY-MM-DD.
    private fun prefill(l: Listing) {
        title = l.title
        city = l.city
        neighbourhood = l.neighbourhood
        country = l.country
        address = l.address.orEmpty()
        propertyType = l.propertyType
        sizeSqm = l.sizeSqm
        bedrooms = l.bedrooms
        bathrooms = l.bathrooms
        sleeps = l.sleeps
        floor = l.floor ?: 1
        hasElevator = l.hasElevator
        stepFreeAccess = l.stepFreeAccess
        petsAllowed = l.petsAllowed
        wfhSetup = l.wfhSetup
        wfhDesks = l.wfhDesks
        hasParking = l.hasParking
        bikeIncluded = l.bikeIncluded
        balcony = l.balcony
        rooftop = l.rooftop
        garden = l.garden
        courtyard = l.courtyard
        piano = l.piano
        pool = l.pool
        gym = l.gym
        ac = l.ac
        dishwasher = l.dishwasher
        washer = l.washer
        dryer = l.dryer
        availableFrom = l.availableFrom.take(10)
        availableTo = l.availableTo.take(10)
        minStayDays = l.minStayDays
        maxStayDays = l.maxStayDays
        photoUrls.clear()
        photoUrls.addAll(l.photos)
        description = l.description
        petTypes = l.petTypes
        tags = l.tags
    }

    val stepTitles = listOf(
        "Location",
        "Space",
        "Access & pets",
        "Amenities",
        "Dates",
        "Photos",
        "Description",
        "Review",
    )

    fun canProceed(): Boolean = when (step) {
        0 -> city.length >= 2 && neighbourhood.length >= 2 && country.length >= 2 && title.length >= 4
        1 -> sizeSqm >= 20 && sleeps >= 1
        4 -> availableTo > availableFrom
        6 -> description.length >= 20
        else -> true
    }

    fun next() { if (step < stepTitles.size - 1) step += 1 }
    fun prev() { if (step > 0) step -= 1 }

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
                address = address.ifEmpty { null },
                sizeSqm = sizeSqm,
                sleeps = sleeps,
                bedrooms = bedrooms,
                bathrooms = bathrooms,
                floor = floor,
                hasElevator = hasElevator,
                stepFreeAccess = stepFreeAccess,
                petsAllowed = petsAllowed,
                petTypes = petTypes,
                wfhSetup = wfhSetup,
                wfhDesks = wfhDesks,
                hasParking = hasParking,
                bikeIncluded = bikeIncluded,
                rooftop = rooftop,
                balcony = balcony,
                garden = garden,
                courtyard = courtyard,
                piano = piano,
                pool = pool,
                gym = gym,
                ac = ac,
                dishwasher = dishwasher,
                washer = washer,
                dryer = dryer,
                availableFrom = "${availableFrom}T00:00:00.000Z",
                availableTo = "${availableTo}T00:00:00.000Z",
                minStayDays = minStayDays,
                maxStayDays = maxStayDays,
                photos = photoUrls.toList(),
                tags = tags,
            )
            val res = editListingId?.let { repo.update(it, body) } ?: repo.create(body)
            createdId = res.id
        } catch (t: Throwable) {
            error = t.message ?: "Submit failed"
        } finally {
            isSubmitting = false
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListingCreateScreen(
    onDone: () -> Unit,
    vm: ListingCreateViewModel = hiltViewModel(),
) {
    if (vm.createdId != null) { onDone(); return }

    if (vm.isLoading) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        return
    }

    Column(Modifier.fillMaxSize()) {
        // Progress header
        Column(
            Modifier.padding(horizontal = SwaplSpacing.s5, vertical = SwaplSpacing.s3),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)
        ) {
            LinearProgressIndicator(
                progress = { (vm.step + 1f) / vm.stepTitles.size.toFloat() },
                modifier = Modifier.fillMaxWidth(),
            )
            KickerLabel(
                if (vm.isEditing) "Edit your home — step ${vm.step + 1} of ${vm.stepTitles.size}"
                else "Step ${vm.step + 1} of ${vm.stepTitles.size}"
            )
            Text(vm.stepTitles[vm.step], style = MaterialTheme.typography.displaySmall)
        }

        Column(
            Modifier
                .weight(1f)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = SwaplSpacing.s5),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
        ) {
            when (vm.step) {
                0 -> LocationStep(vm)
                1 -> SpaceStep(vm)
                2 -> AccessStep(vm)
                3 -> AmenitiesStep(vm)
                4 -> DatesStep(vm)
                5 -> PhotosStep(vm)
                6 -> DescriptionStep(vm)
                else -> ReviewStep(vm)
            }
            vm.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Spacer(Modifier.height(SwaplSpacing.s2))
        }

        // Footer
        Row(
            Modifier
                .fillMaxWidth()
                .padding(SwaplSpacing.s4),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            if (vm.step > 0) {
                TextButton(onClick = { vm.prev() }) { Text("Back") }
            } else {
                Spacer(Modifier)
            }
            if (vm.step < vm.stepTitles.size - 1) {
                TextButton(onClick = { vm.next() }, enabled = vm.canProceed()) { Text("Next") }
            } else {
                PrimaryPill(
                    text = when {
                        vm.isSubmitting && vm.isEditing -> "Saving…"
                        vm.isSubmitting -> "Publishing…"
                        vm.isEditing -> "Save changes"
                        else -> "Publish listing"
                    },
                    onClick = { vm.submit() },
                    enabled = !vm.isSubmitting && vm.canProceed(),
                    modifier = Modifier.fillMaxWidth(0.6f),
                )
            }
        }
    }
}

@Composable
private fun LocationStep(vm: ListingCreateViewModel) {
    OutlinedTextField(vm.title, { vm.title = it }, label = { Text("Title (e.g. Sunlit canal apartment)") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(vm.city, { vm.city = it }, label = { Text("City") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(vm.neighbourhood, { vm.neighbourhood = it }, label = { Text("Neighbourhood") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(vm.country, { vm.country = it }, label = { Text("Country") }, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(vm.address, { vm.address = it }, label = { Text("Address (optional)") }, modifier = Modifier.fillMaxWidth())
}

@Composable
private fun SpaceStep(vm: ListingCreateViewModel) {
    KickerLabel("Property type")
    Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        listOf("APARTMENT", "HOUSE", "LOFT", "TOWNHOUSE").forEach { t ->
            FilterChip(
                selected = vm.propertyType == t,
                onClick = { vm.propertyType = t },
                label = { Text(t.lowercase().replaceFirstChar { it.uppercase() }) },
            )
        }
    }
    Stepper("Size: ${vm.sizeSqm} m²", { vm.sizeSqm = (vm.sizeSqm - 5).coerceAtLeast(20) }, { vm.sizeSqm = (vm.sizeSqm + 5).coerceAtMost(800) })
    Stepper("Sleeps: ${vm.sleeps}", { vm.sleeps = (vm.sleeps - 1).coerceAtLeast(1) }, { vm.sleeps = (vm.sleeps + 1).coerceAtMost(20) })
    Stepper("Bedrooms: ${vm.bedrooms}", { vm.bedrooms = (vm.bedrooms - 1).coerceAtLeast(0) }, { vm.bedrooms = (vm.bedrooms + 1).coerceAtMost(15) })
    Stepper("Bathrooms: ${vm.bathrooms}", { vm.bathrooms = (vm.bathrooms - 1).coerceAtLeast(0) }, { vm.bathrooms = (vm.bathrooms + 1).coerceAtMost(10) })
    Stepper("Floor: ${vm.floor}", { vm.floor = (vm.floor - 1).coerceAtLeast(-2) }, { vm.floor = (vm.floor + 1).coerceAtMost(60) })
}

@Composable
private fun AccessStep(vm: ListingCreateViewModel) {
    SwitchRow("Has elevator", vm.hasElevator) { vm.hasElevator = it }
    SwitchRow("Step-free access", vm.stepFreeAccess) { vm.stepFreeAccess = it }
    SwitchRow("Pets allowed", vm.petsAllowed) { vm.petsAllowed = it }
}

@Composable
private fun AmenitiesStep(vm: ListingCreateViewModel) {
    SwitchRow("WFH setup", vm.wfhSetup) { vm.wfhSetup = it }
    if (vm.wfhSetup) {
        Stepper("Desks: ${vm.wfhDesks}", { vm.wfhDesks = (vm.wfhDesks - 1).coerceAtLeast(0) }, { vm.wfhDesks = (vm.wfhDesks + 1).coerceAtMost(10) })
    }
    SwitchRow("Parking", vm.hasParking) { vm.hasParking = it }
    SwitchRow("Bike included", vm.bikeIncluded) { vm.bikeIncluded = it }
    SwitchRow("Balcony", vm.balcony) { vm.balcony = it }
    SwitchRow("Rooftop", vm.rooftop) { vm.rooftop = it }
    SwitchRow("Garden", vm.garden) { vm.garden = it }
    SwitchRow("Courtyard", vm.courtyard) { vm.courtyard = it }
    SwitchRow("Piano", vm.piano) { vm.piano = it }
    SwitchRow("Pool", vm.pool) { vm.pool = it }
    SwitchRow("Gym", vm.gym) { vm.gym = it }
    SwitchRow("AC", vm.ac) { vm.ac = it }
    SwitchRow("Dishwasher", vm.dishwasher) { vm.dishwasher = it }
    SwitchRow("Washer", vm.washer) { vm.washer = it }
    SwitchRow("Dryer", vm.dryer) { vm.dryer = it }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DatesStep(vm: ListingCreateViewModel) {
    DateField("Available from", vm.availableFrom, { vm.availableFrom = it }, modifier = Modifier.fillMaxWidth())
    DateField("Available to", vm.availableTo, { vm.availableTo = it }, modifier = Modifier.fillMaxWidth())
    Stepper("Min stay: ${vm.minStayDays} days", { vm.minStayDays = (vm.minStayDays - 1).coerceAtLeast(1) }, { vm.minStayDays = (vm.minStayDays + 1).coerceAtMost(180) })
    Stepper("Max stay: ${vm.maxStayDays} days", { vm.maxStayDays = (vm.maxStayDays - 1).coerceAtLeast(1) }, { vm.maxStayDays = (vm.maxStayDays + 1).coerceAtMost(365) })
}

@Composable
private fun PhotosStep(vm: ListingCreateViewModel) {
    Text(
        "Paste image URLs (one per line). Native upload via the R2 signed-PUT endpoint lands in the upload-pipeline slice.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    val slots = (0..vm.photoUrls.size).toList()
    slots.forEach { idx ->
        OutlinedTextField(
            value = vm.photoUrls.getOrNull(idx) ?: "",
            onValueChange = { v ->
                if (idx < vm.photoUrls.size) {
                    if (v.isEmpty()) vm.photoUrls.removeAt(idx) else vm.photoUrls[idx] = v
                } else if (v.isNotEmpty()) {
                    vm.photoUrls.add(v)
                }
            },
            label = { Text("https://…") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun DescriptionStep(vm: ListingCreateViewModel) {
    OutlinedTextField(
        value = vm.description,
        onValueChange = { vm.description = it },
        label = { Text("Describe your home (min 20 chars)") },
        modifier = Modifier.fillMaxWidth(),
        minLines = 6,
    )
    Text(
        "${vm.description.length} characters",
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun ReviewStep(vm: ListingCreateViewModel) {
    Text("${vm.title} — ${vm.city}", style = MaterialTheme.typography.titleLarge)
    Text("${vm.sizeSqm} m² · sleeps ${vm.sleeps} · ${vm.bedrooms} br / ${vm.bathrooms} ba", style = MaterialTheme.typography.bodyMedium)
    Text(vm.description, style = MaterialTheme.typography.bodyMedium)
    Text("Available ${vm.availableFrom} → ${vm.availableTo}", style = MaterialTheme.typography.labelMedium)
}

@Composable
private fun SwitchRow(label: String, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = value, onCheckedChange = onChange)
    }
}

@Composable
private fun Stepper(label: String, onMinus: () -> Unit, onPlus: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, modifier = Modifier.weight(1f))
        IconButton(onClick = onMinus, modifier = Modifier.size(36.dp)) { Icon(Icons.Default.Remove, contentDescription = "decrease") }
        IconButton(onClick = onPlus, modifier = Modifier.size(36.dp)) { Icon(Icons.Default.Add, contentDescription = "increase") }
    }
}
