package app.swapl.features.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import app.swapl.core.auth.AuthViewModel
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.PrimaryPill
import app.swapl.designtokens.SwaplSpacing

private enum class AuthMode { SignIn, Register, Waitlist }

@Composable
fun LoginScreen(vm: AuthViewModel) {
    var mode by remember { mutableStateOf(AuthMode.SignIn) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    fun switchTo(m: AuthMode) {
        mode = m
        vm.clearMessages()
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(SwaplSpacing.s8),
        verticalArrangement = Arrangement.Center
    ) {
        KickerLabel(
            when (mode) {
                AuthMode.SignIn -> "Welcome back"
                AuthMode.Register -> "Join Swapl"
                AuthMode.Waitlist -> "Early access"
            }
        )
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(
            when (mode) {
                AuthMode.SignIn -> "Keys for keys."
                AuthMode.Register -> "Swap homes,\nnot hotels."
                AuthMode.Waitlist -> "Get on the list."
            },
            style = MaterialTheme.typography.displayMedium,
        )
        Spacer(Modifier.height(SwaplSpacing.s6))
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth()
        )
        if (mode != AuthMode.Waitlist) {
            Spacer(Modifier.height(SwaplSpacing.s3))
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text(if (mode == AuthMode.Register) "Password (min 6 characters)" else "Password") },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
        }
        vm.uiState.error?.let {
            Spacer(Modifier.height(SwaplSpacing.s2))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
        vm.uiState.info?.let {
            Spacer(Modifier.height(SwaplSpacing.s2))
            Text(it, color = MaterialTheme.colorScheme.primary)
        }
        Spacer(Modifier.height(SwaplSpacing.s5))

        val busy = vm.uiState.isAuthenticating
        val credentialsOk = email.isNotBlank() && password.length >= 6
        when (mode) {
            AuthMode.SignIn -> PrimaryPill(
                text = if (busy) "Signing in…" else "Sign in",
                onClick = { vm.signIn(email, password) },
                enabled = credentialsOk && !busy,
            )
            AuthMode.Register -> PrimaryPill(
                text = if (busy) "Creating account…" else "Create account",
                onClick = { vm.register(email, password) },
                enabled = credentialsOk && !busy,
            )
            AuthMode.Waitlist -> PrimaryPill(
                text = if (busy) "Joining…" else "Join the waitlist",
                onClick = { vm.joinWaitlist(email) },
                enabled = email.contains("@") && !busy,
            )
        }

        Spacer(Modifier.height(SwaplSpacing.s4))
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            when (mode) {
                AuthMode.SignIn -> {
                    TextButton(onClick = { switchTo(AuthMode.Register) }) {
                        Text("New to Swapl? Create account")
                    }
                    TextButton(onClick = { switchTo(AuthMode.Waitlist) }) {
                        Text("Not ready? Join the waitlist", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                AuthMode.Register -> TextButton(onClick = { switchTo(AuthMode.SignIn) }) {
                    Text("Already have an account? Sign in")
                }
                AuthMode.Waitlist -> TextButton(onClick = { switchTo(AuthMode.SignIn) }) {
                    Text("Have an account? Sign in")
                }
            }
        }
    }
}
