import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:share_plus/share_plus.dart';

import '../../../../core/l10n/app_localizations.dart';
import '../../../../core/models/appointment_models.dart';
import '../../../../core/models/models.dart';
import '../../../../core/providers/data_providers.dart';
import '../../../../core/providers/session_provider.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/utils/error_messages.dart';
import '../../../../core/utils/providers.dart';
import '../../../../core/utils/shared_widgets.dart';
import '../../../../core/widgets/account_sheet.dart';
import '../../../../core/widgets/async_view.dart';
import '../../../../core/widgets/patient_avatar.dart';

enum _Filter { all, awaitingPharmacy, dispensed, rejected }

class PrescriptionsScreen extends ConsumerStatefulWidget {
  const PrescriptionsScreen({super.key});

  @override
  ConsumerState<PrescriptionsScreen> createState() => _PrescriptionsScreenState();
}

class _PrescriptionsScreenState extends ConsumerState<PrescriptionsScreen> {
  _Filter _filter = _Filter.all;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final cs = Theme.of(context).colorScheme;
    final locale = ref.watch(localeProvider);
    final isAr = locale.languageCode == 'ar';
    final rxAsync = ref.watch(prescriptionsProvider);
    final profileAsync = ref.watch(profileProvider);
    final renewalsAsync = ref.watch(renewalsProvider);

    return Scaffold(
      backgroundColor: cs.surface,
      body: Directionality(
        textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(prescriptionsProvider);
            ref.invalidate(renewalsProvider);
            await ref.read(prescriptionsProvider.future).catchError((_) => <PrescriptionModel>[]);
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
                            style: AppTypography.headlineSm.copyWith(color: cs.primary, height: 1)),
                        Text(isAr ? 'الروشتات' : 'Prescriptions',
                            style: AppTypography.labelSm.copyWith(color: cs.onSurface)),
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
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          width: 40, height: 40,
                          decoration: BoxDecoration(
                              color: cs.secondaryContainer.withOpacity(0.4), shape: BoxShape.circle),
                          child: Icon(Icons.medication_rounded, size: 20, color: cs.primary),
                        ),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(l.prescriptionsTitle,
                                style: AppTypography.headlineSm.copyWith(color: cs.primary)),
                            Text(l.prescriptionsSub,
                                style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant)),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    AsyncValueView<PatientProfile>(
                      value: profileAsync,
                      isAr: isAr,
                      loadingHeight: 70,
                      builder: (context, patient) => _SafetyCheckBanner(
                          l: l, cs: cs, isAr: isAr, allergies: patient.allergies, locale: locale),
                    ),
                    const SizedBox(height: 14),
                    AsyncValueView<List<PrescriptionModel>>(
                      value: rxAsync,
                      isAr: isAr,
                      onRetry: () => ref.invalidate(prescriptionsProvider),
                      builder: (context, list) {
                        final pendingRenewalIds = renewalsAsync.value
                                ?.where((r) => r.status == RenewalStatus.pending)
                                .map((r) => r.prescriptionId)
                                .toSet() ??
                            {};
                        final filtered = switch (_filter) {
                          _Filter.all => list,
                          _Filter.awaitingPharmacy => list
                              .where((p) => p.status == RxStatus.signed || p.status == RxStatus.verified)
                              .toList(),
                          _Filter.dispensed =>
                            list.where((p) => p.status == RxStatus.dispensed).toList(),
                          _Filter.rejected =>
                            list.where((p) => p.status == RxStatus.rejected).toList(),
                        };
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            SizedBox(
                              height: 36,
                              child: ListView(
                                scrollDirection: Axis.horizontal,
                                reverse: isAr,
                                children: [
                                  _Chip(
                                      label: '${isAr ? "الكل" : "All"} (${list.length})',
                                      selected: _filter == _Filter.all,
                                      onTap: () => setState(() => _filter = _Filter.all), cs: cs),
                                  const SizedBox(width: 8),
                                  _Chip(
                                      label: l.activePrescriptions,
                                      selected: _filter == _Filter.awaitingPharmacy,
                                      onTap: () => setState(() => _filter = _Filter.awaitingPharmacy),
                                      cs: cs),
                                  const SizedBox(width: 8),
                                  _Chip(
                                      label: l.dispensed,
                                      selected: _filter == _Filter.dispensed,
                                      onTap: () => setState(() => _filter = _Filter.dispensed), cs: cs),
                                  const SizedBox(width: 8),
                                  _Chip(
                                      label: isAr ? 'مرفوضة' : 'Rejected',
                                      selected: _filter == _Filter.rejected,
                                      onTap: () => setState(() => _filter = _Filter.rejected), cs: cs),
                                ],
                              ),
                            ),
                            const SizedBox(height: 14),
                            if (filtered.isEmpty)
                              EmptyState(icon: Icons.medication_outlined, message: l.prescriptionsEmpty)
                            else
                              for (final p in filtered) ...[
                                _PrescriptionCard(
                                  l: l, cs: cs, isAr: isAr, locale: locale, rx: p,
                                  insuranceActive: profileAsync.value?.insuranceActive ?? false,
                                  renewalPending: pendingRenewalIds.contains(p.id),
                                ),
                                const SizedBox(height: 14),
                              ],
                          ],
                        );
                      },
                    ),
                    AsyncValueView<PatientProfile>(
                      value: profileAsync,
                      isAr: isAr,
                      loadingHeight: 0,
                      builder: (context, patient) => patient.chronicConditions.isEmpty
                          ? const SizedBox.shrink()
                          : _ChronicConditionsCard(
                              cs: cs, isAr: isAr, locale: locale, conditions: patient.chronicConditions),
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

class _Chip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final ColorScheme cs;
  const _Chip({required this.label, required this.selected, required this.onTap, required this.cs});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? cs.primary : cs.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(label,
            style: AppTypography.labelMd.copyWith(color: selected ? cs.onPrimary : cs.onSurfaceVariant)),
      ),
    );
  }
}

