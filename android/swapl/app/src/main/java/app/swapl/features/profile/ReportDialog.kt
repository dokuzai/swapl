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
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.R
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

private val PRESET_RES = listOf(
    R.string.report_reason_inappropriate,
    R.string.report_reason_scam,
    R.string.report_reason_harassment,
    R.string.report_reason_discrimination,
    R.string.report_reason_other,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportDialog(
    targetUserId: String?,
    listingId: String?,
    onDismiss: () -> Unit,
    vm: ReportViewModel = hiltViewModel(),
) {
    val presets = PRESET_RES.map { stringResource(it) }
    var reason by remember(presets) { mutableStateOf(presets[0]) }
    var detail by remember { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }

    if (vm.didSubmit) { onDismiss(); return }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.report_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                    OutlinedTextField(
                        value = reason,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.report_reason_label)) },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
                        modifier = Modifier.menuAnchor(),
                    )
                    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        presets.forEach { p ->
                            DropdownMenuItem(text = { Text(p) }, onClick = { reason = p; expanded = false })
                        }
                    }
                }
                OutlinedTextField(detail, { detail = it }, label = { Text(stringResource(R.string.report_details_label)) })
                vm.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(enabled = !vm.isSubmitting, onClick = {
                vm.submit(reason, detail.ifBlank { null }, listingId, targetUserId)
            }) { Text(stringResource(R.string.common_send)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) } },
    )
}
