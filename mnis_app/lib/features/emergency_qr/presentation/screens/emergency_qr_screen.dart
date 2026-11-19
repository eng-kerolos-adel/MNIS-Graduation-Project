import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' hide TextDirection;
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../../core/l10n/app_localizations.dart';
import '../../../../core/models/models.dart';
import '../../../../core/providers/data_providers.dart';
import '../../../../core/providers/emergency_contacts_provider.dart';
import '../../../../core/providers/session_provider.dart';
import '../../../../core/router/app_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/utils/providers.dart';
import '../../../../core/utils/shared_widgets.dart';
import '../../../../core/widgets/async_view.dart';

class EmergencyQrScreen extends ConsumerStatefulWidget {
  final bool fromLogin;
  const EmergencyQrScreen({super.key, required this.fromLogin});

  @override
  ConsumerState<EmergencyQrScreen> createState() => _EmergencyQrScreenState();
}

class _EmergencyQrScreenState extends ConsumerState<EmergencyQrScreen>
    with TickerProviderStateMixin {
  late AnimationController _pulseCtrl;
  late Animation<double> _pulse;
  late AnimationController _glowCtrl;
  late Animation<double> _glow;
  bool _refreshing = false;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1200))
      ..repeat(reverse: true);
    _pulse = Tween(begin: 0.85, end: 1.0)
        .animate(CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut));
    _glowCtrl =
        AnimationController(vsync: this, duration: const Duration(seconds: 2))
          ..repeat(reverse: true);
    _glow = Tween(begin: 0.3, end: 0.7)
        .animate(CurvedAnimation(parent: _glowCtrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    _glowCtrl.dispose();
    super.dispose();
  }

  Future<void> _regenerate(bool isAr) async {
    setState(() => _refreshing = true);
    final before = ref.read(emergencyCardUpdatedAtProvider).value;
    ref.invalidate(emergencyCardProvider);
    ref.invalidate(emergencyCardUpdatedAtProvider);
    await ref.read(emergencyCardProvider.future).catchError((_) => null);
    final after = await ref.read(emergencyCardUpdatedAtProvider.future);
    if (!mounted) return;
    setState(() => _refreshing = false);
    final success = after != null && after != before;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(success
          ? AppLocalizations.of(context).codeRegenerated
          : AppLocalizations.of(context).noInternet),
      behavior: SnackBarBehavior.floating,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final cs = Theme.of(context).colorScheme;
    final locale = ref.watch(localeProvider);
    final isAr = locale.languageCode == 'ar';
    final cardAsync = ref.watch(emergencyCardProvider);
    final updatedAtAsync = ref.watch(emergencyCardUpdatedAtProvider);

    return Scaffold(
      backgroundColor: cs.surface,
      body: Directionality(
        textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
        child: Column(
          children: [
            SafeArea(
              bottom: false,
              child: Container(
                height: 56,
                color: cs.surface.withOpacity(0.95),
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(
                  children: [
                    if (widget.fromLogin)
                      IconButton(
                        icon: Icon(
                          isAr ? Icons.arrow_forward_rounded : Icons.arrow_back_rounded,
                          color: cs.onSurface,
                        ),
                        onPressed: () => context.go(AppRoutes.login),
                      ),
                    const MnisShieldLogo(size: 28),
                    const SizedBox(width: 8),
                    Text(l.emergencyQrTitle,
                        style: AppTypography.headlineSm.copyWith(color: cs.onSurface)),
                    const Spacer(),
                  ],
                ),
              ),
            ),
            _EmergencyBanner(l: l, cs: cs, isAr: isAr),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: AsyncValueView<EmergencyCard?>(
                  value: cardAsync,
                  isAr: isAr,
                  onRetry: () => ref.invalidate(emergencyCardProvider),
                  builder: (context, card) {
                    if (card == null) {
                      return _NoCachedData(l: l, cs: cs, isAr: isAr);
                    }
                    final updatedAt = updatedAtAsync.value;
                    return Column(
                      children: [
                        _QrHubCard(
                          l: l, cs: cs, isAr: isAr, card: card, updatedAt: updatedAt,
                          pulse: _pulse, glow: _glow,
                        ),
                        const SizedBox(height: 14),
                        _VitalsGrid(l: l, cs: cs, isAr: isAr, card: card),
                        const SizedBox(height: 14),
                        _OrganDonorToggleCard(cs: cs, isAr: isAr, card: card),
                        const SizedBox(height: 14),
                        _AllergyStrip(cs: cs, isAr: isAr, card: card, locale: locale),
                        const SizedBox(height: 14),
                        const _EmergencyContacts(),
                        const SizedBox(height: 14),
                        _ActionButtons(
                          l: l, cs: cs, isAr: isAr, card: card,
                          refreshing: _refreshing, onRegenerate: () => _regenerate(isAr),
                        ),
                        const SizedBox(height: 24),
                      ],
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoCachedData extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final bool isAr;
  const _NoCachedData({required this.l, required this.cs, required this.isAr});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 60),
      child: Column(
        children: [
          Icon(Icons.wifi_off_rounded, size: 44, color: cs.outline),
          const SizedBox(height: 12),
          Text(l.neverSynced,
              style: AppTypography.bodyMd.copyWith(color: cs.onSurfaceVariant),
              textAlign: TextAlign.center),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: () => launchUrl(Uri.parse('tel:137')),
            icon: Icon(Icons.call_rounded, color: cs.onError),
            label: Text(l.callEmergency,
                style: AppTypography.headlineSm.copyWith(color: cs.onError)),
            style: ElevatedButton.styleFrom(backgroundColor: cs.error),
          ),
        ],
      ),
    );
  }
}

// ── Emergency Banner (unchanged, decorative) ─────────────────────────────────
class _EmergencyBanner extends StatefulWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final bool isAr;
  const _EmergencyBanner({required this.l, required this.cs, required this.isAr});

  @override
  State<_EmergencyBanner> createState() => _EmergencyBannerState();
}

class _EmergencyBannerState extends State<_EmergencyBanner>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 800))
      ..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = widget.cs;
    final l = widget.l;
    return Container(
      color: cs.error,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
                color: cs.onError.withOpacity(0.2), borderRadius: BorderRadius.circular(20)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              AnimatedBuilder(
                animation: _ctrl,
                builder: (_, __) => Container(
                  width: 8, height: 8,
                  decoration: BoxDecoration(
                      shape: BoxShape.circle, color: cs.onError.withOpacity(_ctrl.value)),
                ),
              ),
              const SizedBox(width: 4),
              Text(l.activeStatus,
                  style: AppTypography.labelSm
                      .copyWith(color: cs.onError, fontWeight: FontWeight.w700)),
            ]),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(l.emergencyBanner,
                      style: AppTypography.labelSm
                          .copyWith(color: cs.onError.withOpacity(0.8), letterSpacing: 0.5)),
                  Text(l.emergencyBannerSub,
                      style: AppTypography.labelSm.copyWith(color: cs.onError),
                      maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.right),
                ],
              ),
            ),
          ),
          AnimatedBuilder(
            animation: _ctrl,
            builder: (_, child) => Opacity(opacity: 0.6 + _ctrl.value * 0.4, child: child),
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: cs.onError.withOpacity(0.15), shape: BoxShape.circle),
              child: Icon(Icons.warning_rounded, color: cs.onError, size: 20),
            ),
          ),
        ],
      ),
    );
  }
}

