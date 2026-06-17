package app.swapl

import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import org.osmdroid.config.Configuration

@HiltAndroidApp
class SwaplApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // osmdroid needs a unique User-Agent or OSM tile servers reject requests.
        Configuration.getInstance().userAgentValue = packageName
    }
}
