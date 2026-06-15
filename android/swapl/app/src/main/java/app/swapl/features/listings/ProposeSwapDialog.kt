package app.swapl.features.listings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.swapl.R
import app.swapl.core.repository.ProposalRepository
import app.swapl.design.components.DateField
import app.swapl.designtokens.SwaplSpacing
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import javax.inject.Inject

@HiltViewModel
class ProposeSwapViewModel @Inject constructor(
    private val repo: ProposalRepository,
) : ViewModel() {
    var isSubmitting by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    var didSubmit by mutableStateOf(false); private set
    var isDrafting by mutableStateOf(false); private set
    var draftedMessage by mutableStateOf<String?>(null); private set

    // AI cover-message draft, like the web composer. Errors stay quiet beyond
    // a short note — the user can always type the message by hand.
    fun draftMessage(proposerListingId: String, targetListingId: String, from: String, to: String) {
        if (isDrafting) return
        viewModelScope.launch {
            isDrafting = true
            try {
                draftedMessage = repo.draftMessage(proposerListingId, targetListingId, from, to).message
            } catch (t: Throwable) {
                error = "Couldn't draft a message right now"
            } finally {
                isDrafting = false
            }
        }
    }

    fun consumeDraft(): String? = draftedMessage.also { draftedMessage = null }

    fun submit(proposerListingId: String, targetListingId: String, from: String, to: String, message: String?) {
        viewModelScope.launch {
            isSubmitting = true; error = null
            try {
                repo.create(ProposalRepository.CreateBody(
                    proposerListingId = proposerListingId,
                    targetListingId = targetListingId,
                    dateFrom = from,
                    dateTo = to,
                    message = message,
                ))
                didSubmit = true
            } catch (t: Throwable) {
                error = t.message
            } finally {
                isSubmitting = false
            }
        }
    }
}

@Composable
fun ProposeSwapDialog(
    proposerListingId: String,
    targetListingId: String,
    onDismiss: () -> Unit,
    availableFrom: String? = null,
    availableTo: String? = null,
    vm: ProposeSwapViewModel = hiltViewModel(),
) {
    // Pre-fill from the listing's availability window (like the iOS sheet);
    // fall back to 30-37 days out when none is provided.
    val today = LocalDate.now()
    var from by remember {
        mutableStateOf(
            availableFrom?.take(10) ?: today.plusDays(30).format(DateTimeFormatter.ISO_LOCAL_DATE),
        )
    }
    var to by remember {
        mutableStateOf(
            availableTo?.take(10) ?: today.plusDays(37).format(DateTimeFormatter.ISO_LOCAL_DATE),
        )
    }
    var msg by remember { mutableStateOf("") }

    // Apply a finished AI draft to the message field.
    LaunchedEffect(vm.draftedMessage) {
        vm.consumeDraft()?.let { msg = it }
    }

    if (vm.didSubmit) {
        onDismiss()
        return
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.propose_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                DateField(stringResource(R.string.filter_from), from, { from = it }, modifier = Modifier.fillMaxWidth())
                DateField(stringResource(R.string.filter_to), to, { to = it }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    msg, { msg = it },
                    label = { Text(stringResource(R.string.propose_message_label)) },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                )
                TextButton(
                    enabled = !vm.isDrafting,
                    onClick = { vm.draftMessage(proposerListingId, targetListingId, from, to) },
                ) {
                    if (vm.isDrafting) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(SwaplSpacing.s2))
                        Text(stringResource(R.string.propose_drafting))
                    } else {
                        Icon(Icons.Default.AutoAwesome, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(SwaplSpacing.s2))
                        Text(if (msg.isBlank()) stringResource(R.string.propose_write_for_me) else stringResource(R.string.propose_rewrite_ai))
                    }
                }
                vm.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !vm.isSubmitting && from.length == 10 && to.length == 10 && to > from,
                onClick = {
                    vm.submit(
                        proposerListingId = proposerListingId,
                        targetListingId = targetListingId,
                        from = from, to = to,
                        message = msg.ifBlank { null }
                    )
                }
            ) { Text(stringResource(R.string.propose_send)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) } },
    )
}
