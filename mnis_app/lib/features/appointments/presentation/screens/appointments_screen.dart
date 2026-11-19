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
          if (appt.doctorName != null &&
              (appt.doctorName!.ar.isNotEmpty || appt.doctorName!.en.isNotEmpty)) ...[
            const SizedBox(height: 4),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Flexible(
                  child: Text(
                    appt.doctorSpeciality != null &&
                            (appt.doctorSpeciality!.ar.isNotEmpty ||
                                appt.doctorSpeciality!.en.isNotEmpty)
                        ? '${appt.doctorName!.pick(Locale(isAr ? 'ar' : 'en'))} • ${appt.doctorSpeciality!.pick(Locale(isAr ? 'ar' : 'en'))}'
                        : appt.doctorName!.pick(Locale(isAr ? 'ar' : 'en')),
                    style: AppTypography.labelSm.copyWith(color: cs.secondary),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 4),
                Icon(Icons.medical_services_rounded, size: 13, color: cs.secondary),
              ],
            ),
          ],
          if (appt.facilityName != null &&
              (appt.facilityName!.ar.isNotEmpty || appt.facilityName!.en.isNotEmpty)) ...[
            const SizedBox(height: 2),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Flexible(
                  child: Text(
                    appt.facilityName!.pick(Locale(isAr ? 'ar' : 'en')),
                    style: AppTypography.labelSm.copyWith(color: cs.primary),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 4),
                Icon(
                  appt.type == AppointmentType.lab ? Icons.biotech_rounded : Icons.location_city_rounded,
                  size: 13,
                  color: cs.primary,
                ),
              ],
            ),
          ],
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
  final _providerSearchCtrl = TextEditingController();
  String _providerSearch = '';
  AppointmentType _type = AppointmentType.clinic;
  DateTime? _date;
  String? _doctorId;
  String? _labId;
  List<String> _slots = const [];
  String? _selectedTime;
  bool _loadingSlots = false;
  bool _busy = false;

  static const _commonPanels = [
    'Complete Blood Count (CBC)',
    'HbA1c & Fasting Glucose',
    'Liver & Kidney Function (LFT/KFT)',
    'Lipid Profile',
    'Thyroid Profile (TSH/FT4)',
  ];

  @override
  void dispose() {
    _reasonCtrl.dispose();
    _testPanelCtrl.dispose();
    _providerSearchCtrl.dispose();
    super.dispose();
  }

  Future<void> _fetchDoctorSlots() async {
    if (_type != AppointmentType.clinic || _doctorId == null || _date == null) {
      if (mounted) setState(() => _slots = const []);
      return;
    }
    final d = _date!;
    final dateYmd =
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    setState(() {
      _loadingSlots = true;
      _selectedTime = null;
    });
    try {
      final list = await ref.read(repositoryProvider).doctorSlots(_doctorId!, dateYmd);
      if (mounted) {
        setState(() {
          _slots = list;
          if (list.isNotEmpty) _selectedTime = list.first;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _slots = const []);
    } finally {
      if (mounted) setState(() => _loadingSlots = false);
    }
  }

  Future<void> _submit() async {
    final l = AppLocalizations.of(context);
    final isAr = ref.read(localeProvider).languageCode == 'ar';
    void warn(String msg) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
    }

    if (_type == AppointmentType.clinic && _doctorId == null) {
      warn(isAr ? 'اختر الطبيب والعيادة أولاً' : 'Please choose a physician & clinic');
      return;
    }
    if (_type == AppointmentType.lab && _labId == null) {
      warn(isAr ? 'اختر المعمل المسجل أولاً' : 'Please choose a registered laboratory');
      return;
    }
    if (_type == AppointmentType.lab && _testPanelCtrl.text.trim().isEmpty) {
      warn(isAr ? 'حدد نوع التحليل المطلوب' : 'Please enter the required lab test panel');
      return;
    }
    if (_date == null) {
      warn(isAr ? 'اختر التاريخ المفضل للحجز' : 'Please pick a preferred date');
      return;
    }
    if (_reasonCtrl.text.trim().length < 3) {
      warn(isAr ? 'اكتب سبب الحجز باختصار (3 أحرف على الأقل)' : 'Please enter a short booking reason');
      return;
    }

    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).requestAppointment(
            preferredDate: _date!,
            preferredTime: _type == AppointmentType.clinic ? _selectedTime : null,
            reason: _reasonCtrl.text.trim(),
            doctorId: _type == AppointmentType.clinic ? _doctorId : null,
            labId: _type == AppointmentType.lab ? _labId : null,
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
    final loc = Locale(isAr ? 'ar' : 'en');
    final doctorsAsync = ref.watch(doctorsProvider);
    final labsAsync = ref.watch(labsProvider);

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
                const SizedBox(height: 14),
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
                  onSelectionChanged: (s) {
                    setState(() {
                      _type = s.first;
                      _slots = const [];
                      _selectedTime = null;
                      _providerSearch = '';
                      _providerSearchCtrl.clear();
                    });
                    if (_type == AppointmentType.clinic) _fetchDoctorSlots();
                  },
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: cs.secondaryContainer.withOpacity(0.35),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        _type == AppointmentType.clinic ? Icons.support_agent_rounded : Icons.biotech_rounded,
                        size: 18,
                        color: cs.secondary,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _type == AppointmentType.clinic
                              ? (isAr
                                  ? 'يُرسل طلب الحجز إلى الموظف المساعد للطبيب المختار لتأكيد الموعد وإدراجك بطابور العيادة.'
                                  : 'Sent directly to the selected physician\'s clinic assistant to confirm and queue your visit.')
                              : (isAr
                                  ? 'يُرسل طلب الحجز مباشرةً إلى موظف استقبال المعمل المختار لتأكيد الموعد وإصدار باركود العينة.'
                                  : 'Sent directly to the selected laboratory\'s reception desk to confirm and issue your sample barcode.'),
                          style: AppTypography.labelSm.copyWith(color: cs.onSurface),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                if (_type == AppointmentType.clinic) ...[
                  Text(isAr ? 'اختر الطبيب والعيادة / المستشفى' : 'Choose Physician & Clinic / Hospital',
                      style: AppTypography.labelLg.copyWith(color: cs.onSurface)),
                  const SizedBox(height: 6),
                  TextField(
                    controller: _providerSearchCtrl,
                    decoration: InputDecoration(
                      prefixIcon: const Icon(Icons.search_rounded, size: 18),
                      hintText: isAr ? 'ابحث باسم الطبيب، التخصص، أو المستشفى/المدينة...' : 'Filter by physician, specialty, or hospital/city...',
                      isDense: true,
                    ),
                    onChanged: (v) => setState(() => _providerSearch = v.trim().toLowerCase()),
                  ),
                  const SizedBox(height: 8),
                  doctorsAsync.when(
                    data: (doctors) {
                      final filteredDocs = _providerSearch.isEmpty
                          ? doctors
                          : doctors
                              .where((d) => '${d.name.en} ${d.name.ar} ${d.speciality.en} ${d.speciality.ar} ${d.facility.en} ${d.facility.ar}'
                                  .toLowerCase()
                                  .contains(_providerSearch))
                              .toList();
                      final selectedVal = filteredDocs.any((d) => d.id == _doctorId) ? _doctorId : null;
                      return DropdownButtonFormField<String>(
                        isExpanded: true,
                        value: selectedVal,
                        hint: Text(
                          filteredDocs.isEmpty
                              ? (isAr ? 'لا توجد عيادة مطابقة للبحث' : 'No matching clinics')
                              : (isAr ? '— اختر من أطباء مصر المسجلين —' : '— Select Physician & Clinic —'),
                        ),
                        items: [
                          for (final d in filteredDocs)
                            DropdownMenuItem(
                              value: d.id,
                              child: Text(
                                '${d.name.pick(loc)} — ${d.speciality.pick(loc)}${d.facility.pick(loc).isNotEmpty ? ' (${d.facility.pick(loc)})' : ''}',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                        ],
                        onChanged: (v) {
                          setState(() => _doctorId = v);
                          _fetchDoctorSlots();
                        },
                      );
                    },
                    loading: () => const LinearProgressIndicator(),
                    error: (_, __) => Text(
                      isAr ? 'تعذر تحميل قائمة الأطباء' : 'Could not load physicians list',
                      style: AppTypography.labelSm.copyWith(color: cs.error),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                if (_type == AppointmentType.lab) ...[
                  Text(isAr ? 'اختر المعمل المسجل بالمنظومة' : 'Choose Registered Laboratory Facility',
                      style: AppTypography.labelLg.copyWith(color: cs.onSurface)),
                  const SizedBox(height: 6),
                  TextField(
                    controller: _providerSearchCtrl,
                    decoration: InputDecoration(
                      prefixIcon: const Icon(Icons.search_rounded, size: 18),
                      hintText: isAr ? 'ابحث باسم المعمل أو الفرع أو المحافظة...' : 'Filter by lab name, branch, or city...',
                      isDense: true,
                    ),
                    onChanged: (v) => setState(() => _providerSearch = v.trim().toLowerCase()),
                  ),
                  const SizedBox(height: 8),
                  labsAsync.when(
                    data: (labs) {
                      final filteredLabs = _providerSearch.isEmpty
                          ? labs
                          : labs
                              .where((l) => '${l.name.en} ${l.name.ar} ${l.staffName.en} ${l.staffName.ar}'
                                  .toLowerCase()
                                  .contains(_providerSearch))
                              .toList();
                      final selectedLab = filteredLabs.any((l) => l.id == _labId) ? _labId : null;
                      return DropdownButtonFormField<String>(
                        isExpanded: true,
                        value: selectedLab,
                        hint: Text(
                          filteredLabs.isEmpty
                              ? (isAr ? 'لا يوجد معمل مطابق للبحث' : 'No matching labs')
                              : (isAr ? '— اختر من معامل التحاليل المعتمدة بمصر —' : '— Select Registered Egyptian Lab —'),
                        ),
                        items: [
                          for (final lab in filteredLabs)
                            DropdownMenuItem(
                              value: lab.id,
                              child: Text(
                                lab.name.pick(loc),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                        ],
                        onChanged: (v) => setState(() => _labId = v),
                      );
                    },
                    loading: () => const LinearProgressIndicator(),
                    error: (_, __) => Text(
                      isAr ? 'تعذر تحميل قائمة المعامل' : 'Could not load laboratories list',
                      style: AppTypography.labelSm.copyWith(color: cs.error),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(l.testPanelLabel, style: AppTypography.labelLg.copyWith(color: cs.onSurface)),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final panel in _commonPanels)
                        ActionChip(
                          label: Text(panel, style: AppTypography.labelSm),
                          onPressed: () => setState(() => _testPanelCtrl.text = panel),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
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
                    if (picked != null) {
                      setState(() => _date = picked);
                      _fetchDoctorSlots();
                    }
                  },
                  icon: Icon(Icons.calendar_month_rounded, color: cs.primary),
                  label: Text(
                    _date == null ? l.preferredDateLabel : DateFormat.yMMMd(isAr ? 'ar' : 'en').format(_date!),
                  ),
                ),
                if (_type == AppointmentType.clinic && _doctorId != null && _date != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    isAr ? 'المواعيد المتاحة في جدول الطبيب المختار:' : 'Physician Available Time Slots:',
                    style: AppTypography.labelLg.copyWith(color: cs.onSurface),
                  ),
                  const SizedBox(height: 6),
                  if (_loadingSlots)
                    const LinearProgressIndicator()
                  else if (_slots.isEmpty)
                    Text(
                      isAr ? 'لا توجد فترات متاحة في هذا اليوم — اختر يوماً آخر' : 'No open slots on this date',
                      style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant),
                    )
                  else
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final s in _slots)
                          ChoiceChip(
                            label: Text(s),
                            selected: _selectedTime == s,
                            onSelected: (sel) => setState(() => _selectedTime = sel ? s : null),
                          ),
                      ],
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


