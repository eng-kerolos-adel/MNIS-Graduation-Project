import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/l10n/app_localizations.dart';
import '../../../../core/router/app_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/utils/providers.dart';
import '../../../../core/utils/shared_widgets.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _ctrl = PageController();
  int _page = 0;

  void _next() {
    if (_page < 2) {
      _ctrl.nextPage(
          duration: const Duration(milliseconds: 400),
          curve: Curves.easeOutCubic);
    } else {
      _finish();
    }
  }

  Future<void> _finish() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('onboarding_seen', true);
    if (mounted) context.go(AppRoutes.login);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final cs = Theme.of(context).colorScheme;
    final locale = ref.watch(localeProvider);
    final isAr = locale.languageCode == 'ar';

    return Scaffold(
      backgroundColor: cs.surface,
      body: SafeArea(
        child: Column(
          children: [
            // ─── Top bar ────────────────────────────────────────────────
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Ministry badge
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: cs.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.verified_user_rounded,
                            size: 16, color: cs.secondary),
                        const SizedBox(width: 6),
                        Text(
                          isAr
                              ? 'جمهورية مصر العربية • وزارة الصحة'
                              : 'Egypt Ministry of Health',
                          style: AppTypography.labelSm
                              .copyWith(color: cs.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  // Skip
                  TextButton(
                    onPressed: _finish,
                    child: Text(l.skip,
                        style: AppTypography.labelLg
                            .copyWith(color: cs.secondary)),
                  ),
                ],
              ),
            ),

            // ─── Page View ──────────────────────────────────────────────
            Expanded(
              child: PageView(
                controller: _ctrl,
                onPageChanged: (i) => setState(() => _page = i),
                children: [
                  _Slide1(l: l, cs: cs),
                  _Slide2(l: l, cs: cs),
                  _Slide3(l: l, cs: cs),
                ],
              ),
            ),

            // ─── Bottom controls ─────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
              child: Column(
                children: [
                  // Dots
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(3, (i) {
                      final active = i == _page;
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: active ? 28 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: active
                              ? cs.primary
                              : cs.outlineVariant,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 20),

                  // Next / Get Started button
                  ElevatedButton(
                    onPressed: _next,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          _page < 2 ? l.next : l.getStarted,
                          style: AppTypography.headlineSm
                              .copyWith(color: cs.onPrimary),
                        ),
                        const SizedBox(width: 8),
                        Icon(
                          isAr
                              ? Icons.arrow_back_rounded
                              : Icons.arrow_forward_rounded,
                          color: cs.onPrimary,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── SLIDE 1: Identity & Sovereign Trust ─────────────────────────────────────
class _Slide1 extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  const _Slide1({required this.l, required this.cs});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        children: [
          // Hero card
          MedicalCardGradient(
            child: SizedBox(
              height: 260,
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    // Top
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.shield,
                                color: AppColors.tertiaryFixed, size: 20),
                            const SizedBox(width: 6),
                            Text(
                              'منظومة التأمين الصحي الشامل',
                              style: AppTypography.labelSm
                                  .copyWith(color: Colors.white70),
                            ),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.2),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text('رسمي وخاص',
                              style: AppTypography.labelSm
                                  .copyWith(color: Colors.white)),
                        ),
                      ],
                    ),

                    // Shield logo
                    Column(
                      children: [
                        Container(
                          width: 100,
                          height: 100,
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                                color: Colors.white.withOpacity(0.2)),
                          ),
                          padding: const EdgeInsets.all(14),
                          child: const MnisShieldLogo(size: 72),
                        ),
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.fingerprint,
                                  size: 14, color: Colors.white70),
                              const SizedBox(width: 4),
                              Text('MNIS • مصر الرقمية',
                                  style: AppTypography.labelSm
                                      .copyWith(color: Colors.white70)),
                            ],
                          ),
                        ),
                      ],
                    ),

                    // Bottom
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('البطاقة الذكية الموحدة',
                            style: AppTypography.labelSm
                                .copyWith(color: Colors.white60)),
                        Text('3-010101-12345',
                            style: AppTypography.mono
                                .copyWith(color: Colors.white60)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),

          const SizedBox(height: 24),

          // Labels
          Row(
            children: [
              Icon(Icons.local_hospital_rounded, size: 16, color: cs.secondary),
              const SizedBox(width: 6),
              Text(
                'نظام الهوية الطبية الموحدة',
                style: AppTypography.labelMd.copyWith(color: cs.secondary),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: Text(l.onboarding1Title,
                style: AppTypography.headlineLg
                    .copyWith(color: cs.onSurface),
                textAlign: TextAlign.right),
          ),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: Text(l.onboarding1Subtitle,
                style: AppTypography.headlineSm
                    .copyWith(color: cs.secondary),
                textAlign: TextAlign.right),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: Text(l.onboarding1Body,
                style: AppTypography.bodyMd
                    .copyWith(color: cs.onSurfaceVariant),
                textAlign: TextAlign.right),
          ),

          const SizedBox(height: 20),

          // Trust badges
          Row(
            children: [
              Expanded(
                child: _TrustBadge(
                  icon: Icons.verified,
                  iconColor: cs.onSecondaryFixed,
                  bgColor: cs.secondaryFixed,
                  title: l.govApproved,
                  subtitle: l.govApprovedSub,
                  cs: cs,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _TrustBadge(
                  icon: Icons.lock_rounded,
                  iconColor: AppColors.onTertiaryFixedVariant,
                  bgColor: AppColors.tertiaryFixed,
                  title: l.dataEncrypted,
                  subtitle: l.dataEncryptedSub,
                  cs: cs,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── SLIDE 2: Smart NFC Card ──────────────────────────────────────────────────
class _Slide2 extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  const _Slide2({required this.l, required this.cs});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        children: [
          // NFC hero
          Container(
            height: 240,
            decoration: BoxDecoration(
              color: cs.surfaceContainerLow,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                // Concentric NFC rings
                ...List.generate(3, (i) {
                  return Opacity(
                    opacity: 0.3 - i * 0.08,
                    child: Container(
                      width: 200.0 - i * 40,
                      height: 200.0 - i * 40,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: cs.secondaryContainer.withOpacity(0.6),
                      ),
                    ),
                  );
                }),

                // Card + Phone mockup
                Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Phone icon
                    Container(
                      width: 60,
                      height: 80,
                      decoration: BoxDecoration(
                        color: cs.primary,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                            color: Colors.white.withOpacity(0.3), width: 2),
                      ),
                      child: const Icon(Icons.smartphone_rounded,
                          color: Colors.white, size: 32),
                    ),
                    const SizedBox(height: 8),
                    // NFC icon
                    Icon(Icons.contactless_rounded,
                        size: 32, color: cs.secondary),
                    const SizedBox(height: 4),
                    Text('NFC',
                        style: AppTypography.labelMd
                            .copyWith(color: cs.secondary)),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          Align(
            alignment: Alignment.centerRight,
            child: Text(l.onboarding2Title,
                style: AppTypography.headlineLg.copyWith(color: cs.onSurface),
                textAlign: TextAlign.right),
          ),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: Text(l.onboarding2Subtitle,
                style: AppTypography.headlineSm.copyWith(color: cs.secondary),
                textAlign: TextAlign.right),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: Text(l.onboarding2Body,
                style: AppTypography.bodyMd
                    .copyWith(color: cs.onSurfaceVariant),
                textAlign: TextAlign.right),
          ),

          const SizedBox(height: 20),

          // Features list
          ...['فوري وآمن — يعمل بدون إنترنت',
            'مشفر بمعيار AES-256 السيادي',
            'مقبول في كل المستشفيات الحكومية والخاصة'].map((f) => Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: cs.tertiaryContainer,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.check_rounded,
                      size: 16, color: cs.onTertiaryContainer),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(f,
                      style:
                          AppTypography.bodyMd.copyWith(color: cs.onSurface)),
                ),
              ],
            ),
          )),
        ],
      ),
    );
  }
}

