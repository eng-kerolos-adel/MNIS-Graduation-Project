import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/router/app_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/shared_widgets.dart';
import '../../../../core/providers/session_provider.dart';
import '../../../../core/storage/secure_session_store.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen>
    with TickerProviderStateMixin {
  late AnimationController _scaleCtrl;
  late AnimationController _fadeCtrl;
  late Animation<double> _scale;
  late Animation<double> _fade;
  Timer? _splashTimer;
  Completer<void>? _delayCompleter;

  @override
  void initState() {
    super.initState();

    _scaleCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    _fadeCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );

    _scale = Tween<double>(begin: 0.6, end: 1.0).animate(
      CurvedAnimation(parent: _scaleCtrl, curve: Curves.elasticOut),
    );
    _fade = CurvedAnimation(parent: _fadeCtrl, curve: Curves.easeIn);

    _scaleCtrl.forward().then((_) => _fadeCtrl.forward());
    _navigate();
  }

  Future<void> _navigate() async {
    // Run the minimum splash animation time and the session bootstrap (which
    // tries to silently restore a saved login) in parallel, so a slow/absent
    // network never makes the splash screen feel stuck.
    final completer = Completer<void>();
    _delayCompleter = completer;
    _splashTimer = Timer(const Duration(milliseconds: 2200), () {
      if (!completer.isCompleted) completer.complete();
    });
    final sessionFuture = ref.read(sessionControllerProvider.future);
    final user = await sessionFuture.catchError((_) => null);
    await completer.future;
    if (!mounted) return;

    if (user != null) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('onboarding_seen', true);
      if (!mounted) return;
      if (user.mustChangePassword) {
        context.go(AppRoutes.changePassword);
        return;
      }
      // A restored (not freshly password-authenticated) session still has to
      // clear the biometric lock, if the citizen turned it on, before the
      // app shows anything — this is what makes biometric a real re-entry
      // gate instead of a thing that only fires once at setup.
      final biometricOn = await SecureSessionStore.instance.readBiometricEnabled();
      if (!mounted) return;
      context.go(biometricOn ? AppRoutes.appLock : AppRoutes.home);
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    final seen = prefs.getBool('onboarding_seen') ?? false;
    if (!mounted) return;
    if (seen) {
      context.go(AppRoutes.login);
    } else {
      context.go(AppRoutes.onboarding);
    }
  }

  @override
  void dispose() {
    _splashTimer?.cancel();
    if (_delayCompleter != null && !_delayCompleter!.isCompleted) {
      _delayCompleter!.complete();
    }
    _scaleCtrl.dispose();
    _fadeCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: cs.primary,
      body: Stack(
        children: [
          // Ambient glow
          Positioned(
            top: -80,
            right: -80,
            child: Container(
              width: 320,
              height: 320,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: cs.secondary.withOpacity(0.15),
              ),
            ),
          ),
          Positioned(
            bottom: -120,
            left: -80,
            child: Container(
              width: 360,
              height: 360,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.tertiaryFixed.withOpacity(0.1),
              ),
            ),
          ),

          // Center content
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Logo
                ScaleTransition(
                  scale: _scale,
                  child: Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(
                          color: Colors.white.withOpacity(0.3), width: 1.5),
                    ),
                    padding: const EdgeInsets.all(16),
                    child: const MnisShieldLogo(size: 68),
                  ),
                ),
                const SizedBox(height: 28),

                // MNIS text
                FadeTransition(
                  opacity: _fade,
                  child: Column(
                    children: [
                      const Text(
                        'MNIS',
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 36,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          letterSpacing: 4,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'منظومة الهوية الطبية الوطنية',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                          color: Colors.white.withOpacity(0.8),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'National Medical Identity System',
                        style: TextStyle(
                          fontFamily: 'Inter',
                          fontSize: 12,
                          fontWeight: FontWeight.w400,
                          color: Colors.white.withOpacity(0.6),
                          letterSpacing: 0.5,
                        ),
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 60),

                // Loading indicator
                FadeTransition(
                  opacity: _fade,
                  child: SizedBox(
                    width: 120,
                    child: LinearProgressIndicator(
                      backgroundColor: Colors.white.withOpacity(0.2),
                      valueColor:
                          const AlwaysStoppedAnimation<Color>(Colors.white),
                      minHeight: 2,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Bottom government seal
          Positioned(
            bottom: 40,
            left: 0,
            right: 0,
            child: FadeTransition(
              opacity: _fade,
              child: Center(
                child: Text(
                  'جمهورية مصر العربية • وزارة الصحة',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12,
                    color: Colors.white.withOpacity(0.6),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}


