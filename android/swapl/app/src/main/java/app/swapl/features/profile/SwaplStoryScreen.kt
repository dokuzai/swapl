package app.swapl.features.profile

import android.content.Intent
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.R
import app.swapl.core.model.StoryCounts
import app.swapl.core.model.StoryEvent
import app.swapl.core.model.SwaplStory
import app.swapl.core.repository.StoryRepository
import app.swapl.design.MonoFamily
import app.swapl.design.components.CityStamp
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.SurfaceCard
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplRadius
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

// "Your Swapl story" (DOK-158). Reached from Account → Profile. A postcard
// timeline of every trip the member has taken and every guest they've welcomed —
// drawn in the same passport-stamp language as the public profile's "Where I've
// been" strip (CityStamp) — topped with headline counts and a one-tap native
// share that carries the member's referral link (?ref=CODE) so the story itself
// feeds the viral loop. All aggregation lives server-side (GET /api/me/story);
// the client only renders what it's handed.

@HiltViewModel
class SwaplStoryViewModel @Inject constructor(private val repo: StoryRepository) : ViewModel() {
    var story by mutableStateOf<SwaplStory?>(null)
        private set
    var isRefreshing by mutableStateOf(false)
        private set
    var error by mutableStateOf<String?>(null)
        private set

    fun load() = viewModelScope.launch {
        error = null
        runCatching { story = repo.story() }.onFailure { if (story == null) error = it.message }
    }

    fun refresh() = viewModelScope.launch {
        isRefreshing = true
        runCatching { story = repo.story() }.onFailure { if (story == null) error = it.message }
        isRefreshing = false
    }
}

// Universal-link origin for shareable referral links — same origin Invite & earn
// uses (app.swapl.fun). The server's referralUrl can point at localhost in dev,
// so we rebuild from the code for a link that always works off-device.
private const val SHARE_ORIGIN = "https://app.swapl.fun"

private fun shareLink(story: SwaplStory): String = "$SHARE_ORIGIN/?ref=${story.share.referralCode}"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SwaplStoryScreen(vm: SwaplStoryViewModel = hiltViewModel()) {
    LaunchedEffect(Unit) { vm.load() }
    val context = LocalContext.current

    fun share(story: SwaplStory) {
        val link = shareLink(story)
        val message = context.getString(R.string.story_share_message, story.counts.cities, link)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.story_share_subject))
            putExtra(Intent.EXTRA_TEXT, message)
        }
        context.startActivity(Intent.createChooser(intent, context.getString(R.string.story_share_chooser)))
    }

    Column(Modifier.fillMaxSize()) {
        Text(
            stringResource(R.string.story_title),
            style = MaterialTheme.typography.displaySmall,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = SwaplSpacing.s4, vertical = SwaplSpacing.s3),
        )

        PullToRefreshBox(
            isRefreshing = vm.isRefreshing,
            onRefresh = { vm.refresh() },
            modifier = Modifier.fillMaxSize(),
        ) {
            val story = vm.story
            when {
                vm.error != null && story == null -> ErrorState(onRetry = { vm.load() })
                story == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                story.isEmpty -> EmptyStory(story, onShare = { share(story) })
                else -> StoryContent(story, onShare = { share(story) })
            }
        }
    }
}

@Composable
private fun StoryContent(story: SwaplStory, onShare: () -> Unit) {
    // Preserve the server's order; group consecutively by year so the most
    // recent year leads. (Events already arrive sorted dateTo-desc.)
    val groups = groupByYear(story.timeline)
    LazyColumn(
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            horizontal = SwaplSpacing.s4,
            vertical = SwaplSpacing.s3,
        ),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
        modifier = Modifier.fillMaxSize(),
    ) {
        item(key = "counts") { CountsStrip(story.counts) }
        item(key = "share") { ShareCard(story, onShare) }
        item(key = "passport") { KickerLabel(stringResource(R.string.story_passport)) }
        groups.forEach { group ->
            item(key = "year-${group.year}") {
                Text(
                    group.year.toString(),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            group.events.forEachIndexed { index, event ->
                item(key = "event-${group.year}-$index") {
                    StoryStampRow(event, tilt = if (index % 2 == 0) -1.5f else 1.5f)
                }
            }
        }
    }
}

private data class YearGroup(val year: Int, val events: List<StoryEvent>)

private fun groupByYear(events: List<StoryEvent>): List<YearGroup> {
    val order = mutableListOf<Int>()
    val buckets = linkedMapOf<Int, MutableList<StoryEvent>>()
    for (e in events) {
        if (buckets[e.year] == null) { order.add(e.year); buckets[e.year] = mutableListOf() }
        buckets[e.year]!!.add(e)
    }
    return order.map { YearGroup(it, buckets[it] ?: emptyList()) }
}

// MARK: Counts

@Composable
private fun CountsStrip(counts: StoryCounts) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(SwaplColors.Navy, RoundedCornerShape(SwaplRadius.xl))
            .padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
    ) {
        Text(
            stringResource(R.string.story_counts_heading),
            style = MaterialTheme.typography.titleLarge,
            color = Color.White,
            fontWeight = FontWeight.SemiBold,
        )
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            CountCell(
                counts.trips,
                pluralStringResource(R.plurals.story_count_trips, counts.trips),
                Modifier.weight(1f),
            )
            CountDivider()
            CountCell(
                counts.hostings,
                pluralStringResource(R.plurals.story_count_guests, counts.hostings),
                Modifier.weight(1f),
            )
            CountDivider()
            CountCell(
                counts.cities,
                pluralStringResource(R.plurals.story_count_cities, counts.cities),
                Modifier.weight(1f),
            )
            CountDivider()
            CountCell(
                counts.countries,
                pluralStringResource(R.plurals.story_count_countries, counts.countries),
                Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun CountCell(value: Int, label: String, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            value.toString(),
            fontSize = 30.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
            maxLines = 1,
        )
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = Color.White.copy(alpha = 0.8f),
            maxLines = 2,
        )
    }
}

