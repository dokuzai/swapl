package app.swapl.features.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.model.Listing
import app.swapl.core.model.ProfileReview
import app.swapl.core.model.ProfileStats
import app.swapl.core.model.PublicProfile
import app.swapl.core.model.PublicProfileUser
import app.swapl.core.repository.ProfileRepository
import app.swapl.design.components.CityStampStrip
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.ListingPhoto
import app.swapl.design.components.SurfaceCard
import app.swapl.design.components.TagChip
import app.swapl.designtokens.SwaplColors
import app.swapl.designtokens.SwaplSpacing
import coil3.compose.SubcomposeAsyncImage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.Year
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class PublicProfileViewModel @Inject constructor(
    private val repo: ProfileRepository,
    savedState: SavedStateHandle,
) : ViewModel() {
    private val userId: String = checkNotNull(savedState["userId"])
    var profile by mutableStateOf<PublicProfile?>(null); private set
    fun load() = viewModelScope.launch { runCatching { profile = repo.publicProfile(userId) } }
}

// Rich public profile (DOK-147), mirroring /profile/{id} on the web and the
// iOS PublicProfileView: identity card with real stats, icon info rows,
// "Where I've been" postcard stamps from COMPLETED swaps, reviews, interests,
// and the host's listings.
@Composable
fun PublicProfileScreen(
    onOpenListing: (String) -> Unit = {},
    vm: PublicProfileViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { vm.load() }
    val p = vm.profile
    var showReport by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s4),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4),
    ) {
        if (p != null) {
            IdentityCard(p)
            InfoRows(p.user)
            BioBlock(p.user)
            VisitedBlock(p)
            ReviewsBlock(p)
            InterestsBlock(p.user)
            ListingsBlock(p.listings, onOpenListing)

            TextButton(onClick = { showReport = true }) {
                Text("Report this user", color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (showReport && p != null) {
        ReportDialog(targetUserId = p.user.id, listingId = null, onDismiss = { showReport = false })
    }
}

// Stats always render: a missing block (older API) degrades to zeros and the
// member-since year from the user payload — never fake numbers.
private fun statsOf(p: PublicProfile): ProfileStats =
    p.stats ?: ProfileStats(
        swapsCompleted = 0,
        reviewsCount = 0,
        avgRating = null,
        memberSince = p.user.memberSince,
    )

private fun joinYear(p: PublicProfile): Int =
    statsOf(p).memberSince.take(4).toIntOrNull() ?: Year.now().value

private fun tenureYears(p: PublicProfile): Int =
    (Year.now().value - joinYear(p)).coerceAtLeast(0)

@Composable
private fun IdentityCard(p: PublicProfile) {
    val stats = statsOf(p)
    SurfaceCard {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s5),
        ) {
            Column(
                Modifier.weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
            ) {
                ProfileAvatar(p.user)
                Text(
                    p.user.name ?: "Anonymous host",
                    style = MaterialTheme.typography.headlineMedium,
                    textAlign = TextAlign.Center,
                )
                if (p.user.verified) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s1),
                    ) {
                        Icon(
                            Icons.Default.Verified,
                            contentDescription = null,
                            tint = SwaplColors.Pink,
                            modifier = Modifier.size(14.dp),
                        )
                        Text(
                            "ID verified",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                            color = SwaplColors.Pink,
                        )
                    }
                }
            }

            Column(
                Modifier.width(116.dp),
                verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
            ) {
                StatRow(
                    value = "${stats.swapsCompleted}",
                    label = if (stats.swapsCompleted == 1) "Swap" else "Swaps",
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                StatRow(
                    value = reviewsValue(stats),
                    label = if (stats.reviewsCount == 1) "Review" else "Reviews",
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                val years = tenureYears(p)
                // Tenure: "N Years on Swapl" once a full year has passed; the
                // join year ("Joined Swapl") until then.
                StatRow(
                    value = if (years >= 1) "$years" else "${joinYear(p)}",
                    label = when {
                        years == 1 -> "Year on Swapl"
                        years > 1 -> "Years on Swapl"
                        else -> "Joined Swapl"
                    },
                )
            }
        }
    }
}

private fun reviewsValue(stats: ProfileStats): String {
    val avg = stats.avgRating
    if (avg != null && stats.reviewsCount > 0) {
        val formatted =
            if (avg % 1.0 == 0.0) "${avg.toInt()}"
            else String.format(Locale.US, "%.1f", avg)
        return "${stats.reviewsCount} · $formatted★"
    }
    return "${stats.reviewsCount}"
}

