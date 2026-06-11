# Swapl release (R8) keep rules.
# Hilt, Compose and Firebase ship consumer rules in their AARs; the rules here
# cover the gaps for Ktor, kotlinx-serialization and Coil.

# --- Kotlinx Serialization ---
# Keep serializers and the synthetic Companion lookup R8 cannot see through.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class app.swapl.**$$serializer { *; }
-keepclassmembers class app.swapl.** {
    *** Companion;
}
-keepclasseswithmembers class app.swapl.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# --- Ktor (OkHttp engine) ---
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**
-dontwarn org.slf4j.**
# OkHttp platform probes for optional TLS providers.
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# --- Kotlin coroutines (used by Ktor/Coil) ---
-keepclassmembers class kotlinx.coroutines.** { volatile <fields>; }
-dontwarn kotlinx.coroutines.debug.**

# --- Coil 3 ---
-dontwarn coil3.**

# --- Hilt / Dagger ---
# AAR consumer rules cover codegen; just silence javax annotations.
-dontwarn javax.annotation.**
