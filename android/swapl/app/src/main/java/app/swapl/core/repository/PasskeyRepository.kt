package app.swapl.core.repository

import app.swapl.core.network.ApiClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import javax.inject.Inject
import javax.inject.Singleton

// WebAuthn passkeys — thin wrapper over the /api/auth/passkey/* routes.
//
// Options come back as the raw W3C JSON document that androidx.credentials
// wants verbatim (CreatePublicKeyCredentialRequest / GetPublicKeyCredentialOption
// both take `requestJson` as a string), so there are no model types on this
// side: pass the server's JSON through untouched in both directions.
@Singleton
class PasskeyRepository @Inject constructor(private val api: ApiClient) {

    /** Anonymous: starts a usernameless login; feed straight into GetPublicKeyCredentialOption. */
    suspend fun loginOptionsJson(): String =
        api.client.post("${api.baseUrl}/api/auth/passkey/login/options").bodyAsText()

    /** Authenticated: starts adding a passkey to the signed-in account. */
    suspend fun registrationOptionsJson(): String =
        api.client.post("${api.baseUrl}/api/auth/passkey/register/options").bodyAsText()

    /** Authenticated: persists the attestation Credential Manager produced. */
    suspend fun completeRegistration(registrationResponseJson: String, name: String?) {
        // The route wants { response: <attestation>, name? } — re-wrap the raw
        // JSON string from CreatePublicKeyCredentialResponse.
        val response = Json.parseToJsonElement(registrationResponseJson)
        api.client.post("${api.baseUrl}/api/auth/passkey/register/verify") {
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("response", response)
                if (!name.isNullOrBlank()) put("name", JsonPrimitive(name))
            })
        }
    }
}
