package app.swapl.features.trips

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.ReportProblem
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.swapl.core.model.HomeGuideFields
import app.swapl.core.model.TripCheckEvent
import app.swapl.core.model.TripCockpit
import app.swapl.design.MonoFamily
import app.swapl.design.components.SurfaceCard
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import coil3.compose.SubcomposeAsyncImage

// The trip cockpit (DOK-152): shown inside TripDetailScreen once a swap has an
// agreement. Phase timeline + countdown + insurance badge; "Before you go"
// checklist; key codes + insurance; "Where you're staying" with the other
// home's address + guide gated by addressUnlocked; Check in / Check out with
// baseline photos; event log; "Report a problem".

private const val PHASE_INTERRUPTED = "INTERRUPTED"
private const val PHASE_COMPLETED = "COMPLETED"

@Composable
fun TripCockpit(
    cockpit: TripCockpit,
    otherName: String?,
    onFinishGuide: () -> Unit,
    onCheckIn: () -> Unit,
    onCheckOut: () -> Unit,
    onReportProblem: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s5),
    ) {
        PhaseTimeline(cockpit.phase)
        CountdownAndInsurance(cockpit)
        BeforeYouGo(cockpit, onFinishGuide)
        KeyAndInsuranceCard(cockpit)
        WhereYouStay(cockpit)
        CheckButtons(cockpit, onCheckIn, onCheckOut)
        if (cockpit.checkEvents.isNotEmpty()) EventLog(cockpit, otherName)
        TextButton(onClick = onReportProblem) {
            Icon(Icons.Outlined.ReportProblem, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(SwaplSpacing.s2))
            Text("Report a problem")
        }
    }
}

// --- Phase timeline -------------------------------------------------------

private val TIMELINE_STOPS = listOf(
    "AGREED" to "Agreed",
    "READY" to "Ready",
    "IN_PROGRESS" to "Staying",
    "COMPLETED" to "Done",
)

private fun timelineIndex(phase: String): Int = when (phase) {
    "AGREED", "PREPARING" -> 0
    "READY" -> 1
    "IN_PROGRESS" -> 2
    "COMPLETED" -> 3
    else -> -1
}

@Composable
private fun PhaseTimeline(phase: String) {
    if (phase == PHASE_INTERRUPTED) {
        Text(
            "This swap was cancelled",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Medium,
        )
        return
    }
    val current = timelineIndex(phase)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        TIMELINE_STOPS.forEachIndexed { index, (_, label) ->
            val done = index <= current
            val color = if (done) MaterialTheme.colorScheme.primary
            else MaterialTheme.colorScheme.outline
            Column(
                Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (index == current) {
                        Box(
                            Modifier
                                .size(22.dp)
                                .clip(CircleShape)
                                .background(color.copy(alpha = 0.18f)),
                        )
                    }
                    Box(Modifier.size(14.dp).clip(CircleShape).background(color))
                }
                Text(
                    label,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = if (done) FontWeight.Medium else FontWeight.Normal,
                    color = if (done) MaterialTheme.colorScheme.onSurface
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// --- Countdown + insurance badge -----------------------------------------

@Composable
private fun CountdownAndInsurance(cockpit: TripCockpit) {
    val active = cockpit.phase != PHASE_COMPLETED && cockpit.phase != PHASE_INTERRUPTED
    val showCountdown = active && (cockpit.countdown.days > 0 || cockpit.countdown.hours > 0)
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                if (showCountdown) "Starts in" else "Status",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                if (showCountdown) countdownText(cockpit.countdown) else phaseLabel(cockpit.phase),
                style = MaterialTheme.typography.titleLarge,
            )
        }
        if (cockpit.insurance != null) {
            Row(
                Modifier
                    .background(MaterialTheme.colorScheme.surfaceVariant, CircleShape)
                    .padding(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s2),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s1),
            ) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = Modifier.size(16.dp))
                Text("Insured", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Medium)
            }
        }
    }
}

private fun countdownText(c: app.swapl.core.model.TripCountdown): String =
    if (c.days > 0) "${c.days}d ${c.hours}h" else "${c.hours}h"

private fun phaseLabel(phase: String): String = when (phase) {
    "AGREED" -> "Swap agreed"
    "PREPARING" -> "Preparing"
    "READY" -> "Ready to go"
    "IN_PROGRESS" -> "In progress"
    "COMPLETED" -> "Completed"
    "INTERRUPTED" -> "Cancelled"
    else -> "Preparing"
}

// --- Before you go checklist ---------------------------------------------

@Composable
private fun BeforeYouGo(cockpit: TripCockpit, onFinishGuide: () -> Unit) {
    val items = listOf(
        cockpit.checklist.guideFilled to "Complete your home guide",
        cockpit.checklist.detailsRead to "Read your host's home details",
        cockpit.checklist.checkedIn to "Check in when you arrive",
        cockpit.checklist.checkedOut to "Check out when you leave",
    )
    SurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            Text("Before you go", style = MaterialTheme.typography.titleLarge)
            items.forEach { (done, label) ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                    Icon(
                        if (done) Icons.Filled.CheckCircle else Icons.Outlined.Circle,
                        contentDescription = null,
                        tint = if (done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp),
                    )
                    Text(
                        label,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                        textDecoration = if (done) TextDecoration.LineThrough else TextDecoration.None,
                    )
                }
            }
            if (cockpit.myGuideCompleteness < 100) {
                TextButton(onClick = onFinishGuide, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                    Text("Finish your home guide (${cockpit.myGuideCompleteness}%)")
                }
            }
        }
    }
}

