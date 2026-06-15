package app.swapl.features.listings

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.OutlinedButton
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.RadioButton
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.R
import app.swapl.core.model.Listing
import app.swapl.core.model.ListingCreateBody
import app.swapl.core.repository.ListingRepository
import app.swapl.design.components.DateField
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.ListingPhoto
import app.swapl.design.components.PrimaryPill
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.ktor.client.plugins.ResponseException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.time.LocalDate
import java.util.Locale
import java.time.format.DateTimeFormatter
import javax.inject.Inject

// Hosting mode for the publish acknowledgment (DOK-162). The discriminator is
// NOT money — it is whether the host cedes enjoyment of the home to a third
// party. ENTIRE_HOME (host away) is a cession of enjoyment and surfaces the
// landlord-consent attestation a tenant needs; ROOM_OR_HOST_PRESENT is plain
// hospitality (a room, or the whole home with the host present) and needs no
// permission. `wire` matches the backend enum exactly.
enum class PublishAckMode(val wire: String) {
    ENTIRE_HOME("entire_home_while_away"),
    ROOM_OR_HOST_PRESENT("room_or_host_present"),
}

// Drives both the create wizard ("new" route) and the edit wizard
// ("edit/{listingId}" route — prefilled from GET, submitted via PUT).
@HiltViewModel
class ListingCreateViewModel @Inject constructor(
    private val repo: ListingRepository,
    @ApplicationContext private val appContext: Context,
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

    // Step 6: Photos — picked from the photo library, downscaled and uploaded
    // through /api/uploads/listing-photo (same pipeline as iOS).
    val photoUrls = mutableStateListOf<String>()
    var uploadsInFlight by mutableStateOf(0); private set
    var uploadError by mutableStateOf<String?>(null); private set

    fun addPhotos(uris: List<Uri>) {
        val room = MAX_PHOTOS - photoUrls.size - uploadsInFlight
        uris.take(room.coerceAtLeast(0)).forEach { uri ->
            viewModelScope.launch {
                uploadsInFlight += 1
                uploadError = null
                try {
                    val jpeg = withContext(Dispatchers.IO) { downscaleToJpeg(uri) }
                    if (jpeg == null) {
                        uploadError = "Couldn't read that image"
                    } else {
                        photoUrls.add(repo.uploadPhoto(jpeg))
                    }
                } catch (t: Throwable) {
                    uploadError = t.message ?: "Upload failed"
                } finally {
                    uploadsInFlight -= 1
                }
            }
        }
    }

    fun removePhoto(url: String) { photoUrls.remove(url) }

    // Mirrors the iOS uploader: longest edge ≤ 1600px, JPEG at 80%.
    private fun downscaleToJpeg(uri: Uri): ByteArray? {
        val resolver = appContext.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) } ?: return null
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_EDGE_PX) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        val decoded = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) } ?: return null

        val longest = maxOf(decoded.width, decoded.height)
        val bitmap = if (longest > MAX_EDGE_PX) {
            val scale = MAX_EDGE_PX.toFloat() / longest
            Bitmap.createScaledBitmap(decoded, (decoded.width * scale).toInt(), (decoded.height * scale).toInt(), true)
        } else decoded

        return ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 80, out)
            out.toByteArray()
        }
    }

    private companion object {
        const val MAX_PHOTOS = 10
        const val MAX_EDGE_PX = 1600
    }

    // Step 7: Description (title is on step 1)
    var description by mutableStateOf("")

    // Publish acknowledgment (DOK-162) — shown on the Review step before
    // create. The host picks the hosting mode (which selects the canonical
    // attestation text) and must check the box. This is a self-attestation we
    // send as ackAccepted + mode; it is NOT a proof-of-ownership gate. Only
    // required on create — edits skip it.
    //
    // "entire_home_while_away" | "room_or_host_present". Defaults to the entire
    // home variant, which surfaces the landlord-consent attestation a tenant
    // needs (the legally heavier path), so we never under-disclose by default.
    var publishMode by mutableStateOf(PublishAckMode.ENTIRE_HOME)
    var ackAccepted by mutableStateOf(false)

    // Location auto-fill (iOS parity): last known fix + reverse geocode.
    var isLocating by mutableStateOf(false); private set
    var locationError by mutableStateOf<String?>(null); private set

    fun autofillLocation() = viewModelScope.launch {
        isLocating = true; locationError = null
        try {
            val loc = withContext(Dispatchers.IO) { lastKnownLocation() }
            val addr = loc?.let {
                withContext(Dispatchers.IO) {
                    @Suppress("DEPRECATION")
                    Geocoder(appContext, Locale.getDefault())
                        .getFromLocation(it.latitude, it.longitude, 1)
                        ?.firstOrNull()
                }
            }
            if (addr == null) {
                locationError = "Couldn't determine your location — fill it in manually."
            } else {
                addr.locality?.let { city = it }
                addr.subLocality?.let { neighbourhood = it }
                addr.countryName?.let { country = it }
            }
        } catch (t: Throwable) {
            locationError = "Couldn't determine your location — fill it in manually."
        } finally {
            isLocating = false
        }
    }

    private fun lastKnownLocation(): Location? {
        val lm = appContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        return try {
            lm.getProviders(true).mapNotNull { p -> runCatching { lm.getLastKnownLocation(p) }.getOrNull() }
                .maxByOrNull { it.time }
        } catch (se: SecurityException) {
            null
        }
    }

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
        5 -> uploadsInFlight == 0
        6 -> description.length >= 20
        // Review step: on create the publish acknowledgment is mandatory and
        // blocks the Publish button until it's checked. Edits skip the ack.
        stepTitles.lastIndex -> isEditing || ackAccepted
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
                // Publish acknowledgment — create only. The backend rejects a
                // create without ackAccepted: true + a valid mode (400
                // PUBLISH_ACK_REQUIRED); the UI gate above makes that
                // unreachable, but we still send it so the server can log the
                // append-only attestation row. Edits omit it.
                ackAccepted = if (isEditing) null else true,
                mode = if (isEditing) null else publishMode.wire,
            )
            val res = editListingId?.let { repo.update(it, body) } ?: repo.create(body)
            createdId = res.id
        } catch (t: ResponseException) {
            // Defensive: if the ack didn't reach the server (e.g. an older
            // build), surface a clear, recoverable message instead of a raw
            // error and keep the host on the Review step.
            error = if (t.response.status.value == 400) {
                appContext.getString(R.string.publish_ack_required_error)
            } else {
                t.message ?: appContext.getString(R.string.publish_submit_failed)
            }
        } catch (t: Throwable) {
            error = t.message ?: appContext.getString(R.string.publish_submit_failed)
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
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) vm.autofillLocation()
    }
    OutlinedButton(
        onClick = { permission.launch(android.Manifest.permission.ACCESS_COARSE_LOCATION) },
        enabled = !vm.isLocating,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Icon(Icons.Default.MyLocation, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(SwaplSpacing.s2))
        Text(if (vm.isLocating) "Locating…" else "Use my current location")
    }
    vm.locationError?.let {
        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
    }
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
    val picker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(maxItems = 10),
    ) { uris -> if (uris.isNotEmpty()) vm.addPhotos(uris) }

    Text(
        "Add up to 10 photos of your home. We resize them before upload.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )

    OutlinedButton(
        onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
        enabled = vm.photoUrls.size + vm.uploadsInFlight < 10,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Icon(Icons.Default.AddAPhoto, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(SwaplSpacing.s2))
        Text("Choose photos")
    }

    if (vm.uploadsInFlight > 0) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            Text(
                "Uploading ${vm.uploadsInFlight} photo${if (vm.uploadsInFlight > 1) "s" else ""}…",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
    vm.uploadError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

    vm.photoUrls.forEach { url ->
        Box {
            ListingPhoto(photoUrl = url, palette = "warm", height = 160.dp)
            IconButton(
                onClick = { vm.removePhoto(url) },
                modifier = Modifier.align(Alignment.TopEnd),
            ) {
                Icon(Icons.Default.Close, contentDescription = "Remove photo", tint = MaterialTheme.colorScheme.onPrimary)
            }
        }
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

    // Publish acknowledgment (DOK-162) — create only. Edits already have an ack
    // on file and the body skips it server-side.
    if (!vm.isEditing) {
        Spacer(Modifier.height(SwaplSpacing.s2))
        HorizontalDivider()
        PublishAcknowledgment(vm)
    }
}

// Hosting-mode picker + the mandatory self-attestation checkbox. Picking a mode
// swaps in the canonical attestation text (entire home = landlord-consent
// variant; room/host-present = light hospitality variant). The box must be
// checked before Publish enables — enforced by canProceed on the Review step.
@Composable
private fun PublishAcknowledgment(vm: ListingCreateViewModel) {
    KickerLabel(stringResource(R.string.publish_ack_kicker))
    Text(
        stringResource(R.string.publish_ack_mode_question),
        style = MaterialTheme.typography.bodyMedium,
    )
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        ModeOption(
            selected = vm.publishMode == PublishAckMode.ENTIRE_HOME,
            title = stringResource(R.string.publish_ack_mode_entire_home),
            onSelect = { vm.publishMode = PublishAckMode.ENTIRE_HOME },
        )
        ModeOption(
            selected = vm.publishMode == PublishAckMode.ROOM_OR_HOST_PRESENT,
            title = stringResource(R.string.publish_ack_mode_room),
            onSelect = { vm.publishMode = PublishAckMode.ROOM_OR_HOST_PRESENT },
        )
    }

    // Two-part attestation: headline shown normally, fine print smaller/muted.
    val ackHeadline = stringResource(
        when (vm.publishMode) {
            PublishAckMode.ENTIRE_HOME -> R.string.publish_ack_text_entire_home_headline
            PublishAckMode.ROOM_OR_HOST_PRESENT -> R.string.publish_ack_text_room_headline
        },
    )
    val ackFineprint = stringResource(
        when (vm.publishMode) {
            PublishAckMode.ENTIRE_HOME -> R.string.publish_ack_text_entire_home_fineprint
            PublishAckMode.ROOM_OR_HOST_PRESENT -> R.string.publish_ack_text_room_fineprint
        },
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { vm.ackAccepted = !vm.ackAccepted },
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
    ) {
        Checkbox(checked = vm.ackAccepted, onCheckedChange = { vm.ackAccepted = it })
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(top = 12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(ackHeadline, style = MaterialTheme.typography.bodyMedium)
            Text(
                ackFineprint,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ModeOption(selected: Boolean, title: String, onSelect: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onSelect),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
    ) {
        RadioButton(selected = selected, onClick = onSelect)
        Text(title, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
    }
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