String _emergencyPayload(EmergencyCard c, DateTime? updatedAt) {
  final allergies = c.allergies.map((a) => a.en).join(',');
  final conditions = c.chronicConditions.map((x) => x.en).join(',');
  return 'MNIS-EMERGENCY:{"mti":"${c.mti}","blood":"${c.bloodType}",'
      '"allergies":[$allergies],"conditions":[$conditions],'
      '"organDonor":${c.organDonor},"emergency":"137",'
      '"updatedAt":"${(updatedAt ?? DateTime.now()).toIso8601String()}"}';
}

// ── QR Hub Card ───────────────────────────────────────────────────────────────
class _QrHubCard extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final bool isAr;
  final EmergencyCard card;
  final DateTime? updatedAt;
  final Animation<double> pulse;
  final Animation<double> glow;

  const _QrHubCard({
    required this.l, required this.cs, required this.isAr, required this.card,
    required this.updatedAt, required this.pulse, required this.glow,
  });

  @override
  Widget build(BuildContext context) {
    final qrData = _emergencyPayload(card, updatedAt);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: AppColors.primary.withOpacity(0.08), blurRadius: 16)],
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                    color: cs.surfaceContainerHigh, borderRadius: BorderRadius.circular(20)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.verified_user_rounded, size: 14, color: cs.secondary),
                  const SizedBox(width: 4),
                  Text(isAr ? 'معتمد رسمياً' : 'Officially Verified',
                      style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant)),
                ]),
              ),
              Row(children: [
                Icon(Icons.security_rounded, size: 16, color: cs.error),
                const SizedBox(width: 6),
                Text(l.quickRescue,
                    style: AppTypography.labelLg
                        .copyWith(color: cs.primary, fontWeight: FontWeight.w700)),
              ]),
            ],
          ),
          const SizedBox(height: 20),
          AnimatedBuilder(
            animation: glow,
            builder: (_, child) => Stack(alignment: Alignment.center, children: [
              Container(
                width: 280, height: 280,
                decoration: BoxDecoration(
                    shape: BoxShape.circle, color: cs.error.withOpacity(glow.value * 0.04)),
              ),
              Container(
                width: 260, height: 260,
                decoration: BoxDecoration(
                    shape: BoxShape.circle, color: cs.secondary.withOpacity(glow.value * 0.04)),
              ),
              child!,
            ]),
            child: AnimatedBuilder(
              animation: pulse,
              builder: (_, child) => Transform.scale(scale: pulse.value, child: child),
              child: Container(
                width: 240, height: 240,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: cs.surfaceContainerLowest,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                        color: AppColors.primary.withOpacity(0.12),
                        blurRadius: 20, offset: const Offset(0, 6)),
                  ],
                ),
                child: QrImageView(
                  data: qrData,
                  version: QrVersions.auto,
                  size: 216,
                  errorCorrectionLevel: QrErrorCorrectLevel.H,
                  eyeStyle: QrEyeStyle(eyeShape: QrEyeShape.square, color: cs.primary),
                  dataModuleStyle:
                      QrDataModuleStyle(dataModuleShape: QrDataModuleShape.square, color: cs.onSurface),
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.lock_rounded, size: 12, color: cs.onSurfaceVariant),
              const SizedBox(width: 4),
              Text(
                updatedAt == null
                    ? l.lastSynced
                    : '${l.lastSynced}: ${DateFormat.yMMMd(isAr ? "ar" : "en").add_Hm().format(updatedAt!)}',
                style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              PulsingDot(color: cs.tertiary, size: 8),
              const SizedBox(width: 6),
              Text(isAr ? 'يعمل بدون إنترنت' : 'Works without internet',
                  style: AppTypography.labelSm.copyWith(color: cs.tertiary)),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Vitals Grid ───────────────────────────────────────────────────────────────
class _VitalsGrid extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final bool isAr;
  final EmergencyCard card;
  const _VitalsGrid({required this.l, required this.cs, required this.isAr, required this.card});

  @override
  Widget build(BuildContext context) {
    final vitals = [
      (
        label: l.bloodType, value: card.bloodType, icon: Icons.water_drop,
        color: cs.error, bg: cs.errorContainer, fgColor: cs.onErrorContainer, mono: true,
      ),
      (
        label: isAr ? 'العمر' : 'Age', value: '${card.age} ${isAr ? "سنة" : "y"}',
        icon: Icons.person_rounded, color: cs.secondary,
        bg: cs.secondaryContainer.withOpacity(0.4), fgColor: cs.onSecondaryContainer, mono: false,
      ),
      (
        label: isAr ? 'الهوية الطبية' : 'Medical ID', value: card.mti,
        icon: Icons.badge_rounded, color: cs.primary,
        bg: cs.primaryContainer.withOpacity(0.2), fgColor: cs.primary, mono: true,
      ),
      (
        label: isAr ? 'التبرع بالأعضاء' : 'Organ donor',
        value: card.organDonor ? (isAr ? 'نعم' : 'Yes') : (isAr ? 'لا' : 'No'),
        icon: Icons.volunteer_activism_rounded,
        color: cs.tertiary, bg: cs.tertiaryContainer.withOpacity(0.5),
        fgColor: cs.onTertiaryContainer, mono: false,
      ),
    ];
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 1.6,
      children: vitals
          .map((v) => Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: v.bg, borderRadius: BorderRadius.circular(14)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Icon(v.icon, size: 18, color: v.color),
                        Text(v.label,
                            style: AppTypography.labelSm.copyWith(color: v.fgColor.withOpacity(0.7))),
                      ],
                    ),
                    Text(
                      v.value,
                      style: (v.mono ? AppTypography.mono : AppTypography.headlineMd).copyWith(
                        color: v.fgColor, fontWeight: FontWeight.w700,
                        fontSize: v.value.length > 12 ? 12 : null,
                      ),
                      textAlign: TextAlign.right,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ))
          .toList(),
    );
  }
}

