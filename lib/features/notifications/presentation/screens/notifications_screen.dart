import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' hide TextDirection;

import '../../../../core/l10n/app_localizations.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/utils/providers.dart';
import '../../../../core/providers/notifications_provider.dart';
import '../../../../core/widgets/async_view.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final cs = Theme.of(context).colorScheme;
    final locale = ref.watch(localeProvider);
    final isAr = locale.languageCode == 'ar';
    final notifsAsync = ref.watch(notificationsProvider);

    return Scaffold(
      backgroundColor: cs.surface,
      appBar: AppBar(
        title: Text(isAr ? "الإشعارات" : "Notifications",
            style: AppTypography.headlineMd.copyWith(color: cs.onSurface)),
        backgroundColor: cs.surface,
        elevation: 0,
        iconTheme: IconThemeData(color: cs.onSurface),
      ),
      body: Directionality(
        textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
        child: AsyncValueView(
          isAr: isAr,
          value: notifsAsync,
          onRetry: () => ref.invalidate(notificationsProvider),
          builder: (context, notifs) {
            if (notifs.isEmpty) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.notifications_off_outlined,
                        size: 64, color: cs.onSurfaceVariant.withOpacity(0.5)),
                    const SizedBox(height: 16),
                    Text(
                        isAr
                            ? "لا توجد إشعارات حالياً"
                            : "No notifications yet",
                        style: AppTypography.bodyMd
                            .copyWith(color: cs.onSurfaceVariant)),
                  ],
                ),
              );
            }
            return RefreshIndicator(
              onRefresh: () async => ref.refresh(notificationsProvider.future),
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: notifs.length,
                itemBuilder: (context, index) {
                  final n = notifs[index];
                  final isUnread = n.readAt == null;
                  return Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(
                        color: isUnread
                            ? AppColors.primary.withOpacity(0.3)
                            : cs.outlineVariant.withOpacity(0.5),
                        width: isUnread ? 1.5 : 1,
                      ),
                    ),
                    color: isUnread
                        ? AppColors.primary.withOpacity(0.05)
                        : cs.surfaceContainerLowest,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () {
                        if (isUnread) {
                          ref
                              .read(notificationsProvider.notifier)
                              .markRead(n.id);
                        }
                      },
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: isUnread
                                    ? AppColors.primary
                                    : cs.surfaceContainer,
                                shape: BoxShape.circle,
                              ),
                              child: Icon(
                                Icons.notifications_active_rounded,
                                size: 20,
                                color: isUnread
                                    ? AppColors.onPrimary
                                    : cs.onSurfaceVariant,
                              ),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    n.title.pick(locale),
                                    style: AppTypography.bodySm.copyWith(
                                      fontWeight: isUnread
                                          ? FontWeight.w700
                                          : FontWeight.w600,
                                      color: cs.onSurface,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    n.body.pick(locale),
                                    style: AppTypography.bodySm
                                        .copyWith(color: cs.onSurfaceVariant),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    DateFormat.yMMMd(locale.languageCode)
                                        .add_jm()
                                        .format(n.sentAt),
                                    style: AppTypography.labelSm.copyWith(
                                        color: cs.onSurfaceVariant
                                            .withOpacity(0.7)),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            );
          },
        ),
      ),
    );
  }
}
