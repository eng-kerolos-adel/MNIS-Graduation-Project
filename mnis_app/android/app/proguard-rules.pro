# flutter_secure_storage (AndroidX Security / Keystore-backed EncryptedSharedPreferences)
-keep class androidx.security.crypto.** { *; }

# local_auth (biometric prompt bridging)
-keep class androidx.biometric.** { *; }

# Play Core (Flutter's deferred-components hook; harmless to keep even if unused)
-keep class com.google.android.play.core.** { *; }
-dontwarn com.google.android.play.core.**
