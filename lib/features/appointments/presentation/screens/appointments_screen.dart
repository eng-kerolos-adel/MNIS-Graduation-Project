import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' hide TextDirection;

import '../../../../core/l10n/app_localizations.dart';
import '../../../../core/models/appointment_models.dart';
import '../../../../core/providers/data_providers.dart';
import '../../../../core/providers/session_provider.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/utils/error_messages.dart';
import '../../../../core/utils/providers.dart';
import '../../../../core/utils/shared_widgets.dart';
import '../../../../core/widgets/async_view.dart';

class AppointmentsScreen extends ConsumerWidget {
  const AppointmentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final cs = Theme.of(context).colorScheme;
    final isAr = ref.watch(localeProvider).languageCode == 'ar';
    final apptsAsync = ref.watch(appointmentsProvider);

    return Scaffold(
      backgroundColor: cs.surface,
      appBar: AppBar(
        title: Text(l.appointmentsTitle),
        leading: IconButton(
          icon: Icon(isAr ? Icons.arrow_forward_rounded : Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openRequestSheet(context, ref),
        icon: const Icon(Icons.add_rounded),
        label: Text(l.requestAppointment),
      ),
      body: Directionality(
        textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(appointmentsProvider);
            await ref.read(appointmentsProvider.future).catchError((_) => <AppointmentModel>[]);
          },
          child: AsyncValueView<List<AppointmentModel>>(
            value: apptsAsync,
            isAr: isAr,
            onRetry: () => ref.invalidate(appointmentsProvider),
            builder: (context, list) {
              if (list.isEmpty) {
                return ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    const SizedBox(height: 60),
                    EmptyState(icon: Icons.event_busy_rounded, message: l.appointmentsEmpty),
                  ],
                );
              }
              return ListView.separated(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                itemCount: list.length,
                separatorBuilder: (_, __) => const SizedBox(height: 10),
                itemBuilder: (context, i) => _AppointmentTile(l: l, cs: cs, isAr: isAr, appt: list[i]),
              );
            },
          ),
        ),
      ),
    );
  }

  void _openRequestSheet(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _RequestAppointmentSheet(),
    );
  }
}