// --- Key codes + insurance details ---------------------------------------

@Composable
private fun KeyAndInsuranceCard(cockpit: TripCockpit) {
    SurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4)) {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
                Text(
                    "YOUR KEY CODE",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    cockpit.keyCodes.mine ?: "—",
                    fontFamily = MonoFamily,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Medium,
                    letterSpacing = 3.sp,
                )
                Text(
                    "Keys for keys — share this with your guest so they can get in.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            cockpit.insurance?.let { insurance ->
                HorizontalDivider()
                Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                        Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                        Text("Swap protection", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
                    }
                    Text(
                        "Policy ${insurance.policyNumber} · cover €${insurance.coverageAmount}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

// --- Where you're staying (gated) ----------------------------------------

@Composable
private fun WhereYouStay(cockpit: TripCockpit) {
    SurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            Text("Where you're staying", style = MaterialTheme.typography.titleLarge)
            if (cockpit.addressUnlocked) {
                cockpit.otherAddress?.takeIf { it.isNotBlank() }?.let { address ->
                    Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                        Icon(Icons.Filled.Place, contentDescription = null, modifier = Modifier.size(20.dp))
                        Text(address, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                    }
                }
                val fields = cockpit.otherGuide?.fields
                if (fields != null) {
                    HomeGuideAccordion(fields)
                } else {
                    Text(
                        "Your host hasn't filled in their home guide yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                LockedAddress(cockpit)
            }
        }
    }
}

@Composable
private fun LockedAddress(cockpit: TripCockpit) {
    Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
        Icon(
            Icons.Filled.Lock,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(20.dp),
        )
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
            Text(
                cockpit.otherCity?.let { "The exact address in $it unlocks soon" }
                    ?: "The exact address unlocks soon",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            val unlocksAt = cockpit.otherGuide?.unlocksAt
            Text(
                if (unlocksAt != null) "Unlocks ${unlocksAt.take(10)} — 48h before your stay."
                else "The address and home guide unlock 48h before your stay.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun HomeGuideAccordion(fields: HomeGuideFields) {
    val rows = remember(fields) { guideRows(fields) }
    if (rows.isEmpty()) {
        Text(
            "Your host hasn't filled in their home guide yet.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    var expanded by remember { mutableStateOf(false) }
    Column {
        Row(
            Modifier.fillMaxWidth().clickable { expanded = !expanded }.padding(vertical = SwaplSpacing.s1),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Home guide", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
            Icon(
                if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                contentDescription = if (expanded) "Collapse" else "Expand",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        AnimatedVisibility(visible = expanded) {
            Column(
                Modifier.padding(top = SwaplSpacing.s3),
                verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
            ) {
                rows.forEach { (label, value) ->
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            label.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(value, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}

private fun guideRows(f: HomeGuideFields): List<Pair<String, String>> = buildList {
    fun add(label: String, value: String?) {
        if (!value.isNullOrBlank()) add(label to value.trim())
    }
    add("Getting in", f.accessInstructions)
    add("Keys", f.keyPickup)
    add("Wi-Fi network", f.wifiName)
    add("Wi-Fi password", f.wifiPassword)
    add("Heating & cooling", f.heatingCooling)
    add("Kitchen", f.kitchen)
    add("Bins & recycling", f.bins)
    add("Pets & plants", f.petsPlants)
    add("House rules", f.houseRules)
    add("Neighbourhood", f.neighbourhood)
    add("Emergency contact", f.emergencyContact)
}

// --- Check in / out buttons ----------------------------------------------

@Composable
private fun CheckButtons(cockpit: TripCockpit, onCheckIn: () -> Unit, onCheckOut: () -> Unit) {
    if (cockpit.phase == PHASE_INTERRUPTED) return
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
        when {
            !cockpit.checklist.checkedIn ->
                app.swapl.design.components.PrimaryPill(text = "Check in", onClick = onCheckIn)
            !cockpit.checklist.checkedOut ->
                app.swapl.design.components.PrimaryPill(text = "Check out", onClick = onCheckOut)
            else -> Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(SwaplSpacing.s2))
                Text(
                    "Checked in and out — thanks!",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

// --- Event log ------------------------------------------------------------

@Composable
private fun EventLog(cockpit: TripCockpit, otherName: String?) {
    SurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4)) {
            Text("Trip activity", style = MaterialTheme.typography.titleLarge)
            cockpit.checkEvents.sortedByDescending { it.createdAt }.forEach { event ->
                EventRow(event, otherName)
            }
        }
    }
}

@Composable
private fun EventRow(event: TripCheckEvent, otherName: String?) {
    val who = if (event.mine) "You" else (otherName ?: "Your swap partner")
    val title = if (event.type == "checkin") "$who checked in" else "$who checked out"
    Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
        Box(
            Modifier.size(38.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (event.type == "checkin") Icons.Filled.CheckCircle else Icons.Filled.Place,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium)
            Text(
                event.createdAt.take(10),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            event.note?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (event.photos.isNotEmpty()) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                    items(event.photos, key = { it }) { url ->
                        SubcomposeAsyncImage(
                            model = url,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.size(64.dp).clip(RoundedCornerShape(SwaplRadius.sm)),
                            loading = {},
                            error = {},
                        )
                    }
                }
            }
        }
    }
}
