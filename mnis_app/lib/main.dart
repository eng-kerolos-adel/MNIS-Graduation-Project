import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/l10n/app_localizations.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'core/utils/providers.dart';
import 'core/providers/app_lock_provider.dart';
import 'core/providers/session_provider.dart';
import 'core/storage/secure_session_store.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Lock to portrait
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Transparent status bar
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.dark,
  ));

  runApp(const ProviderScope(child: MnisApp()));
}

class MnisApp extends ConsumerStatefulWidget {
  const MnisApp({super.key});

  @override
  ConsumerState<MnisApp> createState() => _MnisAppState();
}

class _MnisAppState extends ConsumerState<MnisApp> with WidgetsBindingObserver {
  AppLifecycleState? _lastState;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Re-lock whenever the app comes back from the background. This is what
    // makes biometric a real app lock rather than a check that only ever
    // runs once right after login. A momentary `inactive` (an incoming call
    // alert, the iOS app switcher) does not count as "backgrounded" — only
    // actually leaving (`paused`) and returning does.
    final wasBackgrounded = _lastState == AppLifecycleState.paused;
    _lastState = state;
    if (state != AppLifecycleState.resumed || !wasBackgrounded) return;

    SecureSessionStore.instance.readBiometricEnabled().then((enabled) {
      if (!enabled) return;
      final hasSession = ref.read(sessionControllerProvider).value != null;
      if (!hasSession) return;
      ref.read(appUnlockedProvider.notifier).state = false;
      ref.read(routerProvider).go(AppRoutes.appLock);
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);
    final locale = ref.watch(localeProvider);

    return MaterialApp.router(
      title: 'MNIS — منظومة الهوية الطبية الوطنية',
      debugShowCheckedModeBanner: false,

      // Theming
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: themeMode,

      // Localizations
      locale: locale,
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],

      // Router
      routerConfig: router,
    );
  }
}


