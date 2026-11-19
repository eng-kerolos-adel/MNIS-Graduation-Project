import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/l10n/app_localizations.dart';
import '../../../../core/models/models.dart';
import '../../../../core/providers/data_providers.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/utils/providers.dart';
import '../../../../core/utils/shared_widgets.dart';
import '../../../../core/widgets/account_sheet.dart';
import '../../../../core/widgets/async_view.dart';
import '../../../../core/widgets/patient_avatar.dart';

class MedicalFileScreen extends ConsumerWidget {
  const MedicalFileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final cs = Theme.of(context).colorScheme;
    final locale = ref.watch(localeProvider);
    final isAr = locale.languageCode == 'ar';
    final profileAsync = ref.watch(profileProvider);

    return Scaffold(
      backgroundColor: cs.surface,
      body: Directionality(
        textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(profileProvider);
            ref.invalidate(summaryHubProvider);
            ref.invalidate(timelineProvider);
            await ref.read(profileProvider.future).catchError((_) => null);
          },
          child: CustomScrollView(
            slivers: [
              SliverAppBar(
                pinned: true,
                backgroundColor: cs.surface.withOpacity(0.9),
                surfaceTintColor: Colors.transparent,
                title: Row(
                  children: [
                    const MnisShieldLogo(size: 28),
                    const SizedBox(width: 8),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('MNIS',
                            style: AppTypography.headlineSm
                                .copyWith(color: cs.primary, height: 1)),
                        Text(isAr ? 'الملف الطبي' : 'Medical File',
                            style: AppTypography.labelSm
                                .copyWith(color: cs.onSurface)),
                      ],
                    ),
                  ],
                ),
                actions: [
                  GestureDetector(
                    onTap: () => showAccountSheet(context, ref),
                    child: Container(
                      margin: const EdgeInsets.only(left: 8, right: 4),
                      child: PatientAvatar(
                        url: profileAsync.value?.photoUrl,
                        size: 32,
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                  ),
                ],
              ),
              SliverToBoxAdapter(
                child: Column(
                  children: [
                    if ((profileAsync.value?.allergies.isNotEmpty) ?? false)
                      Container(
                        color: cs.error,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.white.withOpacity(0.2),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text('MNIS-SEC',
                                  style: AppTypography.labelSm.copyWith(
                                      color: cs.onError,
                                      fontWeight: FontWeight.w700)),
                            ),
                            Expanded(
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  Icon(Icons.warning_rounded,
                                      size: 16, color: cs.onError),
                                  const SizedBox(width: 6),
                                  Flexible(
                                    child: Text(l.clinicalAlert,
                                        style: AppTypography.labelSm.copyWith(
                                            color: cs.onError,
                                            fontWeight: FontWeight.w700),
                                        overflow: TextOverflow.ellipsis),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        children: [
                          AsyncValueView<PatientProfile>(
                            value: profileAsync,
                            isAr: isAr,
                            onRetry: () => ref.invalidate(profileProvider),
                            builder: (context, patient) => _PatientCard(
                                l: l, cs: cs, patient: patient, locale: locale),
                          ),
                          const SizedBox(height: 14),
                          Consumer(builder: (context, ref, _) {
                            final hubAsync = ref.watch(summaryHubProvider);
                            return AsyncValueView<Map<String, dynamic>>(
                              value: hubAsync,
                              isAr: isAr,
                              onRetry: () => ref.invalidate(summaryHubProvider),
                              builder: (context, hub) => _SovereignSummaryHub(
                                cs: cs,
                                isAr: isAr,
                                hub: hub,
                              ),
                            );
                          }),
                          const SizedBox(height: 14),
                          Consumer(builder: (context, ref, _) {
                            final timeline = ref.watch(timelineProvider);
                            return AsyncValueView<List<TimelineEntry>>(
                              value: timeline,
                              isAr: isAr,
                              onRetry: () => ref.invalidate(timelineProvider),
                              builder: (context, entries) => _ClinicalTimeline(
                                  l: l, cs: cs, isAr: isAr, locale: locale, entries: entries),
                            );
                          }),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Patient Identity Card ──────────────────────────────────────────────────

class _PatientCard extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final PatientProfile patient;
  final Locale locale;
  const _PatientCard(
      {required this.l, required this.cs, required this.patient, required this.locale});

  bool get isAr => locale.languageCode == 'ar';

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(color: AppColors.primary.withOpacity(0.06), blurRadius: 12),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            left: -16,
            bottom: -16,
            child: Icon(Icons.health_and_safety,
                size: 96, color: cs.primary.withOpacity(0.05)),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(
                        color: cs.error,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        children: [
                          Text(isAr ? 'فصيلة الدم' : 'Blood',
                              style: AppTypography.labelSm
                                  .copyWith(color: cs.onError.withOpacity(0.9))),
                          Text(patient.bloodType,
                              style: AppTypography.headlineMd.copyWith(
                                  color: cs.onError, fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Row(
                            children: [
                              StatusBadge(
                                label: patient.insuranceActive
                                    ? l.officiallyInsured
                                    : (isAr ? 'غير مؤمَّن' : 'Uninsured'),
                                backgroundColor: patient.insuranceActive
                                    ? cs.secondaryContainer.withOpacity(0.4)
                                    : cs.errorContainer,
                                textColor: patient.insuranceActive
                                    ? cs.onSecondaryContainer
                                    : cs.onErrorContainer,
                                fontSize: 10,
                              ),
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(patient.fullName.pick(locale),
                                    style: AppTypography.headlineSm.copyWith(
                                        color: cs.primary, fontWeight: FontWeight.w700),
                                    overflow: TextOverflow.ellipsis),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            '${patient.age} ${isAr ? 'سنة' : 'y'} • '
                            '${patient.isFemale ? l.femaleLabel : l.maleLabel} • '
                            '${patient.nationalId}',
                            style: AppTypography.labelMd
                                .copyWith(color: cs.onSurfaceVariant),
                            textAlign: TextAlign.right,
                            textDirection: TextDirection.ltr,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Stack(
                      children: [
                        PatientAvatar(url: patient.photoUrl, size: 56, borderRadius: BorderRadius.circular(28)),
                        Positioned(
                          bottom: 0,
                          right: 0,
                          child: Container(
                            width: 16,
                            height: 16,
                            decoration: BoxDecoration(
                                color: cs.tertiaryContainer, shape: BoxShape.circle),
                            child: Icon(Icons.verified,
                                size: 10, color: cs.onTertiaryContainer),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                if (patient.allergies.isNotEmpty) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: cs.errorContainer,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(l.allergyDrugs,
                                  style: AppTypography.labelSm.copyWith(
                                      color: cs.onErrorContainer,
                                      fontWeight: FontWeight.w700)),
                              const SizedBox(height: 6),
                              Wrap(
                                spacing: 6,
                                runSpacing: 4,
                                alignment: WrapAlignment.end,
                                children: patient.allergies
                                    .map((a) => Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 8, vertical: 3),
                                          decoration: BoxDecoration(
                                            color: cs.surfaceContainerLowest
                                                .withOpacity(0.8),
                                            borderRadius: BorderRadius.circular(12),
                                          ),
                                          child: Text(a.pick(locale),
                                              style: AppTypography.labelMd.copyWith(
                                                  color: cs.error,
                                                  fontWeight: FontWeight.w700)),
                                        ))
                                    .toList(),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 10),
                        Container(
                          width: 36,
                          height: 36,
                          decoration:
                              BoxDecoration(color: cs.error, shape: BoxShape.circle),
                          child: Icon(Icons.emergency_rounded,
                              size: 18, color: cs.onError),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
                if (patient.chronicConditions.isNotEmpty) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: cs.surfaceContainerHigh,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(l.chronicConditions,
                                  style: AppTypography.labelSm.copyWith(
                                      color: cs.onSurfaceVariant,
                                      fontWeight: FontWeight.w600)),
                              const SizedBox(height: 6),
                              Wrap(
                                spacing: 6,
                                runSpacing: 4,
                                alignment: WrapAlignment.end,
                                children: patient.chronicConditions
                                    .map((c) => Container(
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 8, vertical: 3),
                                          decoration: BoxDecoration(
                                            color: cs.surfaceContainerLowest,
                                            borderRadius: BorderRadius.circular(12),
                                          ),
                                          child: Text(c.pick(locale),
                                              style: AppTypography.labelMd
                                                  .copyWith(color: cs.onSurface)),
                                        ))
                                    .toList(),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 10),
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                              color: cs.surfaceContainerHighest, shape: BoxShape.circle),
                          child: Icon(Icons.favorite_rounded,
                              size: 18, color: cs.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                ],
                // Emergency hotline — always real & dialable, unlike a made-up
                // "family doctor" contact the system doesn't actually track.
                InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: () => launchUrl(Uri.parse('tel:137')),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: cs.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration:
                              BoxDecoration(color: cs.primary, shape: BoxShape.circle),
                          child: Icon(Icons.call_rounded,
                              size: 16, color: cs.onPrimary),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(isAr ? 'خط نجدة الإسعاف' : 'Ambulance hotline',
                                  style: AppTypography.labelSm
                                      .copyWith(color: cs.outline)),
                              Text('137',
                                  style: AppTypography.labelMd.copyWith(
                                      color: cs.primary, fontWeight: FontWeight.w700)),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Icon(Icons.medical_services_rounded,
                            size: 20, color: cs.secondary),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Clinical Timeline ───────────────────────────────────────────────────────

class _ClinicalTimeline extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final bool isAr;
  final Locale locale;
  final List<TimelineEntry> entries;
  const _ClinicalTimeline({
    required this.l,
    required this.cs,
    required this.isAr,
    required this.locale,
    required this.entries,
  });

  @override
  Widget build(BuildContext context) {
    final df = DateFormat.yMMMd(isAr ? 'ar' : 'en');

    Color nodeColor(TimelineEntry e) => switch (e.kind) {
          TimelineKind.visit => cs.secondary,
          TimelineKind.prescription => cs.tertiary,
          TimelineKind.lab => (e.data as LabResultPanel).hasAbnormal ? cs.error : cs.tertiary,
        };
    IconData icon(TimelineEntry e) => switch (e.kind) {
          TimelineKind.visit => Icons.local_hospital_rounded,
          TimelineKind.prescription => Icons.receipt_long_rounded,
          TimelineKind.lab => Icons.science_rounded,
        };
    String title(TimelineEntry e) => switch (e.kind) {
          TimelineKind.visit => (e.data as VisitModel).reason.pick(locale),
          TimelineKind.prescription =>
            '${isAr ? "روشتة" : "Prescription"} #${(e.data as PrescriptionModel).code}',
          TimelineKind.lab => (e.data as LabResultPanel).panel.pick(locale),
        };
    ({String label, Color bg, Color fg}) badge(TimelineEntry e) {
      switch (e.kind) {
        case TimelineKind.visit:
          return (label: isAr ? 'زيارة' : 'Visit', bg: cs.secondaryContainer, fg: cs.onSecondaryContainer);
        case TimelineKind.prescription:
          final p = e.data as PrescriptionModel;
          final dispensed = p.status == RxStatus.dispensed;
          return (
            label: dispensed ? (isAr ? 'مصروفة' : 'Dispensed') : (isAr ? 'سارية' : 'Active'),
            bg: dispensed ? cs.tertiaryContainer : cs.secondaryContainer,
            fg: dispensed ? cs.onTertiaryContainer : cs.onSecondaryContainer,
          );
        case TimelineKind.lab:
          final abnormal = (e.data as LabResultPanel).hasAbnormal;
          return (
            label: abnormal ? (isAr ? 'خارج النطاق' : 'Out of range') : (isAr ? 'طبيعي' : 'Normal'),
            bg: abnormal ? cs.errorContainer : cs.tertiaryContainer,
            fg: abnormal ? cs.onErrorContainer : cs.onTertiaryContainer,
          );
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(l.clinicalTimeline,
            style: AppTypography.headlineSm.copyWith(color: cs.onSurface)),
        const SizedBox(height: 12),
        if (entries.isEmpty)
          EmptyState(icon: Icons.timeline_rounded, message: l.noTimelineEvents)
        else
          ...entries.asMap().entries.map((entry) {
            final i = entry.key;
            final e = entry.value;
            final b = badge(e);
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: cs.surfaceContainerLowest,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: cs.outlineVariant.withOpacity(0.5)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            StatusBadge(
                                label: b.label, backgroundColor: b.bg, textColor: b.fg, fontSize: 10),
                            Text(df.format(e.date),
                                style: AppTypography.labelSm
                                    .copyWith(color: cs.onSurfaceVariant)),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(title(e),
                            style: AppTypography.headlineSm.copyWith(color: cs.primary),
                            textAlign: TextAlign.right),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Column(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: nodeColor(e).withOpacity(0.15),
                        shape: BoxShape.circle,
                        border: Border.all(color: nodeColor(e), width: 2),
                      ),
                      child: Icon(icon(e), size: 14, color: nodeColor(e)),
                    ),
                    if (i < entries.length - 1)
                      Container(
                        width: 2,
                        height: 40,
                        color: cs.outlineVariant,
                        margin: const EdgeInsets.symmetric(vertical: 4),
                      ),
                  ],
                ),
              ],
            );
          }),
      ],
    );
  }
}

// ─── Sovereign Interconnectivity Hub (Referrals, PACS, Chronic, Audit) ───

class _SovereignSummaryHub extends StatelessWidget {
  final ColorScheme cs;
  final bool isAr;
  final Map<String, dynamic> hub;

  const _SovereignSummaryHub({
    required this.cs,
    required this.isAr,
    required this.hub,
  });

  List<Map<String, dynamic>> _list(String key) {
    final raw = hub[key];
    if (raw is List) {
      return raw.map((e) => (e as Map).cast<String, dynamic>()).toList();
    }
    return const [];
  }

  @override
  Widget build(BuildContext context) {
    final chronic = _list('chronicAllowances');
    final referrals = _list('referrals');
    final radiology = _list('radiology');
    final accessLogs = _list('accessLogs');
    final activeBed = hub['activeInpatientBed'] is Map
        ? (hub['activeInpatientBed'] as Map).cast<String, dynamic>()
        : null;
    final surgeries = _list('surgeries');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // 0. Active Inpatient Bed & Surgical Operations (Hospital / OR)
        if (activeBed != null || surgeries.isNotEmpty) ...[
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: cs.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: cs.primary.withOpacity(0.35)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      isAr
                          ? 'الإقامة الداخلية والعمليات الجراحية'
                          : 'Hospital Inpatient & Surgical Care',
                      style: AppTypography.headlineSm.copyWith(color: cs.primary),
                    ),
                    const SizedBox(width: 6),
                    Icon(Icons.local_hospital_rounded, size: 18, color: cs.primary),
                  ],
                ),
                const SizedBox(height: 8),
                if (activeBed != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 6),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: cs.secondaryContainer.withOpacity(0.45),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        StatusBadge(
                          label: isAr ? 'مقيم حالياً' : 'ADMITTED',
                          backgroundColor: cs.primary,
                          textColor: cs.onPrimary,
                          fontSize: 10,
                        ),
                        Expanded(
                          child: Text(
                            isAr
                                ? 'قسم ${activeBed['wardAr'] ?? activeBed['wardEn'] ?? ''} • سرير ${activeBed['bedNumber'] ?? ''}'
                                : '${activeBed['wardEn'] ?? ''} • Bed ${activeBed['bedNumber'] ?? ''}',
                            style: AppTypography.labelMd.copyWith(
                              color: cs.onSurface,
                              fontWeight: FontWeight.w700,
                            ),
                            textAlign: TextAlign.right,
                          ),
                        ),
                      ],
                    ),
                  ),
                ...surgeries.map((op) => Container(
                      margin: const EdgeInsets.only(bottom: 6),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: cs.surfaceContainerLow,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          StatusBadge(
                            label: '${op['theaterNo'] ?? 'OR-01'} • ${op['status'] ?? 'SCHEDULED'}',
                            backgroundColor: cs.tertiaryContainer,
                            textColor: cs.onTertiaryContainer,
                            fontSize: 10,
                          ),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  isAr
                                      ? '${op['procedureAr'] ?? op['procedureEn'] ?? ''}'
                                      : '${op['procedureEn'] ?? ''}',
                                  style: AppTypography.labelMd.copyWith(
                                    color: cs.onSurface,
                                    fontWeight: FontWeight.w700,
                                  ),
                                  textAlign: TextAlign.right,
                                ),
                                Text(
                                  isAr
                                      ? '${op['surgeonNameAr'] ?? ''} • ${op['anaesthesiaAr'] ?? ''}'
                                      : '${op['surgeonNameEn'] ?? ''} • ${op['anaesthesiaEn'] ?? ''}',
                                  style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant),
                                  textAlign: TextAlign.right,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    )),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        // 1. Monthly Chronic Medication Allowances
        if (chronic.isNotEmpty) ...[
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: cs.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: cs.outlineVariant.withOpacity(0.5)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      isAr
                          ? 'حصص الأدوية المزمنة الشهرية (${chronic.length})'
                          : 'Monthly Chronic Drug Allowances (${chronic.length})',
                      style: AppTypography.headlineSm.copyWith(color: cs.primary),
                    ),
                    const SizedBox(width: 6),
                    Icon(Icons.medication_liquid_rounded, size: 18, color: cs.secondary),
                  ],
                ),
                const SizedBox(height: 8),
                ...chronic.map((c) {
                  final limit = (c['monthlyLimit'] as num?)?.toInt() ?? 1;
                  final used = (c['dispensedThisMonth'] as num?)?.toInt() ?? 0;
                  final remaining = (limit - used).clamp(0, 999);
                  return Container(
                    margin: const EdgeInsets.only(bottom: 6),
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: cs.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        StatusBadge(
                          label: isAr
                              ? 'متبقي $remaining من $limit'
                              : '$remaining / $limit left',
                          backgroundColor: remaining > 0
                              ? cs.tertiaryContainer
                              : cs.errorContainer,
                          textColor: remaining > 0
                              ? cs.onTertiaryContainer
                              : cs.onErrorContainer,
                          fontSize: 10,
                        ),
                        Expanded(
                          child: Text(
                            '${c['drugName'] ?? ''} • ${c['dosage'] ?? ''}',
                            style: AppTypography.labelMd.copyWith(
                              color: cs.onSurface,
                              fontWeight: FontWeight.w700,
                            ),
                            textAlign: TextAlign.right,
                          ),
                        ),
                      ],
                    ),
                  );
                }),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],

        // 2. Clinical Referrals & PACS Radiology
        if (referrals.isNotEmpty || radiology.isNotEmpty) ...[
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: cs.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: cs.outlineVariant.withOpacity(0.5)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    Text(
                      isAr
                          ? 'التحويلات الطبية وتقارير الأشعة (PACS)'
                          : 'Clinical Referrals & PACS Radiology',
                      style: AppTypography.headlineSm.copyWith(color: cs.primary),
                    ),
                    const SizedBox(width: 6),
                    Icon(Icons.hub_rounded, size: 18, color: cs.tertiary),
                  ],
                ),
                const SizedBox(height: 8),
                ...referrals.map((r) => Container(
                      margin: const EdgeInsets.only(bottom: 6),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: cs.surfaceContainerLow,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          StatusBadge(
                            label: '${r['urgency'] ?? 'ROUTINE'} • ${r['status'] ?? 'PENDING'}',
                            backgroundColor: cs.secondaryContainer,
                            textColor: cs.onSecondaryContainer,
                            fontSize: 10,
                          ),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  '${isAr ? "تحويل إلى:" : "Referral to:"} ${r['targetFacility'] ?? r['targetType'] ?? ''}',
                                  style: AppTypography.labelMd.copyWith(
                                    color: cs.onSurface,
                                    fontWeight: FontWeight.w700,
                                  ),
                                  textAlign: TextAlign.right,
                                ),
                                Text(
                                  '${r['reason'] ?? ''}',
                                  style: AppTypography.labelSm.copyWith(
                                    color: cs.onSurfaceVariant,
                                  ),
                                  textAlign: TextAlign.right,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    )),
                ...radiology.map((rad) => Container(
                      margin: const EdgeInsets.only(bottom: 6),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: cs.surfaceContainerLow,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          StatusBadge(
                            label: '${rad['modality'] ?? 'PACS'}',
                            backgroundColor: cs.tertiaryContainer,
                            textColor: cs.onTertiaryContainer,
                            fontSize: 10,
                          ),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  '${isAr ? "أشعة:" : "Scan:"} ${rad['bodyPart'] ?? ''}',
                                  style: AppTypography.labelMd.copyWith(
                                    color: cs.onSurface,
                                    fontWeight: FontWeight.w700,
                                  ),
                                  textAlign: TextAlign.right,
                                ),
                                Text(
                                  '${rad['findings'] ?? ''}',
                                  style: AppTypography.labelSm.copyWith(
                                    color: cs.onSurfaceVariant,
                                  ),
                                  textAlign: TextAlign.right,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    )),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],

        // 3. Sovereign Security Access Log
        if (accessLogs.isNotEmpty) ...[
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: cs.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: cs.outlineVariant.withOpacity(0.5)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: cs.primaryContainer,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        'AES-256-GCM • AUDIT',
                        style: AppTypography.labelSm.copyWith(
                          color: cs.onPrimaryContainer,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Row(
                      children: [
                        Text(
                          isAr
                              ? 'سجل الرقابة السيادي للملف الطبي'
                              : 'Sovereign Medical Record Audit Trail',
                          style: AppTypography.headlineSm.copyWith(color: cs.primary),
                        ),
                        const SizedBox(width: 6),
                        Icon(Icons.shield_rounded, size: 18, color: cs.primary),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ...accessLogs.take(4).map((log) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '${log['actorRole'] ?? 'SYSTEM'}',
                            style: AppTypography.labelSm.copyWith(
                              color: cs.secondary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Expanded(
                            child: Text(
                              '${log['actorNameAr'] ?? log['actorNameEn'] ?? ''} — ${log['action'] ?? ''}',
                              style: AppTypography.labelSm.copyWith(
                                color: cs.onSurfaceVariant,
                              ),
                              textAlign: TextAlign.right,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    )),
              ],
            ),
          ),
        ],
      ],
    );
  }
}


