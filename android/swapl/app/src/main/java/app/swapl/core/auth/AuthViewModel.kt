package app.swapl.core.auth

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.swapl.BuildConfig
import app.swapl.core.model.AuthUser
import app.swapl.core.model.TokenResponse
import app.swapl.core.network.ApiClient
import dagger.hilt.android.lifecycle.HiltViewModel
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val api: ApiClient,
    private val tokenStore: TokenStore,
) : ViewModel() {

    var uiState by mutableStateOf(UiState())
        private set

    init {
        if (tokenStore.read() != null) viewModelScope.launch { bootstrap() }
    }

    private suspend fun bootstrap() {
        // /api/me will 401 if the token is bad; we just clear it in that case.
        try {
            val me: MeResponse = api.client.post("${api.baseUrl}/api/me") {
                contentType(ContentType.Application.Json)
            }.body()
            uiState = uiState.copy(session = me.user)
        } catch (_: Throwable) {
            tokenStore.delete()
        }
    }

    fun signIn(email: String, password: String) {
        viewModelScope.launch {
            uiState = uiState.copy(isAuthenticating = true, error = null)
            try {
                val res: TokenResponse = api.client.post("${api.baseUrl}/api/auth/token") {
                    contentType(ContentType.Application.Json)
                    setBody(TokenIssueBody(email, password, "android", BuildConfig.VERSION_NAME))
                }.body()
                tokenStore.write(res.token)
                uiState = uiState.copy(session = res.user, isAuthenticating = false)
            } catch (t: Throwable) {
                uiState = uiState.copy(error = t.message ?: "Sign in failed", isAuthenticating = false)
            }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            runCatching {
                api.client.post("${api.baseUrl}/api/auth/token/revoke")
            }
            tokenStore.delete()
            uiState = UiState()
        }
    }

    @Serializable
    private data class TokenIssueBody(
        val email: String,
        val password: String,
        val platform: String,
        val appVersion: String,
    )

    @Serializable
    private data class MeResponse(val user: AuthUser)

    data class UiState(
        val session: AuthUser? = null,
        val isAuthenticating: Boolean = false,
        val error: String? = null,
    )
}
