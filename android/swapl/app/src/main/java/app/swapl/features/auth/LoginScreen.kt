package app.swapl.features.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import app.swapl.BuildConfig
import app.swapl.core.auth.AuthViewModel
import app.swapl.design.components.KickerLabel
import app.swapl.design.components.PrimaryPill
import app.swapl.designtokens.SwaplSpacing
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch

private enum class AuthMode { SignIn, Register, Waitlist }

// OTP ("email code" / "phone") two-step flow: destination → 6-digit code.
private enum class OtpChannel(val wire: String) { Email("email"), Sms("sms") }

@Composable
fun LoginScreen(vm: AuthViewModel) {
    var mode by remember { mutableStateOf(AuthMode.SignIn) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var otpChannel by remember { mutableStateOf<OtpChannel?>(null) }
    var otpDestination by remember { mutableStateOf("") }
    var otpCode by remember { mutableStateOf("") }
    // Google sign-in failures happen before any API call, so they live here.
    var localError by remember { mutableStateOf<String?>(null) }

    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    fun switchTo(m: AuthMode) {
        mode = m
        localError = null
        vm.clearMessages()
    }

    fun openOtp(channel: OtpChannel) {
        otpChannel = channel
        otpDestination = if (channel == OtpChannel.Email) email else ""
        otpCode = ""
        localError = null
        vm.resetOtp()
    }

    fun closeOtp() {
        otpChannel = null
        localError = null
        vm.resetOtp()
    }

    fun startGoogleSignIn() {
        if (vm.uiState.isAuthenticating) return
        localError = null
        vm.clearMessages()
        scope.launch {
            try {
                val option = GetGoogleIdOption.Builder()
                    .setServerClientId(BuildConfig.SWAPL_GOOGLE_SERVER_CLIENT_ID)
                    .setFilterByAuthorizedAccounts(false)
                    .build()
                val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
                val credential = CredentialManager.create(context)
                    .getCredential(context, request).credential
                if (credential is CustomCredential &&
                    credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                ) {
                    vm.signInWithGoogle(GoogleIdTokenCredential.createFrom(credential.data).idToken)
                } else {
                    localError = "Google sign-in failed. Try again."
                }
            } catch (_: GetCredentialCancellationException) {
                // User dismissed the sheet — not an error.
            } catch (_: GetCredentialException) {
                localError = "Google sign-in failed. Try again."
            }
        }
    }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(SwaplSpacing.s8),
        verticalArrangement = Arrangement.Center
    ) {
        val busy = vm.uiState.isAuthenticating
        val channel = otpChannel

        if (channel != null) {
            OtpForm(
                vm = vm,
                channel = channel,
                destination = otpDestination,
                onDestinationChange = { otpDestination = it },
                code = otpCode,
                onCodeChange = { otpCode = it.filter(Char::isDigit).take(6) },
                onBack = { closeOtp() },
            )
            return@Column
        }

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
        (vm.uiState.error ?: localError)?.let {
            Spacer(Modifier.height(SwaplSpacing.s2))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
        vm.uiState.info?.let {
            Spacer(Modifier.height(SwaplSpacing.s2))
            Text(it, color = MaterialTheme.colorScheme.primary)
        }
        Spacer(Modifier.height(SwaplSpacing.s5))

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

        // "or continue with" — env-gated by GET /api/auth/providers; buttons for
        // disabled providers stay hidden. Apple and Telegram have no Android UI
        // yet (both need server-side web-callback plumbing that doesn't exist).
        val providers = vm.uiState.providers
        if (mode != AuthMode.Waitlist && providers != null) {
            val googleAvailable =
                providers.google && BuildConfig.SWAPL_GOOGLE_SERVER_CLIENT_ID.isNotEmpty()
            if (googleAvailable || providers.emailOtp || providers.phone) {
                Spacer(Modifier.height(SwaplSpacing.s5))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    HorizontalDivider(Modifier.weight(1f))
                    Text(
                        "or continue with",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = SwaplSpacing.s3),
                    )
                    HorizontalDivider(Modifier.weight(1f))
                }
                Spacer(Modifier.height(SwaplSpacing.s4))
                if (googleAvailable) {
                    ProviderPill(text = "Continue with Google", enabled = !busy) {
                        startGoogleSignIn()
                    }
                    Spacer(Modifier.height(SwaplSpacing.s3))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(SwaplSpacing.s3)) {
                    if (providers.emailOtp) {
                        ProviderPill(
                            text = "Email code",
                            enabled = !busy,
                            modifier = Modifier.weight(1f),
                        ) { openOtp(OtpChannel.Email) }
                    }
                    if (providers.phone) {
                        ProviderPill(
                            text = "Phone",
                            enabled = !busy,
                            modifier = Modifier.weight(1f),
                        ) { openOtp(OtpChannel.Sms) }
                    }
                }
            }
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

// Secondary full-width capsule for third-party providers — the understudy to
// PrimaryPill, same silhouette without the fill.
@Composable
private fun ProviderPill(
    text: String,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth(),
    ) {
        Text(text)
    }
}

// OTP two-step flow, replacing the password form inline (same screen chrome).
@Composable
private fun OtpForm(
    vm: AuthViewModel,
    channel: OtpChannel,
    destination: String,
    onDestinationChange: (String) -> Unit,
    code: String,
    onCodeChange: (String) -> Unit,
    onBack: () -> Unit,
) {
    val busy = vm.uiState.isAuthenticating
    val codeSent = vm.uiState.otpCodeSent
    val trimmed = destination.trim()
    val destinationPlausible = when (channel) {
        OtpChannel.Email -> trimmed.contains("@") && trimmed.contains(".")
        OtpChannel.Sms -> trimmed.startsWith("+") && trimmed.count(Char::isDigit) >= 7
    }

    KickerLabel(if (channel == OtpChannel.Email) "Sign in with email code" else "Sign in with phone")
    Spacer(Modifier.height(SwaplSpacing.s2))
    Text(
        if (codeSent) "Enter your code." else "Get a code.",
        style = MaterialTheme.typography.displayMedium,
    )
    Spacer(Modifier.height(SwaplSpacing.s6))

    if (codeSent) {
        Text(
            "We sent a 6-digit code to $trimmed. It expires in 10 minutes.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(SwaplSpacing.s3))
        OutlinedTextField(
            value = code,
            onValueChange = onCodeChange,
            label = { Text("123456") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            modifier = Modifier.fillMaxWidth()
        )
    } else {
        OutlinedTextField(
            value = destination,
            onValueChange = onDestinationChange,
            label = { Text(if (channel == OtpChannel.Email) "Email" else "Phone (e.g. +39 333 123 4567)") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = if (channel == OtpChannel.Email) KeyboardType.Email else KeyboardType.Phone
            ),
            modifier = Modifier.fillMaxWidth()
        )
        if (channel == OtpChannel.Sms) {
            Spacer(Modifier.height(SwaplSpacing.s2))
            Text(
                "Use international format, e.g. +39 333 123 4567.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    vm.uiState.error?.let {
        Spacer(Modifier.height(SwaplSpacing.s2))
        Text(it, color = MaterialTheme.colorScheme.error)
    }
    Spacer(Modifier.height(SwaplSpacing.s5))

    if (codeSent) {
        PrimaryPill(
            text = if (busy) "Verifying…" else "Verify code",
            onClick = { vm.verifyOtp(trimmed, code) },
            enabled = code.length == 6 && !busy,
        )
        Spacer(Modifier.height(SwaplSpacing.s2))
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            TextButton(onClick = {
                onCodeChange("")
                vm.resetOtp()
            }) {
                Text("Didn't get it? Send a new code")
            }
        }
    } else {
        PrimaryPill(
            text = if (busy) "Sending…" else "Send code",
            onClick = { vm.requestOtp(channel.wire, trimmed) },
            enabled = destinationPlausible && !busy,
        )
    }

    Spacer(Modifier.height(SwaplSpacing.s2))
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        TextButton(onClick = onBack) {
            Text("Back to password sign-in", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
