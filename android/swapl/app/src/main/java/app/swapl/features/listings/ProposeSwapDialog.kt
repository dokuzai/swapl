package app.swapl.features.listings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import app.swapl.core.repository.ProposalRepository
import app.swapl.designtokens.SwaplSpacing
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
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
    var from by remember { mutableStateOf("") }
    var to by remember { mutableStateOf("") }
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
                OutlinedTextField(from, { from = it }, label = { Text("From (YYYY-MM-DD)") }, singleLine = true)
                OutlinedTextField(to, { to = it }, label = { Text("To (YYYY-MM-DD)") }, singleLine = true)
                OutlinedTextField(msg, { msg = it }, label = { Text("Message (optional)") })
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
