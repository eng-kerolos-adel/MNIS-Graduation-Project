import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:qr_flutter/qr_flutter.dart';

import '../../../../core/l10n/app_localizations.dart';
import '../../../../core/models/appointment_models.dart';
import '../../../../core/models/models.dart';
import '../../../../core/providers/data_providers.dart';
import '../../../../core/router/app_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/utils/providers.dart';
import '../../../../core/utils/shared_widgets.dart';
import '../../../../core/widgets/account_sheet.dart';
import '../../../../core/widgets/async_view.dart';
import '../../../../core/widgets/patient_avatar.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final cs = Theme.of(context).colorScheme;
    final locale = ref.watch(localeProvider);
    final isAr = locale.languageCode == 'ar';
    final themeMode = ref.watch(themeModeProvider);
    final isDark = themeMode == ThemeMode.dark ||
        (themeMode == ThemeMode.system &&
            MediaQuery.platformBrightnessOf(context) == Brightness.dark);
    final profileAsync = ref.watch(profileProvider);

    return Scaffold(
      backgroundColor: cs.surface,
      body: Directionality(
        textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(profileProvider);
            ref.invalidate(dashboardStatsProvider);
            ref.invalidate(summaryHubProvider);
            ref.invalidate(emergencyCardProvider);
            await ref.read(profileProvider.future).catchError((_) => null);
          },
          child: CustomScrollView(
            slivers: [
              SliverAppBar(
                pinned: true,
                floating: false,
                backgroundColor: cs.surface.withOpacity(0.9),
                surfaceTintColor: Colors.transparent,
                elevation: 0,
                scrolledUnderElevation: 1,
                shadowColor: AppColors.primary.withOpacity(0.08),
                title: Row(
                  children: [
                    const MnisShieldLogo(size: 32),
                    const SizedBox(width: 10),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('MNIS',
                            style: AppTypography.headlineSm
                                .copyWith(color: cs.primary, height: 1)),
                        Text('Home',
                            style: AppTypography.labelSm
                                .copyWith(color: cs.onSurfaceVariant)),
                      ],
                    ),
                  ],
                ),
                actions: [
                  IconButton(
                    icon: Icon(Icons.notifications_outlined, color: cs.onSurfaceVariant),
                    onPressed: () => context.push('/notifications'),
                  ),
                  IconButton(
                    icon: Icon(
                      isDark ? Icons.light_mode_rounded : Icons.dark_mode_rounded,
                      color: cs.onSurfaceVariant,
                    ),
                    onPressed: () {
                      ref.read(themeModeProvider.notifier).state =
                          isDark ? ThemeMode.light : ThemeMode.dark;
                    },
                  ),
                  GestureDetector(
                    onTap: () {
                      ref.read(localeProvider.notifier).state =
                          isAr ? const Locale('en') : const Locale('ar');
                    },
                    child: Container(
                      margin: const EdgeInsets.only(left: 4, right: 8),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: cs.surfaceContainerHigh,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(isAr ? 'EN' : 'ع',
                          style: AppTypography.labelMd
                              .copyWith(color: cs.primary)),
                    ),
                  ),
                  GestureDetector(
                    onTap: () => showAccountSheet(context, ref),
                    child: Container(
                      margin: const EdgeInsets.only(left: 12, right: 4),
                      child: PatientAvatar(
                        url: profileAsync.value?.photoUrl,
                        size: 32,
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                ],
              ),
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    const SizedBox(height: 12),
                    _GreetingBar(l: l, cs: cs, isAr: isAr, profileAsync: profileAsync),
                    const SizedBox(height: 16),
                    AsyncValueView<PatientProfile>(
                      value: profileAsync,
                      isAr: isAr,
                      onRetry: () => ref.invalidate(profileProvider),
                      builder: (context, patient) =>
                          _MedicalIdentityCard(l: l, cs: cs, patient: patient, locale: locale),
                    ),
                    Consumer(builder: (context, ref, _) {
                      final hubAsync = ref.watch(summaryHubProvider);
                      final ticket = hubAsync.value?['activeQueueTicket'];
                      if (ticket is! Map<String, dynamic>) {
                        return const SizedBox.shrink();
                      }
                      return Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: _LiveQueueTicketCard(
                          cs: cs,
                          isAr: isAr,
                          ticket: ticket,
                          onRefresh: () => ref.invalidate(summaryHubProvider),
                        ),
                      );
                    }),
                    const SizedBox(height: 16),
                    Consumer(builder: (context, ref, _) {
                      final stats = ref.watch(dashboardStatsProvider);
                      return AsyncValueView<DashboardStats>(
                        value: stats,
                        isAr: isAr,
                        loadingHeight: 96,
                        onRetry: () => ref.invalidate(dashboardStatsProvider),
                        builder: (context, s) =>
                            _QuickStats(l: l, cs: cs, isAr: isAr, stats: s),
                      );
                    }),
                    const SizedBox(height: 16),
                    _QuickAccessGrid(l: l, cs: cs),
                    const SizedBox(height: 16),
                    AsyncValueView<PatientProfile>(
                      value: profileAsync,
                      isAr: isAr,
                      loadingHeight: 96,
                      builder: (context, patient) => Consumer(builder: (context, ref, _) {
                        final timeline = ref.watch(timelineProvider);
                        return AsyncValueView<List<TimelineEntry>>(
                          value: timeline,
                          isAr: isAr,
                          loadingHeight: 96,
                          builder: (context, entries) => _RecentActivity(
                            l: l, cs: cs, isAr: isAr, locale: locale,
                            entries: entries, patient: patient,
                          ),
                        );
                      }),
                    ),
                    const SizedBox(height: 24),
                  ]),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _GreetingBar extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final bool isAr;
  final AsyncValue<PatientProfile> profileAsync;
  const _GreetingBar(
      {required this.l, required this.cs, required this.isAr, required this.profileAsync});

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final formatted =
        DateFormat.yMMMMEEEEd(isAr ? 'ar' : 'en').format(now);
    final firstName = profileAsync.value?.fullName
        .pick(Locale(isAr ? 'ar' : 'en'))
        .split(' ')
        .first;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          firstName == null
              ? l.greeting
              : (isAr ? 'مرحباً، $firstName' : 'Hello, $firstName'),
          style: AppTypography.headlineLg.copyWith(color: cs.onSurface),
        ),
        const SizedBox(height: 2),
        Text(formatted,
            style: AppTypography.bodySm.copyWith(color: cs.onSurfaceVariant)),
      ],
    );
  }
}

