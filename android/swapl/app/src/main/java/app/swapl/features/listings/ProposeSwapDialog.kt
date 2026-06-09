package app.swapl.features.listings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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
    vm: ProposeSwapViewModel = hiltViewModel(),
) {
    // Default to 30-37 days out — same heuristic as the iOS sheet's default.
    val today = LocalDate.now()
    var from by remember { mutableStateOf(today.plusDays(30).format(DateTimeFormatter.ISO_LOCAL_DATE)) }
    var to by remember { mutableStateOf(today.plusDays(37).format(DateTimeFormatter.ISO_LOCAL_DATE)) }
    var msg by remember { mutableStateOf("") }

    if (vm.didSubmit) {
        onDismiss()
        return
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Propose a swap") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                DateField("From", from, { from = it }, modifier = Modifier.fillMaxWidth())
                DateField("To", to, { to = it }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    msg, { msg = it },
                    label = { Text("Message (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                )
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
            ) { Text("Send") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
