package app.swapl.core.network

import app.swapl.BuildConfig
import app.swapl.core.auth.TokenStore
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.request.headers
import io.ktor.http.HttpHeaders
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ApiClient @Inject constructor(private val tokenStore: TokenStore) {
    val baseUrl: String = BuildConfig.API_BASE_URL

    val client: HttpClient = HttpClient(OkHttp) {
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                isLenient = true
            })
        }
        defaultRequest {
            headers {
                tokenStore.read()?.let { append(HttpHeaders.Authorization, "Bearer $it") }
                append(HttpHeaders.Accept, "application/json")
            }
        }
    }
}
