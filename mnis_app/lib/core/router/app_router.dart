import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/splash/presentation/screens/splash_screen.dart';
import '../../features/onboarding/presentation/screens/onboarding_screen.dart';
import '../../features/auth/presentation/screens/login_screen.dart';
import '../../features/home/presentation/screens/main_shell.dart';
import '../../features/home/presentation/screens/home_screen.dart';
import '../../features/medical_file/presentation/screens/medical_file_screen.dart';
import '../../features/lab_results/presentation/screens/lab_results_screen.dart';
import '../../features/prescriptions/presentation/screens/prescriptions_screen.dart';
import '../../features/emergency_qr/presentation/screens/emergency_qr_screen.dart';
import '../../features/auth/presentation/screens/change_password_screen.dart';
import '../../features/appointments/presentation/screens/appointments_screen.dart';
import '../../features/share_record/presentation/screens/share_record_screen.dart';
import '../../features/app_lock/presentation/screens/app_lock_screen.dart';
import '../../features/documents/presentation/screens/documents_screen.dart';
import '../../features/notifications/presentation/screens/notifications_screen.dart';

abstract class AppRoutes {
  static const splash = '/';
  static const onboarding = '/onboarding';
  static const login = '/login';
  static const home = '/home';
  static const medicalFile = '/medical-file';
  static const labResults = '/lab-results';
  static const prescriptions = '/prescriptions';
  static const emergencyQr = '/emergency-qr';
  static const shell = '/shell';
  static const changePassword = '/change-password';
  static const appointments = '/appointments';
  static const shareRecord = '/share-record';
  static const appLock = '/app-lock';
  static const documents = '/documents';
  static const notifications = '/notifications';
}

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: AppRoutes.splash,
    debugLogDiagnostics: false,
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        pageBuilder: (context, state) => _fadeTransition(
          key: state.pageKey,
          child: const SplashScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.onboarding,
        pageBuilder: (context, state) => _slideTransition(
          key: state.pageKey,
          child: const OnboardingScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.login,
        pageBuilder: (context, state) => _slideTransition(
          key: state.pageKey,
          child: const LoginScreen(),
        ),
      ),
      // Emergency QR available without auth
      GoRoute(
        path: AppRoutes.emergencyQr,
        pageBuilder: (context, state) {
          final fromLogin =
              state.uri.queryParameters['fromLogin'] == 'true';
          return _slideTransition(
            key: state.pageKey,
            child: EmergencyQrScreen(fromLogin: fromLogin),
          );
        },
      ),
      GoRoute(
        path: AppRoutes.changePassword,
        pageBuilder: (context, state) => _slideTransition(
          key: state.pageKey,
          child: const ChangePasswordScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.appointments,
        pageBuilder: (context, state) => _slideTransition(
          key: state.pageKey,
          child: const AppointmentsScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.appLock,
        pageBuilder: (context, state) => _slideTransition(
          key: state.pageKey,
          child: const AppLockScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.documents,
        pageBuilder: (context, state) => _slideTransition(
          key: state.pageKey,
          child: const DocumentsScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.notifications,
        pageBuilder: (context, state) => _slideTransition(
          key: state.pageKey,
          child: const NotificationsScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.shareRecord,
        pageBuilder: (context, state) => _slideTransition(
          key: state.pageKey,
          child: const ShareRecordScreen(),
        ),
      ),
      // Main shell with bottom navigation
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => MainShell(shell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.home,
                pageBuilder: (context, state) => NoTransitionPage(
                  key: state.pageKey,
                  child: const HomeScreen(),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.medicalFile,
                pageBuilder: (context, state) => NoTransitionPage(
                  key: state.pageKey,
                  child: const MedicalFileScreen(),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.labResults,
                pageBuilder: (context, state) => NoTransitionPage(
                  key: state.pageKey,
                  child: const LabResultsScreen(),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.prescriptions,
                pageBuilder: (context, state) => NoTransitionPage(
                  key: state.pageKey,
                  child: const PrescriptionsScreen(),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/qr-tab',
                pageBuilder: (context, state) => NoTransitionPage(
                  key: state.pageKey,
                  child: const EmergencyQrScreen(fromLogin: false),
                ),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

CustomTransitionPage<void> _fadeTransition({
  required LocalKey key,
  required Widget child,
}) {
  return CustomTransitionPage<void>(
    key: key,
    child: child,
    transitionDuration: const Duration(milliseconds: 400),
    transitionsBuilder: (context, animation, secondaryAnimation, child) =>
        FadeTransition(opacity: animation, child: child),
  );
}

CustomTransitionPage<void> _slideTransition({
  required LocalKey key,
  required Widget child,
}) {
  return CustomTransitionPage<void>(
    key: key,
    child: child,
    transitionDuration: const Duration(milliseconds: 350),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      final tween = Tween(
        begin: const Offset(1.0, 0.0),
        end: Offset.zero,
      ).chain(CurveTween(curve: Curves.easeOutCubic));
      return SlideTransition(position: animation.drive(tween), child: child);
    },
  );
}