class _SafetyCheckBanner extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final bool isAr;
  final List<Bilingual> allergies;
  final Locale locale;
  const _SafetyCheckBanner(
      {required this.l, required this.cs, required this.isAr, required this.allergies, required this.locale});

  @override
  Widget build(BuildContext context) {
    final hasAllergies = allergies.isNotEmpty;
    final names = allergies.map((a) => a.pick(locale)).join('، ');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cs.tertiaryContainer.withOpacity(0.2),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: cs.tertiary.withOpacity(0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    StatusBadge(
                        label: l.safe100, backgroundColor: cs.tertiary, textColor: cs.onTertiary, fontSize: 10),
                    const SizedBox(width: 8),
                    Text(l.safetyCheck, style: AppTypography.labelLg.copyWith(color: cs.tertiary)),
                  ],
                ),
                const SizedBox(height: 6),
                Text(l.safetyCheckBody(hasAllergies, names),
                    style: AppTypography.bodySm.copyWith(color: cs.onSurfaceVariant),
                    textAlign: TextAlign.right),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(color: cs.tertiary, shape: BoxShape.circle),
            child: Icon(Icons.verified_user_rounded, size: 18, color: cs.onTertiary),
          ),
        ],
      ),
    );
  }
}

class _PrescriptionCard extends ConsumerStatefulWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final bool isAr;
  final Locale locale;
  final PrescriptionModel rx;
  final bool insuranceActive;
  final bool renewalPending;
  const _PrescriptionCard({
    required this.l, required this.cs, required this.isAr, required this.locale,
    required this.rx, required this.insuranceActive, required this.renewalPending,
  });

  @override
  ConsumerState<_PrescriptionCard> createState() => _PrescriptionCardState();
}

class _PrescriptionCardState extends ConsumerState<_PrescriptionCard> {
  bool _expanded = true;
  bool _requesting = false;

  ({String label, Color bg, Color fg}) _statusStyle(ColorScheme cs, bool isAr) {
    switch (widget.rx.status) {
      case RxStatus.signed:
        return (label: isAr ? 'بانتظار التحقق' : 'Awaiting verification', bg: cs.surfaceContainerHigh, fg: cs.onSurfaceVariant);
      case RxStatus.verified:
        return (label: widget.l.validForDispensing, bg: cs.secondaryContainer.withOpacity(0.5), fg: cs.onSecondaryContainer);
      case RxStatus.dispensed:
        return (label: widget.l.dispensed, bg: cs.tertiaryContainer.withOpacity(0.5), fg: cs.onTertiaryContainer);
      case RxStatus.rejected:
        return (label: isAr ? 'مرفوضة' : 'Rejected', bg: cs.errorContainer, fg: cs.onErrorContainer);
      default:
        return (label: isAr ? 'مسودة' : 'Draft', bg: cs.surfaceContainerHigh, fg: cs.onSurfaceVariant);
    }
  }

