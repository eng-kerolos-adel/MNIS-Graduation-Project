import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/l10n/app_localizations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/utils/providers.dart';
import '../../../../core/providers/session_provider.dart';
import '../../../../core/models/models.dart';
import '../../../../core/router/app_router.dart';

class MainShell extends ConsumerWidget {
  final StatefulNavigationShell shell;
  const MainShell({super.key, required this.shell});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // A refresh failure anywhere in the app (expired/stolen session) clears
    // sessionControllerProvider; bounce straight back to the login screen.
    ref.listen<AsyncValue<SessionUser?>>(sessionControllerProvider, (prev, next) {
      final wasSignedIn = prev?.value != null;
      final signedOutNow = !next.isLoading && next.value == null;
      if (wasSignedIn && signedOutNow) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (context.mounted) context.go(AppRoutes.login);
        });
      }
    });
    final l = AppLocalizations.of(context);
    final cs = Theme.of(context).colorScheme;
    final locale = ref.watch(localeProvider);
    final isAr = locale.languageCode == 'ar';
    final themeMode = ref.watch(themeModeProvider);
    final isDark = themeMode == ThemeMode.dark ||
        (themeMode == ThemeMode.system &&
            MediaQuery.platformBrightnessOf(context) == Brightness.dark);

    final navItems = [
      (icon: Icons.home_rounded, label: l.navHome),
      (icon: Icons.folder_shared_rounded, label: l.navMedical),
      (icon: Icons.biotech_rounded, label: l.navLab),
      (icon: Icons.medication_rounded, label: l.navRx),
      (icon: Icons.qr_code_2_rounded, label: l.navQr),
    ];

    return Directionality(
      textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
      child: Scaffold(
        body: shell,
        bottomNavigationBar: Container(
          decoration: BoxDecoration(
            color: isDark
                ? AppColors.surfaceContainerLowDark
                : AppColors.surfaceContainerLowest,
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withOpacity(0.08),
                blurRadius: 16,
                offset: const Offset(0, -4),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: SizedBox(
              height: 68,
              child: Row(
                children: List.generate(navItems.length, (i) {
                  final selected = shell.currentIndex == i;
                  final item = navItems[i];
                  return Expanded(
                    child: InkWell(
                      onTap: () => shell.goBranch(i),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // Icon with indicator
                            AnimatedContainer(
                              duration: const Duration(milliseconds: 250),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 16, vertical: 4),
                              decoration: BoxDecoration(
                                color: selected
                                    ? cs.primaryContainer.withOpacity(0.35)
                                    : Colors.transparent,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(
                                item.icon,
                                size: 24,
                                color: selected
                                    ? cs.primary
                                    : cs.onSurfaceVariant,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              item.label,
                              style: TextStyle(
                                fontFamily: 'Cairo',
                                fontSize: 10,
                                fontWeight: selected
                                    ? FontWeight.w700
                                    : FontWeight.w400,
                                color: selected
                                    ? cs.primary
                                    : cs.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ),
          ),
        ),
      ),
    );
  }
}


