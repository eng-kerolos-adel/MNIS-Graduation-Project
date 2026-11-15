import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../l10n/app_localizations.dart';
import '../models/models.dart';
import '../providers/data_providers.dart';
import '../providers/session_provider.dart';
import '../router/app_router.dart';
import '../theme/app_typography.dart';
import '../utils/providers.dart';
import 'patient_avatar.dart';

/// The account/profile bottom sheet reachable from the avatar button on every
/// main screen: who's signed in, quick links, change password and sign out.
Future<void> showAccountSheet(BuildContext context, WidgetRef ref) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => const _AccountSheet(),
  );
}

class _AccountSheet extends ConsumerWidget {
  const _AccountSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final cs = Theme.of(context).colorScheme;
    final isAr = ref.watch(localeProvider).languageCode == 'ar';
    final session = ref.watch(sessionControllerProvider).value;
    final profileAsync = ref.watch(profileProvider);

    return SafeArea(
      child: Container(
        margin: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: cs.surfaceContainerLowest,
          borderRadius: BorderRadius.circular(24),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: cs.outlineVariant,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Row(
              children: [
                PatientAvatar(
                  url: profileAsync.value?.photoUrl,
                  size: 52,
                  borderRadius: BorderRadius.circular(14),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        profileAsync.value?.fullName.pick(
                                Locale(isAr ? 'ar' : 'en')) ??
                            (isAr ? session?.fullNameAr : session?.fullNameEn) ??
                            '',
                        style: AppTypography.headlineSm
                            .copyWith(color: cs.onSurface),
                      ),
                      if (profileAsync.value != null)
                        Text('MTI: ${profileAsync.value!.mti}',
                            style: AppTypography.labelSm
                                .copyWith(color: cs.onSurfaceVariant)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            const Divider(height: 1),
            _Tile(
              icon: Icons.event_available_rounded,
              label: l.appointmentsMenu,
              onTap: () {
                Navigator.pop(context);
                context.push(AppRoutes.appointments);
              },
            ),
            _Tile(
              icon: Icons.qr_code_rounded,
              label: l.shareWithDoctor,
              onTap: () {
                Navigator.pop(context);
                context.push(AppRoutes.shareRecord);
              },
            ),
            _Tile(
              icon: Icons.upload_file_rounded,
              label: l.myDocuments,
              onTap: () {
                Navigator.pop(context);
                context.push(AppRoutes.documents);
              },
            ),
            _Tile(
              icon: Icons.password_rounded,
              label: l.changePassword,
              onTap: () {
                Navigator.pop(context);
                context.push(AppRoutes.changePassword);
              },
            ),
            _Tile(
              icon: Icons.logout_rounded,
              label: l.logout,
              destructive: true,
              onTap: () async {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: Text(l.logoutConfirmTitle),
                    content: Text(l.logoutConfirmBody),
                    actions: [
                      TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: Text(l.cancel)),
                      FilledButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: Text(l.logout)),
                    ],
                  ),
                );
                if (confirm != true) return;
                await ref.read(sessionControllerProvider.notifier).logout();
                if (context.mounted) {
                  Navigator.pop(context);
                  context.go(AppRoutes.login);
                }
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool destructive;
  const _Tile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.destructive = false,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final color = destructive ? cs.error : cs.onSurface;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: destructive ? cs.error : cs.secondary),
      title: Text(label, style: AppTypography.bodyMd.copyWith(color: color)),
      onTap: onTap,
    );
  }
}