class _MedicalIdentityCard extends StatefulWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final PatientProfile patient;
  final Locale locale;
  const _MedicalIdentityCard(
      {required this.l, required this.cs, required this.patient, required this.locale});

  @override
  State<_MedicalIdentityCard> createState() => _MedicalIdentityCardState();
}

class _MedicalIdentityCardState extends State<_MedicalIdentityCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final l = widget.l;
    final cs = widget.cs;
    final patient = widget.patient;
    final isAr = widget.locale.languageCode == 'ar';

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primary, AppColors.primary.withOpacity(0.85)],
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
              color: AppColors.primary.withOpacity(0.25),
              blurRadius: 20,
              offset: const Offset(0, 8)),
        ],
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              PatientAvatar(url: patient.photoUrl, size: 56),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(patient.fullName.pick(widget.locale),
                        style: AppTypography.headlineMd
                            .copyWith(color: Colors.white)),
                    const SizedBox(height: 2),
                    Text('MTI: ${patient.mti}',
                        style: AppTypography.labelSm
                            .copyWith(color: Colors.white.withOpacity(0.85))),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(
                    patient.insuranceActive
                        ? Icons.verified_rounded
                        : Icons.error_outline_rounded,
                    size: 14,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    patient.insuranceActive
                        ? (isAr ? 'مؤمَّن' : 'Insured')
                        : (isAr ? 'غير مؤمَّن' : 'Uninsured'),
                    style: AppTypography.labelSm.copyWith(color: Colors.white),
                  ),
                ]),
              ),
            ],
          ),
          const SizedBox(height: 14),
          InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => setState(() => _expanded = !_expanded),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.12),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  const Icon(Icons.qr_code_2_rounded, color: Colors.white, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      isAr ? 'إظهار رمز QR للهوية الطبية' : 'Show medical ID QR code',
                      style: AppTypography.labelMd.copyWith(color: Colors.white),
                    ),
                  ),
                  Icon(
                    _expanded
                        ? Icons.keyboard_arrow_up_rounded
                        : Icons.keyboard_arrow_down_rounded,
                    color: Colors.white,
                  ),
                ],
              ),
            ),
          ),
          if (_expanded) ...[
            const SizedBox(height: 14),
            Center(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: QrImageView(
                  data: 'MNIS-MTI:${patient.mti}',
                  size: 150,
                  backgroundColor: Colors.white,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: TextButton.icon(
                onPressed: () => context.push(AppRoutes.emergencyQr),
                icon: const Icon(Icons.emergency_rounded, color: Colors.white, size: 18),
                label: Text(
                  isAr ? 'فتح بطاقة الطوارئ الكاملة' : 'Open full emergency card',
                  style: AppTypography.labelMd.copyWith(color: Colors.white),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _QuickStats extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final bool isAr;
  final DashboardStats stats;
  const _QuickStats(
      {required this.l, required this.cs, required this.isAr, required this.stats});

  @override
  Widget build(BuildContext context) {
    final df = DateFormat.MMMd(isAr ? 'ar' : 'en');
    final next = stats.nextAppointment;
    return Row(
      children: [
        Expanded(
          child: _StatTile(
            cs: cs,
            icon: Icons.event_note_rounded,
            color: AppColors.secondary,
            label: isAr ? 'آخر زيارة' : 'Last visit',
            value: stats.lastVisit == null
                ? (isAr ? 'لا يوجد' : 'None')
                : df.format(stats.lastVisit!.arrivedAt),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _StatTile(
            cs: cs,
            icon: Icons.medication_liquid_rounded,
            color: AppColors.tertiary,
            label: isAr ? 'أدوية فعالة' : 'Active meds',
            value: '${stats.activeMedsCount}',
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: GestureDetector(
            onTap: () => context.push(AppRoutes.appointments),
            child: _StatTile(
              cs: cs,
              icon: Icons.calendar_month_rounded,
              color: AppColors.primary,
              label: isAr ? 'الموعد القادم' : 'Next appt.',
              value: next == null
                  ? l.noUpcomingAppointment
                  : df.format(next.scheduledAt ?? next.preferredDate),
              small: next == null,
            ),
          ),
        ),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  final ColorScheme cs;
  final IconData icon;
  final Color color;
  final String label;
  final String value;
  final bool small;
  const _StatTile({
    required this.cs,
    required this.icon,
    required this.color,
    required this.label,
    required this.value,
    this.small = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: cs.outlineVariant.withOpacity(0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(height: 8),
          Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: (small ? AppTypography.labelSm : AppTypography.headlineSm)
                  .copyWith(color: cs.onSurface)),
          const SizedBox(height: 2),
          Text(label,
              style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant)),
        ],
      ),
    );
  }
}

class _QuickAccessGrid extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  const _QuickAccessGrid({required this.l, required this.cs});

  @override
  Widget build(BuildContext context) {
    final items = [
      (icon: Icons.folder_shared_rounded, label: l.navMedical, route: AppRoutes.medicalFile, color: AppColors.primary),
      (icon: Icons.biotech_rounded, label: l.navLab, route: AppRoutes.labResults, color: AppColors.secondary),
      (icon: Icons.medication_rounded, label: l.navRx, route: AppRoutes.prescriptions, color: AppColors.tertiary),
      (icon: Icons.event_available_rounded, label: l.appointmentsMenu, route: AppRoutes.appointments, color: AppColors.primary),
      (icon: Icons.qr_code_rounded, label: l.shareWithDoctor, route: AppRoutes.shareRecord, color: AppColors.secondary),
      (icon: Icons.upload_file_rounded, label: l.myDocuments, route: AppRoutes.documents, color: AppColors.tertiary),
      (icon: Icons.emergency_rounded, label: l.navQr, route: AppRoutes.emergencyQr, color: Colors.redAccent),
    ];
    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 0.95,
      children: [
        for (final item in items)
          GestureDetector(
            onTap: () => context.push(item.route),
            child: Container(
              decoration: BoxDecoration(
                color: cs.surfaceContainerLowest,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: cs.outlineVariant.withOpacity(0.4)),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: item.color.withOpacity(0.12),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(item.icon, color: item.color, size: 22),
                  ),
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Text(item.label,
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.labelSm.copyWith(color: cs.onSurface)),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _RecentActivity extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final bool isAr;
  final Locale locale;
  final List<TimelineEntry> entries;
  final PatientProfile patient;
  const _RecentActivity({
    required this.l,
    required this.cs,
    required this.isAr,
    required this.locale,
    required this.entries,
    required this.patient,
  });

  @override
  Widget build(BuildContext context) {
    final df = DateFormat.MMMd(isAr ? 'ar' : 'en');
    final items = entries.take(3).toList();
    return Container(
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: cs.outlineVariant.withOpacity(0.4)),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(isAr ? 'آخر النشاطات' : 'Recent activity',
                  style: AppTypography.headlineSm.copyWith(color: cs.onSurface)),
              GestureDetector(
                onTap: () => context.push(AppRoutes.medicalFile),
                child: Text(isAr ? 'عرض الكل' : 'View all',
                    style: AppTypography.labelMd.copyWith(color: cs.secondary)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (patient.allergies.isNotEmpty)
            _ActivityRow(
              cs: cs,
              icon: Icons.warning_amber_rounded,
              color: cs.error,
              title: isAr ? 'حساسية مسجلة' : 'Recorded allergy',
              subtitle: patient.allergies.map((a) => a.pick(locale)).join('، '),
            ),
          if (items.isEmpty && patient.allergies.isEmpty)
            EmptyState(icon: Icons.history_rounded, message: l.noRecentActivity)
          else
            for (final e in items) ...[
              const SizedBox(height: 8),
              _ActivityRow(
                cs: cs,
                icon: _iconFor(e.kind),
                color: _colorFor(e.kind),
                title: _titleFor(e, locale, isAr),
                subtitle: df.format(e.date),
              ),
            ],
        ],
      ),
    );
  }

  IconData _iconFor(TimelineKind k) => switch (k) {
        TimelineKind.visit => Icons.local_hospital_rounded,
        TimelineKind.prescription => Icons.medication_rounded,
        TimelineKind.lab => Icons.biotech_rounded,
      };
  Color _colorFor(TimelineKind k) => switch (k) {
        TimelineKind.visit => AppColors.secondary,
        TimelineKind.prescription => AppColors.tertiary,
        TimelineKind.lab => AppColors.primary,
      };
  String _titleFor(TimelineEntry e, Locale locale, bool isAr) {
    switch (e.kind) {
      case TimelineKind.visit:
        return (e.data as VisitModel).reason.pick(locale);
      case TimelineKind.prescription:
        final p = e.data as PrescriptionModel;
        return isAr ? 'روشتة #${p.code}' : 'Prescription #${p.code}';
      case TimelineKind.lab:
        return (e.data as LabResultPanel).panel.pick(locale);
    }
  }
}

class _ActivityRow extends StatelessWidget {
  final ColorScheme cs;
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  const _ActivityRow({
    required this.cs,
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(color: color.withOpacity(0.12), shape: BoxShape.circle),
          child: Icon(icon, color: color, size: 16),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.labelMd.copyWith(color: Theme.of(context).colorScheme.onSurface)),
              Text(subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant)),
            ],
          ),
        ),
      ],
    );
  }
}

class _LiveQueueTicketCard extends StatelessWidget {
  final ColorScheme cs;
  final bool isAr;
  final Map<String, dynamic> ticket;
  final VoidCallback onRefresh;
  const _LiveQueueTicketCard({
    required this.cs,
    required this.isAr,
    required this.ticket,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final status = (ticket['status'] as String?) ?? 'WAITING';
    final inRoom = status == 'IN_CONSULTATION';
    final ticketNo = (ticket['ticketNo'] as String?) ?? '—';
    final aheadCount = (ticket['aheadCount'] as num?)?.toInt() ?? 0;
    final doctorName = isAr
        ? ((ticket['doctorNameAr'] as String?) ?? '')
        : ((ticket['doctorNameEn'] as String?) ?? '');
    final speciality = isAr
        ? ((ticket['specialityAr'] as String?) ?? '')
        : ((ticket['specialityEn'] as String?) ?? '');
    final facility = isAr
        ? ((ticket['facilityAr'] as String?) ?? '')
        : ((ticket['facilityEn'] as String?) ?? '');
    final reason = isAr
        ? ((ticket['reasonAr'] as String?) ?? '')
        : ((ticket['reasonEn'] as String?) ?? '');

    final accentColor = inRoom ? Colors.green.shade700 : AppColors.secondary;
    final bgColor = inRoom
        ? Colors.green.withOpacity(0.12)
        : cs.secondaryContainer.withOpacity(0.35);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: accentColor.withOpacity(0.45), width: 1.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: accentColor,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  ticketNo,
                  style: AppTypography.headlineSm.copyWith(color: Colors.white),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      inRoom
                          ? (isAr
                              ? 'الطبيب يناديك الآن — تفضل بالدخول لغرفة الكشف'
                              : 'Your turn now — Please enter consultation room')
                          : (isAr
                              ? 'دورك المباشر في طابور العيادة ($aheadCount قبلك)'
                              : 'Live Clinic Queue ($aheadCount ahead of you)'),
                      style: AppTypography.labelLg.copyWith(color: accentColor),
                    ),
                    if (reason.isNotEmpty)
                      Text(
                        reason,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppTypography.bodySm.copyWith(color: cs.onSurfaceVariant),
                      ),
                  ],
                ),
              ),
              IconButton(
                onPressed: onRefresh,
                icon: Icon(Icons.refresh_rounded, color: accentColor, size: 20),
                tooltip: isAr ? 'تحديث الدور' : 'Refresh queue',
              ),
            ],
          ),
          const SizedBox(height: 8),
          Divider(height: 1, color: accentColor.withOpacity(0.2)),
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.medical_services_rounded, size: 15, color: cs.primary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  '$doctorName${speciality.isNotEmpty ? ' • $speciality' : ''}${facility.isNotEmpty ? ' ($facility)' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.labelSm.copyWith(color: cs.onSurface),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}


