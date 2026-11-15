import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';

/// Whether the biometric app-lock gate has been passed **in this process
/// lifetime**. Always starts `false` on a cold start and is reset to `false`
/// whenever the app comes back from the background (see AppLifecycleGate in
/// main.dart) — that's what makes this a real re-entry lock rather than a
/// one-time check that never fires again.
final appUnlockedProvider = StateProvider<bool>((ref) => false);


