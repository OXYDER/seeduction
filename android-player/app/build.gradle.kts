import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Signature : ni le coffre de clés ni ses mots de passe ne sont dans le dépôt. Ils viennent de android-player/keystore.properties (ignoré par git) ou de variables d'environnement.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun secret(name: String, env: String): String? = keystoreProps.getProperty(name) ?: System.getenv(env)

android {
    namespace = "org.seeduction.player"
    compileSdk = 34

    defaultConfig {
        applicationId = "org.seeduction.player"
        minSdk = 24
        targetSdk = 34
        versionCode = 2
        versionName = "1.1.0"
        // Les téléphones d'aujourd'hui : 64 bits (la grande majorité) et 32 bits (anciens modèles). Pas x86 : l'APK serait bien plus gros.
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
        buildConfigField("String", "SITE_BASE_URL", "\"https://seeduction.org\"")
    }

    signingConfigs {
        val store = secret("storeFile", "SEEDUCTION_KEYSTORE")
        if (store != null && file(store).exists()) {
            create("release") {
                storeFile = file(store)
                storePassword = secret("storePassword", "SEEDUCTION_KEYSTORE_PASSWORD")
                keyAlias = secret("keyAlias", "SEEDUCTION_KEY_ALIAS") ?: "seeduction"
                keyPassword = secret("keyPassword", "SEEDUCTION_KEY_PASSWORD") ?: secret("storePassword", "SEEDUCTION_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false // libVLC et libtorrent passent par JNI : pas de réduction de code
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { jniLibs { useLegacyPackaging = true } }
    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    // Client BitTorrent (libtorrent) et lecteur vidéo (VLC) : les deux savent tout lire, comme le lecteur Windows.
    implementation("org.libtorrent4j:libtorrent4j:2.1.0-39")
    implementation("org.libtorrent4j:libtorrent4j-android-arm64:2.1.0-39")
    implementation("org.libtorrent4j:libtorrent4j-android-arm:2.1.0-39")
    implementation("org.videolan.android:libvlc-all:3.6.5")
    // Petit serveur HTTP local qui sert le fichier en cours de téléchargement à VLC.
    implementation("org.nanohttpd:nanohttpd:2.3.1")

    // Essais sur le PC : le vrai moteur BitTorrent (libtorrent pour Windows) contre un seeder local, sans téléphone.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.libtorrent4j:libtorrent4j-windows:2.1.0-39")
}

// Essais sur le PC : la bibliothèque native libtorrent pour Windows est dans le jar « libtorrent4j-windows » ; on l'en sort pour que la JVM de test la trouve.
val nativeTestDir = layout.buildDirectory.dir("native-test")
val extractTestNative by tasks.registering(Copy::class) {
    val jar = configurations.detachedConfiguration(dependencies.create("org.libtorrent4j:libtorrent4j-windows:2.1.0-39")).files
    from(jar.map { zipTree(it) }) { include("lib/x86_64/*.dll"); eachFile { path = name } ; includeEmptyDirs = false }
    into(nativeTestDir)
}
tasks.withType<Test>().configureEach {
    dependsOn(extractTestNative)
    doFirst { systemProperty("java.library.path", nativeTestDir.get().asFile.absolutePath) }
}
