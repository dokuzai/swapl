package app.swapl.features.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.foundation.text.KeyboardOptions
import app.swapl.core.auth.AuthViewModel
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.PrimaryPill
import app.swapl.designtokens.SwaplSpacing

@Composable
fun LoginScreen(vm: AuthViewModel) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        Modifier.fillMaxSize().padding(SwaplSpacing.s8),
        verticalArrangement = Arrangement.Center
    ) {
        KickerLabel("Welcome back")
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text("Keys for keys.", style = MaterialTheme.typography.displayMedium)
        Spacer(Modifier.height(SwaplSpacing.s6))
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxSize(0.999f)
        )
        Spacer(Modifier.height(SwaplSpacing.s3))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true,
            modifier = Modifier.fillMaxSize(0.999f)
        )
        vm.uiState.error?.let {
            Spacer(Modifier.height(SwaplSpacing.s2))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(SwaplSpacing.s5))
        PrimaryPill(
            text = if (vm.uiState.isAuthenticating) "Signing in…" else "Sign in",
            onClick = { vm.signIn(email, password) },
            enabled = email.isNotBlank() && password.length >= 6 && !vm.uiState.isAuthenticating,
        )
    }
}