// ── Allergy Strip ─────────────────────────────────────────────────────────────
class _AllergyStrip extends StatelessWidget {
  final ColorScheme cs;
  final bool isAr;
  final EmergencyCard card;
  final Locale locale;
  const _AllergyStrip(
      {required this.cs, required this.isAr, required this.card, required this.locale});

  @override
  Widget build(BuildContext context) {
    final hasAllergies = card.allergies.isNotEmpty;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: hasAllergies ? cs.errorContainer : cs.tertiaryContainer.withOpacity(0.4),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color: (hasAllergies ? cs.error : cs.tertiary).withOpacity(0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  hasAllergies
                      ? (isAr ? 'حساسية أدوية — تحذير طوارئ' : 'DRUG ALLERGY — EMERGENCY WARNING')
                      : (isAr ? 'لا توجد حساسية دوائية معروفة' : 'No known drug allergies'),
                  style: AppTypography.labelLg.copyWith(
                      color: hasAllergies ? cs.onErrorContainer : cs.onTertiaryContainer,
                      fontWeight: FontWeight.w700),
                  textAlign: TextAlign.right,
                ),
                if (hasAllergies) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6, runSpacing: 6, alignment: WrapAlignment.end,
                    children: card.allergies
                        .map((a) => Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: cs.surfaceContainerLowest.withOpacity(0.8),
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: cs.error.withOpacity(0.3)),
                              ),
                              child: Text(a.pick(locale),
                                  style: AppTypography.labelMd
                                      .copyWith(color: cs.error, fontWeight: FontWeight.w700)),
                            ))
                        .toList(),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 12),
          Container(
            width: 40, height: 40,
            decoration: BoxDecoration(
                color: hasAllergies ? cs.error : cs.tertiary, shape: BoxShape.circle),
            child: Icon(hasAllergies ? Icons.emergency_rounded : Icons.check_rounded,
                size: 20, color: hasAllergies ? cs.onError : cs.onTertiary),
          ),
        ],
      ),
    );
  }
}

