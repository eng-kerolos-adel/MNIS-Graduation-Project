package com.kerolosadel.mnis_app

import io.flutter.embedding.android.FlutterFragmentActivity

// local_auth (fingerprint/Face unlock) shows its prompt via Android's
// BiometricPrompt, which only works inside a FragmentActivity. The default
// Flutter template uses plain FlutterActivity, which has no fragment host —
// on that base class, every authenticate() call fails (usually silently, or
// with a "no_fragment_activity" platform exception), no matter how correct
// the Dart-side code is. This was the real reason biometric never worked.
class MainActivity : FlutterFragmentActivity()
