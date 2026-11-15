import 'package:flutter/foundation.dart';

/// Where the app talks to the MNIS backend.
///
/// Automatically selects `http://10.0.2.2:3001` on Android Emulator and
/// `http://localhost:3001` on Web / Windows / macOS / iOS Simulator, unless
/// overridden via `--dart-define=API_BASE_URL=...`.
abstract class Env {
  static const String _defined = String.fromEnvironment('API_BASE_URL');

  static String get apiBaseUrl {
    if (_defined.isNotEmpty) return _defined;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3001';
    }
    return 'http://localhost:3001';
  }
}