// ── Emergency Contacts (real, on-device, editable) ────────────────────────────
class _EmergencyContacts extends ConsumerWidget {
  const _EmergencyContacts();

  Future<void> _addContact(BuildContext context, WidgetRef ref) async {
    final l = AppLocalizations.of(context);
    final nameCtrl = TextEditingController();
    final phoneCtrl = TextEditingController();
    final added = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.addContact),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: nameCtrl, decoration: InputDecoration(labelText: l.contactNameLabel)),
          const SizedBox(height: 8),
          TextField(
            controller: phoneCtrl,
            keyboardType: TextInputType.phone,
            textDirection: TextDirection.ltr,
            decoration: InputDecoration(labelText: l.contactPhoneLabel),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.cancel)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l.addContact)),
        ],
      ),
    );
    if (added == true && nameCtrl.text.trim().isNotEmpty && phoneCtrl.text.trim().isNotEmpty) {
      await ref
          .read(emergencyContactsProvider.notifier)
          .add(EmergencyContact(nameCtrl.text.trim(), phoneCtrl.text.trim()));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final cs = Theme.of(context).colorScheme;
    final contacts = ref.watch(emergencyContactsProvider);

    return Container(
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
              if (contacts.length < 3)
                TextButton.icon(
                  onPressed: () => _addContact(context, ref),
                  icon: Icon(Icons.add_rounded, size: 18, color: cs.secondary),
                  label: Text(l.addContact,
                      style: AppTypography.labelMd.copyWith(color: cs.secondary)),
                ),
              Text(l.emergencyContacts,
                  style: AppTypography.headlineSm.copyWith(color: cs.onSurface)),
            ],
          ),
          const SizedBox(height: 8),
          if (contacts.isEmpty)
            EmptyState(icon: Icons.contacts_rounded, message: l.noContactsYet)
          else
            ...contacts.asMap().entries.map((entry) {
              final i = entry.key;
              final c = entry.value;
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration:
                    BoxDecoration(color: cs.surfaceContainerLow, borderRadius: BorderRadius.circular(10)),
                child: Row(
                  children: [
                    InkWell(
                      onTap: () => launchUrl(Uri.parse('tel:${c.phone}')),
                      borderRadius: BorderRadius.circular(20),
                      child: Container(
                        width: 36, height: 36,
                        decoration: BoxDecoration(color: cs.primary, shape: BoxShape.circle),
                        child: Icon(Icons.call_rounded, size: 16, color: cs.onPrimary),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(c.name,
                              style: AppTypography.bodyMd.copyWith(color: cs.onSurface),
                              overflow: TextOverflow.ellipsis),
                          Text(c.phone,
                              textDirection: TextDirection.ltr,
                              style: AppTypography.mono
                                  .copyWith(color: cs.onSurfaceVariant, fontSize: 12)),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: Icon(Icons.delete_outline_rounded, size: 20, color: cs.outline),
                      onPressed: () =>
                          ref.read(emergencyContactsProvider.notifier).removeAt(i),
                    ),
                  ],
                ),
              );
            }),
          if (contacts.length >= 3)
            Text(l.maxContactsReached,
                style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant)),
        ],
      ),
    );
  }
}