@Composable
private fun CountDivider() {
    Box(
        Modifier
            .width(1.dp)
            .height(40.dp)
            .background(Color.White.copy(alpha = 0.2f)),
    )
}

// MARK: Share

@Composable
private fun ShareCard(story: SwaplStory, onShare: () -> Unit) {
    SurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            Text(
                stringResource(R.string.story_share_heading),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    // Readable link (no scheme) — the share sheet sends the full
                    // ?ref=CODE URL so every share recruits.
                    shareLink(story).removePrefix("https://"),
                    fontFamily = MonoFamily,
                    fontWeight = FontWeight.Bold,
                    color = SwaplColors.Pink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Button(
                    onClick = onShare,
                    colors = ButtonDefaults.buttonColors(containerColor = SwaplColors.Pink),
                ) {
                    Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(SwaplSpacing.s1))
                    Text(stringResource(R.string.story_share_button))
                }
            }
            Text(
                stringResource(R.string.story_share_note),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// MARK: Stamp row

// One timeline entry rendered as a postcard: a kind badge (trip / hosting), the
// stamped city, and the dates + counterpart. Reuses CityStamp (DOK-147).
@Composable
private fun StoryStampRow(event: StoryEvent, tilt: Float) {
    SurfaceCard {
        Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
            CityStamp(city = event.city, country = event.country, year = event.year, tilt = tilt)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s1)) {
                KindBadge(event.isTrip)
                Text(
                    "${event.dateFrom.take(10)} → ${event.dateTo.take(10)}",
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                DetailLine(event)?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                    )
                }
            }
        }
    }
}

@Composable
private fun KindBadge(isTrip: Boolean) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier
            .background(
                if (isTrip) SwaplColors.Pink else SwaplColors.Cream2,
                RoundedCornerShape(50),
            )
            .padding(horizontal = 9.dp, vertical = 4.dp),
    ) {
        Icon(
            if (isTrip) Icons.Default.Flight else Icons.Default.Home,
            contentDescription = null,
            tint = if (isTrip) Color.White else SwaplColors.Navy,
            modifier = Modifier.size(13.dp),
        )
        Text(
            stringResource(if (isTrip) R.string.story_kind_trip else R.string.story_kind_hosted).uppercase(),
            fontFamily = MonoFamily,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp,
            color = if (isTrip) Color.White else SwaplColors.Navy,
        )
    }
}

// Trip → who hosted you; hosting → who you welcomed. Falls back to the listing
// title, then a neutral line, so a missing counterpart never blanks.
@Composable
private fun DetailLine(event: StoryEvent): String? {
    val name = event.counterpartName?.takeIf { it.isNotBlank() }
    if (name != null) {
        return stringResource(
            if (event.isTrip) R.string.story_detail_hosted_by else R.string.story_detail_welcomed,
            name,
        )
    }
    event.listingTitle?.takeIf { it.isNotBlank() }?.let { return it }
    return stringResource(if (event.isTrip) R.string.story_detail_stay else R.string.story_detail_guest)
}

// MARK: Empty / Error

@Composable
private fun EmptyStory(story: SwaplStory, onShare: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            stringResource(R.string.story_empty_title),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            stringResource(R.string.story_empty_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Spacer(Modifier.height(SwaplSpacing.s5))
        // Even with no story yet, the member can recruit — sharing the link is
        // how the journey begins.
        Button(
            onClick = onShare,
            colors = ButtonDefaults.buttonColors(containerColor = SwaplColors.Pink),
        ) {
            Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(SwaplSpacing.s1))
            Text(stringResource(R.string.story_empty_share))
        }
    }
}

@Composable
private fun ErrorState(onRetry: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(SwaplSpacing.s8),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            stringResource(R.string.story_error_title),
            style = MaterialTheme.typography.titleLarge,
        )
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            stringResource(R.string.story_error_body),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        Spacer(Modifier.height(SwaplSpacing.s3))
        TextButton(onClick = onRetry) { Text(stringResource(R.string.story_error_retry)) }
    }
}
