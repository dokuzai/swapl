package app.swapl.features.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
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
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.core.repository.ProfileRepository
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ReportViewModel @Inject constructor(
    private val repo: ProfileRepository,
) : ViewModel() {
    var isSubmitting by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set
    var didSubmit by mutableStateOf(false); private set

    fun submit(reason: String, detail: String?, listingId: String?, targetUserId: String?) {
        viewModelScope.launch {
            isSubmitting = true; error = null
            try {
                repo.report(reason, detail, listingId, targetUserId)
                didSubmit = true
            } catch (t: Throwable) { error = t.message }
            finally { isSubmitting = false }
        }
    }
}

private val PRESETS = listOf(
    "Inappropriate content",
    "Scam or fake listing",
    "Harassment",
    "Discrimination",
    "Other",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportDialog(
    targetUserId: String?,
    listingId: String?,
    onDismiss: () -> Unit,
    vm: ReportViewModel = hiltViewModel(),
) {
    var reason by remember { mutableStateOf(PRESETS[0]) }
    var detail by remember { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }

    if (vm.didSubmit) { onDismiss(); return }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Report") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                    OutlinedTextField(
                        value = reason,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Reason") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                        modifier = Modifier.menuAnchor(),
                    )
                    androidx.compose.material3.ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        PRESETS.forEach { p ->
                            DropdownMenuItem(text = { Text(p) }, onClick = { reason = p; expanded = false })
                        }
                    }
                }
                OutlinedTextField(detail, { detail = it }, label = { Text("Details (optional)") })
                vm.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(enabled = !vm.isSubmitting, onClick = {
                vm.submit(reason, detail.ifBlank { null }, listingId, targetUserId)
            }) { Text("Send") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