class _AppointmentTile extends ConsumerWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final bool isAr;
  final AppointmentModel appt;
  const _AppointmentTile({required this.l, required this.cs, required this.isAr, required this.appt});

  ({String label, Color bg, Color fg}) _style() {
    switch (appt.status) {
      case AppointmentStatus.confirmed:
        return (label: l.statusConfirmed(isAr), bg: cs.tertiaryContainer.withOpacity(0.5), fg: cs.onTertiaryContainer);
      case AppointmentStatus.rejected:
        return (label: l.statusRejected(isAr), bg: cs.errorContainer, fg: cs.onErrorContainer);
      case AppointmentStatus.cancelled:
        return (label: l.statusCancelled(isAr), bg: cs.surfaceContainerHigh, fg: cs.onSurfaceVariant);
      case AppointmentStatus.completed:
        return (label: l.statusCompleted(isAr), bg: cs.secondaryContainer.withOpacity(0.5), fg: cs.onSecondaryContainer);
      case AppointmentStatus.requested:
        return (label: l.statusRequested(isAr), bg: cs.surfaceContainerHigh, fg: cs.secondary);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final df = DateFormat.yMMMd(isAr ? 'ar' : 'en').add_Hm();
    final s = _style();
    final date = appt.scheduledAt ?? appt.preferredDate;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: AppColors.primary.withOpacity(0.05), blurRadius: 10)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(children: [
                StatusBadge(label: s.label, backgroundColor: s.bg, textColor: s.fg, fontSize: 10),
                const SizedBox(width: 6),
                Icon(
                  appt.type == AppointmentType.lab ? Icons.biotech_rounded : Icons.local_hospital_rounded,
                  size: 14,
                  color: cs.onSurfaceVariant,
                ),
              ]),
              Text(df.format(date), style: AppTypography.labelMd.copyWith(color: cs.onSurfaceVariant)),
            ],
          ),
          const SizedBox(height: 8),
          if (appt.type == AppointmentType.lab && appt.testPanel != null)
            Text(appt.testPanel!, style: AppTypography.headlineSm.copyWith(color: cs.primary), textAlign: TextAlign.right),
          Text(appt.reason, style: AppTypography.bodyMd.copyWith(color: cs.onSurface), textAlign: TextAlign.right),
          if (appt.note != null && appt.note!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(appt.note!, style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant), textAlign: TextAlign.right),
          ],
          if (appt.isCancellable) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () async {
                  final confirm = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: Text(l.cancelAppointment),
                      content: Text(l.cancelAppointmentConfirm),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.notNow)),
                        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l.cancelAppointment)),
                      ],
                    ),
                  );
                  if (confirm != true) return;
                  try {
                    await ref.read(repositoryProvider).cancelAppointment(appt.id);
                    ref.invalidate(appointmentsProvider);
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l.appointmentCancelled)));
                    }
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context)
                          .showSnackBar(SnackBar(content: Text(friendlyError(e, isAr: isAr))));
                    }
                  }
                },
                icon: Icon(Icons.close_rounded, size: 16, color: cs.error),
                label: Text(l.cancelAppointment, style: AppTypography.labelMd.copyWith(color: cs.error)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _RequestAppointmentSheet extends ConsumerStatefulWidget {
  const _RequestAppointmentSheet();

  @override
  ConsumerState<_RequestAppointmentSheet> createState() => _RequestAppointmentSheetState();
}

class _RequestAppointmentSheetState extends ConsumerState<_RequestAppointmentSheet> {
  final _reasonCtrl = TextEditingController();
  final _testPanelCtrl = TextEditingController();
  AppointmentType _type = AppointmentType.clinic;
  DateTime? _date;
  String? _doctorId;
  bool _busy = false;

  @override
  void dispose() {
    _reasonCtrl.dispose();
    _testPanelCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l = AppLocalizations.of(context);
    final isAr = ref.read(localeProvider).languageCode == 'ar';
    if (_date == null || _reasonCtrl.text.trim().length < 3) return;
    if (_type == AppointmentType.lab && _testPanelCtrl.text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).requestAppointment(
            preferredDate: _date!,
            reason: _reasonCtrl.text.trim(),
            doctorId: _type == AppointmentType.clinic ? _doctorId : null,
            type: _type,
            testPanel: _type == AppointmentType.lab ? _testPanelCtrl.text.trim() : null,
          );
      ref.invalidate(appointmentsProvider);
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l.appointmentRequestSent)));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(friendlyError(e, isAr: isAr))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final cs = Theme.of(context).colorScheme;
    final isAr = ref.watch(localeProvider).languageCode == 'ar';
    final doctorsAsync = ref.watch(doctorsProvider);

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Container(
          margin: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: cs.surfaceContainerLowest, borderRadius: BorderRadius.circular(24)),
          padding: const EdgeInsets.all(20),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(l.requestAppointment, style: AppTypography.headlineMd.copyWith(color: cs.onSurface)),
                const SizedBox(height: 16),
                Text(l.chooseAppointmentType, style: AppTypography.labelLg.copyWith(color: cs.onSurface)),
                const SizedBox(height: 6),
                SegmentedButton<AppointmentType>(
                  segments: [
                    ButtonSegment(
                      value: AppointmentType.clinic,
                      icon: const Icon(Icons.local_hospital_rounded, size: 18),
                      label: Text(l.appointmentTypeClinic),
                    ),
                    ButtonSegment(
                      value: AppointmentType.lab,
                      icon: const Icon(Icons.biotech_rounded, size: 18),
                      label: Text(l.appointmentTypeLab),
                    ),
                  ],
                  selected: {_type},
                  onSelectionChanged: (s) => setState(() => _type = s.first),
                ),
                const SizedBox(height: 12),
                if (_type == AppointmentType.lab) ...[
                  Text(l.testPanelLabel, style: AppTypography.labelLg.copyWith(color: cs.onSurface)),
                  const SizedBox(height: 6),
                  TextField(
                    controller: _testPanelCtrl,
                    maxLength: 120,
                    decoration: InputDecoration(hintText: l.testPanelHint),
                  ),
                  const SizedBox(height: 8),
                ],
                Text(l.appointmentReasonLabel, style: AppTypography.labelLg.copyWith(color: cs.onSurface)),
                const SizedBox(height: 6),
                TextField(controller: _reasonCtrl, maxLength: 300, maxLines: 2),
                const SizedBox(height: 8),
                Text(l.preferredDateLabel, style: AppTypography.labelLg.copyWith(color: cs.onSurface)),
                const SizedBox(height: 6),
                OutlinedButton.icon(
                  onPressed: () async {
                    final now = DateTime.now();
                    final picked = await showDatePicker(
                      context: context,
                      firstDate: now,
                      lastDate: now.add(const Duration(days: 120)),
                      initialDate: now.add(const Duration(days: 1)),
                    );
                    if (picked != null) setState(() => _date = picked);
                  },
                  icon: Icon(Icons.calendar_month_rounded, color: cs.primary),
                  label: Text(
                    _date == null ? l.preferredDateLabel : DateFormat.yMMMd(isAr ? 'ar' : 'en').format(_date!),
                  ),
                ),
                if (_type == AppointmentType.clinic) ...[
                  const SizedBox(height: 8),
                  Text(l.chooseDoctorOptional, style: AppTypography.labelLg.copyWith(color: cs.onSurface)),
                  const SizedBox(height: 6),
                  doctorsAsync.when(
                    data: (doctors) => DropdownButtonFormField<String?>(
                      value: _doctorId,
                      items: [
                        DropdownMenuItem(value: null, child: Text(l.noPreference)),
                        for (final d in doctors)
                          DropdownMenuItem(value: d.id, child: Text(d.name.pick(Locale(isAr ? 'ar' : 'en')))),
                      ],
                      onChanged: (v) => setState(() => _doctorId = v),
                    ),
                    loading: () => const LinearProgressIndicator(),
                    error: (_, __) => const SizedBox.shrink(),
                  ),
                ],
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: _busy ? null : _submit,
                  child: _busy
                      ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: cs.onPrimary))
                      : Text(l.submitRequest),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}