// ── Action Buttons ────────────────────────────────────────────────────────────
class _ActionButtons extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  final bool isAr;
  final EmergencyCard card;
  final bool refreshing;
  final VoidCallback onRegenerate;
  const _ActionButtons({
    required this.l, required this.cs, required this.isAr, required this.card,
    required this.refreshing, required this.onRegenerate,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ElevatedButton.icon(
          onPressed: () => launchUrl(Uri.parse('tel:137')),
          icon: Icon(Icons.call_rounded, color: cs.onError),
          label: Text(l.callEmergency,
              style: AppTypography.headlineSm.copyWith(color: cs.onError)),
          style: ElevatedButton.styleFrom(
            backgroundColor: cs.error,
            minimumSize: const Size(double.infinity, 52),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () {
            final name = card.fullName.pick(Locale(isAr ? 'ar' : 'en'));
            final allergies = card.allergies.map((a) => a.pick(Locale(isAr ? 'ar' : 'en'))).join(', ');
            Share.share(
              'MNIS Emergency — ${isAr ? "رمز الطوارئ الطبي" : "Medical emergency card"}\n\n'
              '${isAr ? "المريض" : "Patient"}: $name | ${isAr ? "الفصيلة" : "Blood"}: ${card.bloodType}'
              '${allergies.isEmpty ? '' : ' | ${isAr ? "حساسية" : "Allergies"}: $allergies'}',
              subject: 'MNIS Emergency',
            );
          },
          icon: Icon(Icons.share_rounded, color: cs.secondary),
          label: Text(l.shareEmergencyQr, style: AppTypography.labelLg.copyWith(color: cs.secondary)),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(double.infinity, 48),
            side: BorderSide(color: cs.secondary),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
        const SizedBox(height: 10),
        TextButton.icon(
          onPressed: refreshing ? null : onRegenerate,
          icon: refreshing
              ? SizedBox(
                  width: 16, height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: cs.onSurfaceVariant))
              : Icon(Icons.refresh_rounded, color: cs.onSurfaceVariant),
          label: Text(l.regenerateQr, style: AppTypography.labelLg.copyWith(color: cs.onSurfaceVariant)),
        ),
      ],
    );
  }
}

class _OrganDonorToggleCard extends ConsumerStatefulWidget {
  final ColorScheme cs;
  final bool isAr;
  final EmergencyCard card;
  const _OrganDonorToggleCard({
    required this.cs,
    required this.isAr,
    required this.card,
  });

  @override
  ConsumerState<_OrganDonorToggleCard> createState() => _OrganDonorToggleCardState();
}

class _OrganDonorToggleCardState extends ConsumerState<_OrganDonorToggleCard> {
  bool _saving = false;

  Future<void> _toggle(bool val) async {
    setState(() => _saving = true);
    try {
      await ref.read(repositoryProvider).updateOrganDonor(val);
      ref.invalidate(emergencyCardProvider);
      ref.invalidate(profileProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isAr
                ? 'تم تحديث رغبة التبرع بالأعضاء في بطاقة الطوارئ وملفك الطبي'
                : 'Organ donor preference updated on your emergency card',
          ),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            widget.isAr ? 'تعذر تحديث الإعداد حالياً' : 'Could not update preference right now',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = widget.cs;
    final isAr = widget.isAr;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: cs.outlineVariant.withOpacity(0.5)),
      ),
      child: Row(
        children: [
          Switch.adaptive(
            value: widget.card.organDonor,
            onChanged: _saving ? null : _toggle,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  isAr ? 'تسجيل الموافقة على التبرع بالأعضاء' : 'Organ Donor Registry Consent',
                  style: AppTypography.labelLg.copyWith(color: cs.onSurface),
                  textAlign: TextAlign.right,
                ),
                Text(
                  isAr
                      ? 'يظهر فوراً على بطاقة الطوارئ QR/NFC لفرق الإنقاذ'
                      : 'Immediately synced to your Emergency QR/NFC rescue card',
                  style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant),
                  textAlign: TextAlign.right,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Icon(Icons.volunteer_activism_rounded, color: cs.tertiary, size: 22),
        ],
      ),
    );
  }
}