@Composable
private fun StatRow(value: String, label: String) {
    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
        Text(value, style = MaterialTheme.typography.titleLarge)
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ProfileAvatar(u: PublicProfileUser) {
    Box(
        Modifier
            .size(96.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary),
        contentAlignment = Alignment.Center,
    ) {
        val initial = @Composable {
            Text(
                (u.name ?: "?").take(1).uppercase(),
                style = MaterialTheme.typography.displaySmall,
                color = MaterialTheme.colorScheme.onPrimary,
            )
        }
        if (u.avatar != null) {
            SubcomposeAsyncImage(
                model = u.avatar,
                contentDescription = u.name ?: "Host avatar",
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                loading = { initial() },
                error = { initial() },
            )
        } else {
            initial()
        }
    }
}

// Icon info rows (work / languages / home city), like the web profile.
// homeCity is privacy-gated server-side — absent when the host hides it.
@Composable
private fun InfoRows(u: PublicProfileUser) {
    val languages = u.languages.orEmpty().filter { it.isNotBlank() }
    val home = listOfNotNull(u.homeCity, u.homeCountry).filter { it.isNotBlank() }.joinToString(", ")
    val work = u.work?.takeIf { it.isNotBlank() }
    if (work == null && languages.isEmpty() && home.isEmpty()) return

    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
        work?.let { InfoRow(Icons.Default.Work, "My work: $it") }
        if (languages.isNotEmpty()) InfoRow(Icons.Default.Language, "Speaks ${languages.joinToString(", ")}")
        if (home.isNotEmpty()) InfoRow(Icons.Default.Place, "Lives in $home")
    }
}

@Composable
private fun InfoRow(icon: ImageVector, text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun BioBlock(u: PublicProfileUser) {
    u.bioVibe?.takeIf { it.isNotEmpty() }?.let {
        Text("“$it”", style = MaterialTheme.typography.titleLarge, color = SwaplColors.Pink, fontStyle = FontStyle.Italic)
    }
    u.bio?.takeIf { it.isNotEmpty() }?.let {
        Text(it, style = MaterialTheme.typography.bodyMedium)
    }
}

// Sections always render (parity with web + iOS, commit 00b57ee): hiding them
// when empty read as missing features, so empty states show muted copy instead.
@Composable
private fun VisitedBlock(p: PublicProfile) {
    val visited = p.visited.orEmpty()
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        KickerLabel("Where I've been")
        if (visited.isEmpty()) {
            Text(
                "No completed swaps yet — passport stamps appear here after each stay.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            CityStampStrip(visited)
        }
    }
}

@Composable
private fun ReviewsBlock(p: PublicProfile) {
    val reviews = p.reviews.orEmpty()
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
        KickerLabel(if (reviews.isEmpty()) "Reviews" else "Reviews (${statsOf(p).reviewsCount})")
        if (reviews.isEmpty()) {
            Text(
                "No reviews yet — hosts review each other after a completed swap.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            reviews.forEach { ReviewCard(it) }
        }
    }
}

@Composable
private fun ReviewCard(review: ProfileReview) {
    SurfaceCard {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            StarsRow(rating = review.rating)
            Text(review.text, style = MaterialTheme.typography.bodyMedium)
            Text(
                "${review.author.name ?: "A Swapl member"} · ${reviewMonth(review.createdAt)}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun reviewMonth(value: String): String = runCatching {
    LocalDate.parse(value.take(10))
        .format(DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH))
}.getOrDefault(value.take(10))

// Five-star row shared by the profile reviews and the leave-review dialog.
@Composable
fun StarsRow(rating: Int, size: Dp = 14.dp) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        modifier = Modifier.semantics { contentDescription = "$rating out of 5 stars" },
    ) {
        (1..5).forEach { n ->
            Icon(
                if (n <= rating) Icons.Default.Star else Icons.Default.StarBorder,
                contentDescription = null,
                tint = if (n <= rating) SwaplColors.Pink else SwaplColors.Cream2,
                modifier = Modifier.size(size),
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun InterestsBlock(u: PublicProfileUser) {
    if (u.interests.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
        KickerLabel("Interests")
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
            verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2),
        ) {
            u.interests.forEach { TagChip(it) }
        }
    }
}

@Composable
private fun ListingsBlock(listings: List<Listing>, onOpenListing: (String) -> Unit) {
    if (listings.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
        KickerLabel("Their homes")
        listings.forEach { l -> ListingThumbnail(l, onClick = { onOpenListing(l.id) }) }
    }
}

@Composable
private fun ListingThumbnail(l: Listing, onClick: () -> Unit) {
    SurfaceCard(modifier = Modifier.clickable(onClick = onClick)) {
        Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
            ListingPhoto(photoUrl = l.photos.firstOrNull(), palette = l.palette, height = 140.dp)
            Text("${l.neighbourhood} · ${l.city}", style = MaterialTheme.typography.titleLarge)
            Text("${l.sizeSqm} m² · sleeps ${l.sleeps}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
