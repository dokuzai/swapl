// Thin Android library wrapper around the generated SwaplTokens.kt.
// Source remains at packages/design-tokens/build/kotlin/SwaplTokens.kt; we
// copy it into this module's `src/main/java/...` via a sync task so AGP can
// see it without needing symlinks (which break on Windows).
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.swapl.designtokens"
    compileSdk = 35
    defaultConfig { minSdk = 26 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.10.01"))
    implementation("androidx.compose.ui:ui")
}

// Sync the generated tokens file from the design-tokens package into this
// module's source tree before each build.
tasks.register<Copy>("syncTokens") {
    from(file("../design-tokens/build/kotlin"))
    include("SwaplTokens.kt")
    into("src/main/java/app/swapl/designtokens")
}
tasks.named("preBuild").configure { dependsOn("syncTokens") }
