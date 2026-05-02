package app.swapl.core.push

import android.util.Log
import app.swapl.core.network.ApiClient
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

// Receives FCM messages and registers / re-registers the token with /api/devices.
// The notification payload's `deepLink` (e.g. swapl://swaps/<id>) is opened
// when the user taps the system notification — handled by MainActivity's
// intent-filter for the `swapl` scheme.
@AndroidEntryPoint
class SwaplFirebaseService : FirebaseMessagingService() {

    @Inject lateinit var api: ApiClient

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                api.client.post("${api.baseUrl}/api/devices") {
                    contentType(ContentType.Application.Json)
                    setBody(DeviceBody(platform = "android", pushToken = token))
                }
            }.onFailure { Log.e("swapl/push", "register failed", it) }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // The system already shows a notification when the payload contains a
        // `notification` field. We only receive `onMessageReceived` while the
        // app is in foreground; defer to default presentation for now.
    }

    @Serializable
    private data class DeviceBody(val platform: String, val pushToken: String)
}