// ─── SLIDE 3: Emergency QR ────────────────────────────────────────────────────
class _Slide3 extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  const _Slide3({required this.l, required this.cs});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        children: [
          // QR hero
          Container(
            height: 240,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [cs.errorContainer, cs.surfaceContainerLow],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.1),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Icon(Icons.qr_code_2_rounded,
                        size: 80, color: cs.primary),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    decoration: BoxDecoration(
                      color: cs.error.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: cs.error.withOpacity(0.4)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        PulsingDot(color: cs.error),
                        const SizedBox(width: 6),
                        Text('MNIS QuickRescue™',
                            style: AppTypography.labelMd
                                .copyWith(color: cs.error, fontWeight: FontWeight.w700)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 24),

          Align(
            alignment: Alignment.centerRight,
            child: Text(l.onboarding3Title,
                style: AppTypography.headlineLg.copyWith(color: cs.onSurface),
                textAlign: TextAlign.right),
          ),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: Text(l.onboarding3Subtitle,
                style: AppTypography.headlineSm.copyWith(color: cs.secondary),
                textAlign: TextAlign.right),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: Text(l.onboarding3Body,
                style: AppTypography.bodyMd
                    .copyWith(color: cs.onSurfaceVariant),
                textAlign: TextAlign.right),
          ),

          const SizedBox(height: 20),

          // Emergency data pills
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              'فصيلة الدم', 'الحساسية الخطيرة', 'التشخيص الحيوي',
              'جهة الطوارئ', 'الطبيب المعالج',
            ].map((tag) => StatusBadge(
                  label: tag,
                  backgroundColor: cs.errorContainer,
                  textColor: cs.onErrorContainer,
                  fontSize: 12,
                )).toList(),
          ),
        ],
      ),
    );
  }
}

class _TrustBadge extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final Color bgColor;
  final String title;
  final String subtitle;
  final ColorScheme cs;

  const _TrustBadge({
    required this.icon,
    required this.iconColor,
    required this.bgColor,
    required this.title,
    required this.subtitle,
    required this.cs,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: cs.surfaceContainerLow,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: bgColor.withOpacity(0.8),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, size: 16, color: iconColor),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(title,
                    style:
                        AppTypography.labelSm.copyWith(color: cs.onSurface),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
                Text(subtitle,
                    style: AppTypography.labelSm
                        .copyWith(color: cs.onSurfaceVariant),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
        ],
      ),
    );
  }
}


