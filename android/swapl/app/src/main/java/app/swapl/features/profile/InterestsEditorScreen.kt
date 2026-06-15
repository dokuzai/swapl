package app.swapl.features.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.R
import app.swapl.core.model.InterestsCatalog
import app.swapl.core.repository.ProfileRepository
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.PrimaryPill
import app.swapl.designtokens.SwaplSpacing
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class InterestsEditorViewModel @Inject constructor(
    private val repo: ProfileRepository,
) : ViewModel() {
    var catalog by mutableStateOf<InterestsCatalog?>(null); private set
    val selected = mutableStateListOf<String>()
    var bioVibe by mutableStateOf("")
    var isSaving by mutableStateOf(false); private set
    var didSave by mutableStateOf(false); private set
    var error by mutableStateOf<String?>(null); private set

    fun load() = viewModelScope.launch {
        runCatching {
            val r = repo.interests()
            catalog = r
            selected.clear()
            selected.addAll(r.selected)
        }.onFailure { error = it.message }
    }

    fun toggle(slug: String) {
        if (selected.contains(slug)) selected.remove(slug)
        else if (selected.size < 12) selected.add(slug)
    }

    fun save() = viewModelScope.launch {
        isSaving = true; error = null
        try {
            repo.saveInterests(selected.toList(), bioVibe.ifBlank { null })
            didSave = true
        } catch (t: Throwable) { error = t.message }
        finally { isSaving = false }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun InterestsEditorScreen(
    onDone: () -> Unit,
    vm: InterestsEditorViewModel = hiltViewModel(),
) {
    LaunchedEffect(Unit) { vm.load() }
    if (vm.didSave) { onDone(); return }
    val c = vm.catalog
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(SwaplSpacing.s4),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s4)
    ) {
        Text(stringResource(R.string.interests_title, vm.selected.size), style = MaterialTheme.typography.displaySmall)
        OutlinedTextField(vm.bioVibe, { vm.bioVibe = it }, label = { Text(stringResource(R.string.interests_vibe_label)) })
        if (c != null) {
            c.categories.forEach { cat ->
                KickerLabel(cat.label)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s2)) {
                    c.catalog.filter { it.category == cat.id }.forEach { tag ->
                        FilterChip(
                            selected = vm.selected.contains(tag.slug),
                            onClick = { vm.toggle(tag.slug) },
                            label = { Text(tag.label) },
                        )
                    }
                }
            }
        }
        vm.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        PrimaryPill(
            text = if (vm.isSaving) stringResource(R.string.interests_saving) else stringResource(R.string.interests_save),
            onClick = { vm.save() },
            enabled = !vm.isSaving,
        )
    }
}
