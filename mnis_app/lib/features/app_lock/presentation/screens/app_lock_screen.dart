import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:local_auth/local_auth.dart';

import '../../../../core/l10n/app_localizations.dart';
import '../../../../core/providers/app_lock_provider.dart';
import '../../../../core/providers/session_provider.dart';
import '../../../../core/router/app_router.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/utils/providers.dart';
import '../../../../core/utils/shared_widgets.dart';

/// The single real implementation of biometric authentication in the app.
/// Reached two ways:
///  1. From the splash screen, right after a session was silently restored
///     from the stored refresh token (the normal "reopen the app" path).
///  2. From the login screen's "unlock with biometric" button, when no
///     session is currently loaded (e.g. the silent restore failed because
///     there was no signal at launch) — in that case this screen performs
///     the restore itself once the fingerprint/face check passes.
/// Also re-shown automatically whenever the app returns from the background
/// (see AppLifecycleGate in main.dart), so it behaves like a real app lock
/// and not a one-time gate.
class AppLockScreen extends ConsumerStatefulWidget {
  const AppLockScreen({super.key});

  @override
  ConsumerState<AppLockScreen> createState() => _AppLockScreenState();
}

class _AppLockScreenState extends ConsumerState<AppLockScreen> {
  final _localAuth = LocalAuthentication();
  bool _checking = false;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _attempt());
  }

  Future<void> _attempt() async {
    if (_checking) return;
    setState(() {
      _checking = true;
      _failed = false;
    });
    final isAr = ref.read(localeProvider).languageCode == 'ar';
    bool ok = false;
    try {
      ok = await _localAuth.authenticate(
        localizedReason: isAr
            ? 'أثبت هويتك لفتح تطبيق MNIS'
            : 'Verify your identity to unlock MNIS',
        biometricOnly: true,
        persistAcrossBackgrounding: true,
      );
    } on PlatformException {
      ok = false;
    }

    if (!mounted) return;

    if (!ok) {
      setState(() {
        _checking = false;
        _failed = true;
      });
      return;
    }

    // Already-restored session (the normal splash path) → just unlock.
    final current = ref.read(sessionControllerProvider).value;
    if (current != null) {
      ref.read(appUnlockedProvider.notifier).state = true;
      if (mounted) {
        context.go(current.mustChangePassword
            ? AppRoutes.changePassword
            : AppRoutes.home);
      }
      return;
    }

    // No session yet (reached from the login screen's fallback button) —
    // the fingerprint only proves "this is the phone's owner"; it still has
    // to redeem the stored refresh token to actually get a session.
    final restored = await ref
        .read(sessionControllerProvider.notifier)
        .restoreForBiometric();
    if (!mounted) return;
    if (restored == null) {
      setState(() {
        _checking = false;
        _failed = true;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(AppLocalizations.of(context).biometricNoSession)),
      );
      return;
    }
    ref.read(appUnlockedProvider.notifier).state = true;
    context.go(restored.mustChangePassword
        ? AppRoutes.changePassword
        : AppRoutes.home);
  }

  Future<void> _usePasswordInstead() async {
    await ref.read(sessionControllerProvider.notifier).logout();
    if (mounted) context.go(AppRoutes.login);
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final cs = Theme.of(context).colorScheme;
    final isAr = ref.watch(localeProvider).languageCode == 'ar';

    return PopScope(
      // You cannot "back" your way past the lock screen — the only way out
      // is a successful unlock or explicitly switching to password sign-in.
      canPop: false,
      child: Scaffold(
        backgroundColor: cs.surface,
        body: SafeArea(
          child: Directionality(
            textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const MnisShieldLogo(size: 64),
                    const SizedBox(height: 24),
                    Text(l.appLockedTitle,
                        style: AppTypography.headlineMd
                            .copyWith(color: cs.onSurface),
                        textAlign: TextAlign.center),
                    const SizedBox(height: 8),
                    Text(l.appLockedSubtitle,
                        style: AppTypography.bodyMd
                            .copyWith(color: cs.onSurfaceVariant),
                        textAlign: TextAlign.center),
                    const SizedBox(height: 32),
                    GestureDetector(
                      onTap: _checking ? null : _attempt,
                      child: Container(
                        width: 96,
                        height: 96,
                        decoration: BoxDecoration(
                          color: _failed
                              ? cs.errorContainer
                              : cs.secondaryContainer,
                          shape: BoxShape.circle,
                        ),
                        child: _checking
                            ? Padding(
                                padding: const EdgeInsets.all(28),
                                child: CircularProgressIndicator(
                                    strokeWidth: 2.5, color: cs.secondary),
                              )
                            : Icon(
                                _failed
                                    ? Icons.lock_outline_rounded
                                    : Icons.fingerprint_rounded,
                                size: 48,
                                color: _failed ? cs.error : cs.secondary,
                              ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      _failed ? l.biometricFailed : l.tapToUnlock,
                      style: AppTypography.labelLg.copyWith(
                          color: _failed ? cs.error : cs.onSurfaceVariant),
                    ),
                    const SizedBox(height: 32),
                    TextButton(
                      onPressed: _usePasswordInstead,
                      child: Text(l.usePasswordInstead,
                          style: AppTypography.labelLg
                              .copyWith(color: cs.secondary)),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
