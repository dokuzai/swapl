package app.swapl.core.auth

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.BuildConfig
import app.swapl.core.favorites.FavoritesStore
import app.swapl.core.model.AuthUser
import app.swapl.core.model.MeResponse
import app.swapl.core.model.TokenResponse
import app.swapl.core.network.ApiClient
import dagger.hilt.android.lifecycle.HiltViewModel
import io.ktor.client.call.body
import io.ktor.client.plugins.ClientRequestException
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import javax.inject.Inject

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val api: ApiClient,
    private val tokenStore: TokenStore,
    private val favorites: FavoritesStore,
) : ViewModel() {

    var uiState by mutableStateOf(UiState())
        private set

    init {
        if (tokenStore.read() != null) viewModelScope.launch { bootstrap() }
        loadProviders()
    }

    // Env-gated provider discovery: buttons for disabled providers are hidden,
    // mirroring iOS and the web client. Null until the first fetch succeeds.
    fun loadProviders() {
        viewModelScope.launch {
            runCatching {
                val res: ProvidersStatus = api.client.get("${api.baseUrl}/api/auth/providers").body()
                uiState = uiState.copy(providers = res)
            }
        }
    }

    private suspend fun bootstrap() {
        // /api/me will 401 if the token is bad; we just clear it in that case.
        try {
            val me: MeResponse = api.client.get("${api.baseUrl}/api/me").body()
            uiState = uiState.copy(
                session = AuthUser(me.user.id, me.user.email, me.user.name, me.user.avatar),
                emailVerified = me.user.verified,
            )
        } catch (t: ClientRequestException) {
            // Token rejected → clear it. Transient/network failures keep the session.
            if (t.response.status.value == 401) tokenStore.delete()
        } catch (_: Throwable) {
        }
    }

    fun signIn(email: String, password: String) {
        viewModelScope.launch {
            uiState = uiState.copy(isAuthenticating = true, error = null, info = null)
            try {
                val res: TokenResponse = api.client.post("${api.baseUrl}/api/auth/token") {
                    contentType(ContentType.Application.Json)
                    setBody(TokenIssueBody(email.trim().lowercase(), password, "android", BuildConfig.VERSION_NAME))
                }.body()
                tokenStore.write(res.token)
                uiState = uiState.copy(session = res.user, isAuthenticating = false)
                bootstrap()
            } catch (t: ClientRequestException) {
                val error = runCatching { t.response.body<ApiError>().error }.getOrNull()
                uiState = uiState.copy(error = error ?: "Invalid email or password", isAuthenticating = false)
            } catch (t: Throwable) {
                uiState = uiState.copy(error = t.message ?: "Sign in failed", isAuthenticating = false)
            }
        }
    }

    // Shared tail of every provider login: each endpoint returns the exact same
    // TokenResponse as POST /api/auth/token when `platform` is sent.
    private fun tokenSignIn(genericError: String, request: suspend () -> TokenResponse) {
        viewModelScope.launch {
            uiState = uiState.copy(isAuthenticating = true, error = null, info = null)
            try {
                val res = request()
                tokenStore.write(res.token)
                uiState = uiState.copy(session = res.user, isAuthenticating = false)
                bootstrap()
            } catch (t: ClientRequestException) {
                val msg = when (t.response.status.value) {
                    429 -> "Too many attempts — try again in a bit."
                    503 -> "This sign-in method isn't available right now."
                    else -> runCatching { t.response.body<ApiError>().error }.getOrNull() ?: genericError
                }
                uiState = uiState.copy(error = msg, isAuthenticating = false)
            } catch (t: Throwable) {
                uiState = uiState.copy(error = t.message ?: genericError, isAuthenticating = false)
            }
        }
    }

    fun signInWithGoogle(idToken: String) = tokenSignIn("Google sign-in failed") {
        api.client.post("${api.baseUrl}/api/auth/oauth/google") {
            contentType(ContentType.Application.Json)
            setBody(OAuthGoogleBody(idToken, "android", BuildConfig.VERSION_NAME))
        }.body()
    }

    // No Android UI yet (needs an Apple Services ID + backend web-callback route);
    // kept so the flow is one button away once the server side exists.
    fun signInWithApple(identityToken: String, fullName: String? = null) = tokenSignIn("Apple sign-in failed") {
        api.client.post("${api.baseUrl}/api/auth/oauth/apple") {
            contentType(ContentType.Application.Json)
            setBody(OAuthAppleBody(identityToken, fullName, "android", BuildConfig.VERSION_NAME))
        }.body()
    }

    // No Android UI yet (the Login Widget needs a web page + deep-link callback);
    // same condition as iOS, which also hides Telegram.
    fun signInWithTelegram(authData: JsonObject) = tokenSignIn("Telegram sign-in failed") {
        api.client.post("${api.baseUrl}/api/auth/oauth/telegram") {
            contentType(ContentType.Application.Json)
            setBody(OAuthTelegramBody(authData, "android", BuildConfig.VERSION_NAME))
        }.body()
    }

    // Step 1 of the OTP flow. The server answers opaquely (anti-enumeration),
    // so success only means "if that destination exists, a code is on its way".
    fun requestOtp(channel: String, destination: String) {
        viewModelScope.launch {
            uiState = uiState.copy(isAuthenticating = true, error = null, info = null)
            try {
                api.client.post("${api.baseUrl}/api/auth/otp/request") {
                    contentType(ContentType.Application.Json)
                    setBody(OtpRequestBody(channel, destination))
                }
                uiState = uiState.copy(isAuthenticating = false, otpCodeSent = true)
            } catch (t: ClientRequestException) {
                val msg = when (t.response.status.value) {
                    429 -> "Too many attempts — try again in a bit."
                    503 -> "This sign-in method isn't available right now."
                    else -> runCatching { t.response.body<ApiError>().error }.getOrNull() ?: "Could not send the code"
                }
                uiState = uiState.copy(error = msg, isAuthenticating = false)
            } catch (t: Throwable) {
                uiState = uiState.copy(error = t.message ?: "Could not send the code", isAuthenticating = false)
            }
        }
    }

    // Step 2 — exchanges the 6-digit code for the same bearer session as
    // every other login.
    fun verifyOtp(destination: String, code: String) = tokenSignIn("Invalid or expired code") {
        api.client.post("${api.baseUrl}/api/auth/otp/verify") {
            contentType(ContentType.Application.Json)
            setBody(OtpVerifyBody(destination, code, "android", BuildConfig.VERSION_NAME))
        }.body()
    }

    fun resetOtp() {
        uiState = uiState.copy(otpCodeSent = false, error = null, info = null)
    }

    // Single round-trip native sign-up: platform present → response carries a token.
    fun register(email: String, password: String) {
        viewModelScope.launch {
            uiState = uiState.copy(isAuthenticating = true, error = null, info = null)
            try {
                val res: RegisterResponse = api.client.post("${api.baseUrl}/api/auth/register") {
                    contentType(ContentType.Application.Json)
                    setBody(RegisterBody(email.trim().lowercase(), password, "android", BuildConfig.VERSION_NAME))
                }.body()
                val token = res.token
                if (token != null) {
                    tokenStore.write(token)
                    uiState = uiState.copy(isAuthenticating = false, emailVerified = false)
                    bootstrap()
                } else {
                    uiState = uiState.copy(
                        isAuthenticating = false,
                        info = "Account created — sign in to continue.",
                    )
                }
            } catch (t: ClientRequestException) {
                val msg = when (t.response.status.value) {
                    409 -> "That email is already in use. Try signing in."
                    429 -> "Too many attempts — try again in a bit."
                    else -> runCatching { t.response.body<ApiError>().error }.getOrNull() ?: "Sign up failed"
                }
                uiState = uiState.copy(error = msg, isAuthenticating = false)
            } catch (t: Throwable) {
                uiState = uiState.copy(error = t.message ?: "Sign up failed", isAuthenticating = false)
            }
        }
    }

    fun joinWaitlist(email: String) {
        viewModelScope.launch {
            uiState = uiState.copy(isAuthenticating = true, error = null, info = null)
            try {
                api.client.post("${api.baseUrl}/api/beta") {
                    contentType(ContentType.Application.Json)
                    setBody(BetaBody(email.trim().lowercase(), "android-app"))
                }
                uiState = uiState.copy(isAuthenticating = false, info = "You're on the list — we'll be in touch.")
            } catch (t: Throwable) {
                uiState = uiState.copy(error = "Could not join the waitlist right now", isAuthenticating = false)
            }
        }
    }

    fun resendVerification() {
        viewModelScope.launch {
            uiState = uiState.copy(isResendingVerification = true)
            try {
                val res: ResendResponse = api.client.post("${api.baseUrl}/api/auth/resend-verification").body()
                uiState = uiState.copy(
                    isResendingVerification = false,
                    emailVerified = res.alreadyVerified == true || uiState.emailVerified,
                    info = if (res.alreadyVerified == true) null else "Verification email sent.",
                )
            } catch (t: Throwable) {
                uiState = uiState.copy(isResendingVerification = false)
            }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            runCatching {
                api.client.post("${api.baseUrl}/api/auth/token/revoke")
            }
            tokenStore.delete()
            // Drop cached hearts so the next account doesn't inherit them.
            favorites.reset()
            uiState = UiState()
        }
    }

    fun clearMessages() {
        uiState = uiState.copy(error = null, info = null)
    }

    @Serializable
    private data class TokenIssueBody(
        val email: String,
        val password: String,
        val platform: String,
        val appVersion: String,
    )

    @Serializable
    private data class RegisterBody(
        val email: String,
        val password: String,
        val platform: String,
        val appVersion: String,
    )

    @Serializable
    private data class RegisterResponse(
        val ok: Boolean,
        val userId: String,
        val token: String? = null,
        val expiresAt: String? = null,
    )

    @Serializable
    private data class BetaBody(val email: String, val source: String)

    @Serializable
    private data class OAuthGoogleBody(
        val idToken: String,
        val platform: String,
        val appVersion: String,
    )

    @Serializable
    private data class OAuthAppleBody(
        val identityToken: String,
        val fullName: String? = null,
        val platform: String,
        val appVersion: String,
    )

    @Serializable
    private data class OAuthTelegramBody(
        val authData: JsonObject,
        val platform: String,
        val appVersion: String,
    )

    @Serializable
    private data class OtpRequestBody(val channel: String, val destination: String)

    @Serializable
    private data class OtpVerifyBody(
        val destination: String,
        val code: String,
        val platform: String,
        val appVersion: String,
    )

    @Serializable
    data class ProvidersStatus(
        val password: Boolean = true,
        val google: Boolean = false,
        val apple: Boolean = false,
        val telegram: TelegramStatus = TelegramStatus(),
        val emailOtp: Boolean = false,
        val phone: Boolean = false,
    ) {
        @Serializable
        data class TelegramStatus(val enabled: Boolean = false, val botUsername: String? = null)
    }

    @Serializable
    private data class ResendResponse(val ok: Boolean, val alreadyVerified: Boolean? = null)

    @Serializable
    private data class ApiError(val error: String? = null)

    data class UiState(
        val session: AuthUser? = null,
        // Defaults true so the banner never flashes before /api/me answers.
        val emailVerified: Boolean = true,
        val isAuthenticating: Boolean = false,
        val isResendingVerification: Boolean = false,
        val error: String? = null,
        val info: String? = null,
        // Env-gated provider availability; null until /api/auth/providers answers.
        val providers: ProvidersStatus? = null,
        // OTP two-step flow: true once /api/auth/otp/request succeeded.
        val otpCodeSent: Boolean = false,
    )
}