  Future<void> _requestRenewal() async {
    final l = widget.l;
    final isAr = widget.isAr;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.requestRenewalConfirmTitle),
        content: Text(l.requestRenewalConfirmBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l.send)),
        ],
      ),
    );
    if (confirm != true) return;
    setState(() => _requesting = true);
    try {
      await ref.read(repositoryProvider).requestRenewal(widget.rx.id);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(l.renewalRequestSent)));
      ref.invalidate(renewalsProvider);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(friendlyError(e, isAr: isAr))));
    } finally {
      if (mounted) setState(() => _requesting = false);
    }
  }


  @override
  Widget build(BuildContext context) {
      final cs = widget.cs;
      final isAr = widget.isAr;
      final rx = widget.rx;
      final df = DateFormat.yMMMd(isAr ? 'ar' : 'en');
      final status = _statusStyle(cs, isAr);

      return Container(
        decoration: BoxDecoration(
          color: cs.surfaceContainerLowest,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [BoxShadow(color: AppColors.primary.withOpacity(0.06), blurRadius: 12)],
        ),
        child: Stack(
          children: [
            Positioned(
              left: -14, bottom: -14,
              child: Icon(Icons.local_hospital_rounded, size: 64, color: cs.primary.withOpacity(0.05)),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      StatusBadge(label: status.label, backgroundColor: status.bg, textColor: status.fg, fontSize: 10),
                      Row(children: [
                        Icon(Icons.receipt_long_rounded, size: 16, color: cs.secondary),
                        const SizedBox(width: 4),
                        Text('#${rx.code}', style: AppTypography.headlineSm.copyWith(color: cs.primary)),
                      ]),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(rx.diagnosis.pick(widget.locale),
                      style: AppTypography.bodySm.copyWith(color: cs.onSurfaceVariant),
                      textAlign: TextAlign.right),
                  if (rx.physicianName != null &&
                      (rx.physicianName!.ar.isNotEmpty || rx.physicianName!.en.isNotEmpty)) ...[
                    const SizedBox(height: 4),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Flexible(
                          child: Text(
                            rx.physicianSpeciality != null &&
                                    (rx.physicianSpeciality!.ar.isNotEmpty ||
                                        rx.physicianSpeciality!.en.isNotEmpty)
                                ? '${rx.physicianName!.pick(widget.locale)} • ${rx.physicianSpeciality!.pick(widget.locale)}'
                                : rx.physicianName!.pick(widget.locale),
                            style: AppTypography.labelSm.copyWith(color: cs.secondary),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(Icons.medical_services_rounded, size: 13, color: cs.secondary),
                      ],
                    ),
                  ],
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(color: cs.surfaceContainer, borderRadius: BorderRadius.circular(10)),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(isAr ? 'تاريخ التحرير' : 'Issue date',
                                  style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant)),
                              Text(df.format(rx.createdAt), style: AppTypography.labelLg.copyWith(color: cs.primary)),
                              if (rx.dispensedAt != null)
                                Text('${isAr ? "صُرفت" : "Dispensed"}: ${df.format(rx.dispensedAt!)}',
                                    style: AppTypography.labelSm.copyWith(color: cs.tertiary)),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(color: cs.surfaceContainer, borderRadius: BorderRadius.circular(10)),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(isAr ? 'التأمين الصحي' : 'Health insurance',
                                  style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant)),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  Icon(Icons.health_and_safety_rounded,
                                      size: 14, color: widget.insuranceActive ? cs.tertiary : cs.error),
                                  const SizedBox(width: 4),
                                  Text(
                                    widget.insuranceActive
                                        ? (isAr ? 'ساري' : 'Active')
                                        : (isAr ? 'غير ساري' : 'Inactive'),
                                    style: AppTypography.labelLg
                                        .copyWith(color: widget.insuranceActive ? cs.tertiary : cs.error),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      GestureDetector(
                        onTap: () => setState(() => _expanded = !_expanded),
                        child: Row(children: [
                          Icon(_expanded ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded,
                              color: cs.secondary, size: 18),
                          Text(_expanded ? (isAr ? 'إخفاء' : 'Hide') : (isAr ? 'عرض' : 'Show'),
                              style: AppTypography.labelMd.copyWith(color: cs.secondary)),
                        ]),
                      ),
                      Text(isAr ? 'الأدوية (${rx.items.length})' : 'Medications (${rx.items.length})',
                          style: AppTypography.labelLg.copyWith(color: cs.onSurface)),
                    ],
                  ),
                  if (_expanded) ...[
                    const SizedBox(height: 8),
                    for (final med in rx.items)
                      Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(12),
                        decoration:
                            BoxDecoration(color: cs.secondaryContainer.withOpacity(0.2), borderRadius: BorderRadius.circular(10)),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text('${med.name.pick(widget.locale)} ${med.dose}',
                                      style: AppTypography.headlineSm.copyWith(color: cs.onSurface)),
                                  Text(med.frequency.pick(widget.locale),
                                      style: AppTypography.bodySm.copyWith(color: cs.onSurfaceVariant)),
                                  const SizedBox(height: 4),
                                  StatusBadge(
                                    label: isAr ? '×${med.quantity}' : '×${med.quantity}',
                                    backgroundColor: cs.surfaceContainerLowest.withOpacity(0.8),
                                    textColor: cs.secondary,
                                    fontSize: 10,
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 10),
                            Container(
                              width: 40, height: 40,
                              decoration: BoxDecoration(color: cs.secondary.withOpacity(0.15), borderRadius: BorderRadius.circular(10)),
                              child: Icon(Icons.medication_rounded, size: 20, color: cs.secondary),
                            ),
                          ],
                        ),
                      ),
                  ],
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () {
                            final meds = rx.items
                                .map((m) => '${m.name.pick(widget.locale)} ${m.dose}')
                                .join('، ');
                            Share.share(
                              '${isAr ? "روشتة" : "Prescription"} #${rx.code}\n'
                              '${rx.diagnosis.pick(widget.locale)}\n$meds',
                            );
                          },
                          icon: Icon(Icons.share_rounded, size: 16, color: cs.secondary),
                          label: Text(isAr ? 'مشاركة' : 'Share',
                              style: AppTypography.labelLg.copyWith(color: cs.secondary)),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(0, 44),
                            side: BorderSide(color: cs.secondary),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                          ),
                        ),
                      ),
                      if (rx.canRequestRenewal) ...[
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: (widget.renewalPending || _requesting) ? null : _requestRenewal,
                            icon: _requesting
                                ? SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: cs.onPrimary))
                                : Icon(Icons.refresh_rounded, size: 16, color: cs.onPrimary),
                            label: Text(
                              widget.renewalPending ? widget.l.renewalPendingBadge : widget.l.requestRenewal,
                              style: AppTypography.labelLg.copyWith(color: cs.onPrimary),
                              overflow: TextOverflow.ellipsis,
                            ),
                            style: ElevatedButton.styleFrom(
                              minimumSize: const Size(0, 44),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      );
  }
}

class _ChronicConditionsCard extends StatelessWidget {
  final ColorScheme cs;
  final bool isAr;
  final Locale locale;
  final List<Bilingual> conditions;
  const _ChronicConditionsCard(
      {required this.cs, required this.isAr, required this.locale, required this.conditions});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: cs.outlineVariant.withOpacity(0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              StatusBadge(
                  label: isAr ? 'مزمن' : 'Chronic',
                  backgroundColor: cs.surfaceContainerHigh,
                  textColor: cs.onSurfaceVariant,
                  fontSize: 10),
              Text(isAr ? 'الأمراض المزمنة المسجلة' : 'Registered chronic conditions',
                  style: AppTypography.headlineSm.copyWith(color: cs.primary)),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8, runSpacing: 8, alignment: WrapAlignment.end,
            children: conditions
                .map((c) => Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(color: cs.surfaceContainerLow, borderRadius: BorderRadius.circular(20)),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.favorite_rounded, size: 14, color: cs.secondary),
                        const SizedBox(width: 6),
                        Text(c.pick(locale), style: AppTypography.bodySm.copyWith(color: cs.onSurface)),
                      ]),
                    ))
                .toList(),
          ),
        ],
      ),
    );
  }
}


