package app.swapl.core.push

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.util.Log
import app.swapl.MainActivity
import app.swapl.R
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
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
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

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        scope.launch { registerToken(token) }
    }

    // POST the token to /api/devices, retrying with linear backoff: cold-start
    // token refreshes often race the first network/auth availability.
    private suspend fun registerToken(token: String) {
        repeat(MAX_REGISTER_ATTEMPTS) { attempt ->
            val result = runCatching {
                api.client.post("${api.baseUrl}/api/devices") {
                    contentType(ContentType.Application.Json)
                    setBody(DeviceBody(platform = "android", pushToken = token))
                }
            }
            if (result.isSuccess) return
            Log.w("swapl/push", "register attempt ${attempt + 1} failed", result.exceptionOrNull())
            delay(REGISTER_RETRY_BASE_MS * (attempt + 1))
        }
        Log.e("swapl/push", "register failed after $MAX_REGISTER_ATTEMPTS attempts")
    }

    // Called while the app is in foreground (and for data-only payloads in
    // background): surface a system notification whose tap opens the payload's
    // deep link via MainActivity's `swapl`/`swapl.fun` intent-filters.
    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: return
        val body = message.notification?.body ?: message.data["body"]
        val deepLink = (message.data["deepLink"] ?: message.notification?.link?.toString())
            ?.let { raw -> runCatching { Uri.parse(raw) }.getOrNull() }
        showNotification(title, body, deepLink)
    }

    private fun showNotification(title: String, body: String?, deepLink: Uri?) {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (!manager.areNotificationsEnabled()) return

        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Swaps & messages", NotificationManager.IMPORTANCE_DEFAULT)
        )

        val contentIntent = Intent(this, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = deepLink
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val pending = PendingIntent.getActivity(
            this,
            deepLink?.hashCode() ?: 0,
            contentIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        val notification = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_swapl)
            .setContentTitle(title)
            .apply { body?.let { setContentText(it) } }
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()

        manager.notify(deepLink?.hashCode() ?: System.currentTimeMillis().toInt(), notification)
    }

    @Serializable
    private data class DeviceBody(val platform: String, val pushToken: String)

    private companion object {
        const val CHANNEL_ID = "swapl_default"
        const val MAX_REGISTER_ATTEMPTS = 4
        const val REGISTER_RETRY_BASE_MS = 2_000L
    }
}
