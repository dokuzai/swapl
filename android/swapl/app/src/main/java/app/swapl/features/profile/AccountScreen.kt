package app.swapl.features.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import app.swapl.core.auth.AuthViewModel
import app.swapl.design.components.KickerLabel
import app.swapl.designtokens.SwaplSpacing

@Composable
fun AccountScreen(vm: AuthViewModel = hiltViewModel()) {
    val s = vm.uiState.session
    Column(
        modifier = Modifier.fillMaxSize().padding(SwaplSpacing.s5),
        verticalArrangement = Arrangement.spacedBy(SwaplSpacing.s3),
    ) {
        KickerLabel("Account")
        if (s != null) {
            Text(s.name ?: s.email, style = MaterialTheme.typography.displaySmall)
            Text(s.email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        TextButton(onClick = { vm.signOut() }) {
            Text("Sign out", color = MaterialTheme.colorScheme.error)
        }
    }
}
