import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' hide TextDirection;

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

enum _Filter { all, normal, abnormal }

class LabResultsScreen extends ConsumerStatefulWidget {
  const LabResultsScreen({super.key});

  @override
  ConsumerState<LabResultsScreen> createState() => _LabResultsScreenState();
}

class _LabResultsScreenState extends ConsumerState<LabResultsScreen> {
  _Filter _filter = _Filter.all;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final cs = Theme.of(context).colorScheme;
    final locale = ref.watch(localeProvider);
    final isAr = locale.languageCode == 'ar';
    final resultsAsync = ref.watch(labResultsProvider);
    final profileAsync = ref.watch(profileProvider);

    return Scaffold(
      backgroundColor: cs.surface,
      body: Directionality(
        textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(labResultsProvider);
            await ref.read(labResultsProvider.future).catchError((_) => <LabResultPanel>[]);
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
                        Text(isAr ? 'نتائج المعمل' : 'Lab Results',
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
                padding: const EdgeInsets.all(14),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Container(
                          width: 40, height: 40,
                          decoration: BoxDecoration(
                              color: cs.primary, borderRadius: BorderRadius.circular(10)),
                          child: Icon(Icons.biotech_rounded, color: cs.onPrimary, size: 22),
                        ),
                        const SizedBox(width: 10),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(l.labResultsTitle,
                                style: AppTypography.headlineSm.copyWith(color: cs.primary)),
                            Text(l.mnisSystem,
                                style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant)),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    AsyncValueView<List<LabResultPanel>>(
                      value: resultsAsync,
                      isAr: isAr,
                      onRetry: () => ref.invalidate(labResultsProvider),
                      builder: (context, panels) {
                        final filtered = switch (_filter) {
                          _Filter.all => panels,
                          _Filter.normal => panels.where((p) => !p.hasAbnormal).toList(),
                          _Filter.abnormal => panels.where((p) => p.hasAbnormal).toList(),
                        };
                        final abnormalCount = panels.where((p) => p.hasAbnormal).length;
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            SizedBox(
                              height: 36,
                              child: ListView(
                                scrollDirection: Axis.horizontal,
                                reverse: isAr,
                                children: [
                                  _FilterChip(
                                    label: '${l.filterAll} (${panels.length})',
                                    selected: _filter == _Filter.all,
                                    onTap: () => setState(() => _filter = _Filter.all),
                                    cs: cs,
                                  ),
                                  const SizedBox(width: 8),
                                  _FilterChip(
                                    label:
                                        '${isAr ? "طبيعية" : "Normal"} (${panels.length - abnormalCount})',
                                    selected: _filter == _Filter.normal,
                                    onTap: () => setState(() => _filter = _Filter.normal),
                                    cs: cs,
                                  ),
                                  const SizedBox(width: 8),
                                  _FilterChip(
                                    label: '${isAr ? "خارج النطاق" : "Abnormal"} ($abnormalCount)',
                                    selected: _filter == _Filter.abnormal,
                                    onTap: () => setState(() => _filter = _Filter.abnormal),
                                    cs: cs,
                                    dotColor: cs.error,
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 14),
                            if (filtered.isEmpty)
                              EmptyState(icon: Icons.biotech_outlined, message: l.labResultsEmpty)
                            else
                              for (final p in filtered) ...[
                                _LabPanelCard(l: l, cs: cs, isAr: isAr, locale: locale, panel: p),
                                const SizedBox(height: 12),
                              ],
                          ],
                        );
                      },
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

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  final ColorScheme cs;
  final Color? dotColor;
  const _FilterChip(
      {required this.label, required this.selected, required this.onTap, required this.cs, this.dotColor});

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
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (dotColor != null) ...[
            Container(
                width: 8, height: 8,
                decoration: BoxDecoration(shape: BoxShape.circle, color: selected ? cs.onPrimary : dotColor)),
            const SizedBox(width: 4),
          ],
          Text(label,
              style: AppTypography.labelMd
                  .copyWith(color: selected ? cs.onPrimary : cs.onSurfaceVariant)),
        ]),
      ),
    );
  }
}

class _LabPanelCard extends StatefulWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final bool isAr;
  final Locale locale;
  final LabResultPanel panel;
  const _LabPanelCard(
      {required this.l, required this.cs, required this.isAr, required this.locale, required this.panel});

  @override
  State<_LabPanelCard> createState() => _LabPanelCardState();
}

class _LabPanelCardState extends State<_LabPanelCard> {
  bool _expanded = true;

  Color _flagColor(ResultFlag f, ColorScheme cs) => switch (f) {
        ResultFlag.critical => cs.error,
        ResultFlag.high => cs.error,
        ResultFlag.low => AppColors.secondary,
        ResultFlag.normal => cs.onSurface,
      };

  @override
  Widget build(BuildContext context) {
    final cs = widget.cs;
    final isAr = widget.isAr;
    final p = widget.panel;
    final df = DateFormat.yMMMd(isAr ? 'ar' : 'en');

    return Container(
      padding: const EdgeInsets.all(16),
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
              StatusBadge(
                label: isAr ? 'معتمد وموقع رقمياً' : 'Digitally verified',
                backgroundColor: cs.surfaceContainerHigh,
                textColor: cs.secondary,
                icon: Icons.verified,
                fontSize: 10,
              ),
              Text('#${p.barcode}', style: AppTypography.mono.copyWith(color: cs.onSurfaceVariant)),
            ],
          ),
          const SizedBox(height: 8),
          Text(p.panel.pick(widget.locale),
              style: AppTypography.headlineSm.copyWith(color: cs.primary),
              textAlign: TextAlign.right),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(p.verifiedAt == null ? '' : df.format(p.verifiedAt!),
                  style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant)),
              Text(p.sampleType.pick(widget.locale),
                  style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant)),
            ],
          ),
          const SizedBox(height: 12),
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: BorderRadius.circular(10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: p.hasAbnormal ? cs.errorContainer : cs.tertiaryContainer.withOpacity(0.5),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(_expanded ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded,
                    size: 16,
                    color: p.hasAbnormal ? cs.onErrorContainer : cs.onTertiaryContainer),
                const SizedBox(width: 4),
                Text(
                  p.hasAbnormal
                      ? (isAr
                          ? '${p.rows.where((r) => r.flag != ResultFlag.normal).length} خارج النطاق الطبيعي'
                          : '${p.rows.where((r) => r.flag != ResultFlag.normal).length} out of normal range')
                      : (isAr ? 'كل المؤشرات طبيعية' : 'All indicators normal'),
                  style: AppTypography.labelMd.copyWith(
                      color: p.hasAbnormal ? cs.onErrorContainer : cs.onTertiaryContainer),
                ),
              ]),
            ),
          ),
          if (_expanded) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration:
                  BoxDecoration(color: cs.surfaceContainerLow, borderRadius: BorderRadius.circular(10)),
              child: Column(
                children: [
                  for (final row in p.rows) ...[
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Text('${row.value} ${row.unit}',
                            style: AppTypography.headlineSm.copyWith(
                                color: _flagColor(row.flag, cs), fontWeight: FontWeight.w700)),
                        const Spacer(),
                        Expanded(
                          flex: 2,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(row.analyte.pick(widget.locale),
                                  textAlign: TextAlign.right,
                                  style: AppTypography.bodySm.copyWith(color: cs.onSurface)),
                              Text('${row.refLow}–${row.refHigh} ${row.unit}',
                                  style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant)),
                            ],
                          ),
                        ),
                      ],
                    ),
                    if (row != p.rows.last)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Divider(height: 1, color: cs.outlineVariant.withOpacity(0.4)),
                      ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}


