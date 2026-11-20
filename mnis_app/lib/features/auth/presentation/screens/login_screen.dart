import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../core/l10n/app_localizations.dart';
import '../../../../core/router/app_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/providers/session_provider.dart';
import '../../../../core/storage/secure_session_store.dart';
import '../../../../core/utils/error_messages.dart';
import '../../../../core/utils/providers.dart';
import '../../../../core/utils/shared_widgets.dart';

const _kBiometricPromptedKey = 'mnis.biometricPrompted';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _nationalIdCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _obscure = true;
  bool _loading = false;
  bool _biometricAvailable = false;
  final _localAuth = LocalAuthentication();

  @override
  void initState() {
    super.initState();
    _checkBiometricAvailability();
  }

  Future<void> _checkBiometricAvailability() async {
    try {
      final supported = await _localAuth.isDeviceSupported();
      final canCheck = await _localAuth.canCheckBiometrics;
      final hasStoredSession =
          await SecureSessionStore.instance.readRefreshToken() != null;
      final enabled = await SecureSessionStore.instance.readBiometricEnabled();
      if (mounted) {
        setState(() => _biometricAvailable =
            supported && canCheck && hasStoredSession && enabled);
      }
    } catch (_) {
      if (mounted) setState(() => _biometricAvailable = false);
    }
  }

  @override
  void dispose() {
    _nationalIdCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  bool get _isAr => ref.read(localeProvider).languageCode == 'ar';

  Future<void> _login() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _loading = true);
    try {
      final user = await ref
          .read(sessionControllerProvider.notifier)
          .login(_nationalIdCtrl.text.trim(), _passCtrl.text);
      if (!mounted) return;
      if (user.mustChangePassword) {
        context.go(AppRoutes.changePassword);
        return;
      }
      await _maybeOfferBiometric();
      if (!mounted) return;
      context.go(AppRoutes.home);
    } catch (e) {
      if (!mounted) return;
      _showSnack(friendlyError(e, isAr: _isAr));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _maybeOfferBiometric() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_kBiometricPromptedKey) ?? false) return;
    await prefs.setBool(_kBiometricPromptedKey, true);
    bool canCheck = false;
    try {
      canCheck = await _localAuth.canCheckBiometrics && await _localAuth.isDeviceSupported();
    } catch (_) {
      canCheck = false;
    }
    if (!canCheck || !mounted) return;
    final l = AppLocalizations.of(context);
    final enable = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.enableBiometricTitle),
        content: Text(l.enableBiometricBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(l.notNow)),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(l.enable)),
        ],
      ),
    );
    if (enable == true) {
      await SecureSessionStore.instance.writeBiometricEnabled(true);
    }
  }

  void _biometricLogin() {
    // AppLockScreen owns the one real implementation of the fingerprint/face
    // check (and, when needed, redeeming the stored session) — this button
    // just opens it. Keeping the logic in one place is what makes "unlock
    // with biometric" behave identically here and when the app re-locks
    // itself after being backgrounded.
    context.push(AppRoutes.appLock);
  }

  void _showAccountInfo() {
    final l = AppLocalizations.of(context);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l.noAccountTitle),
        content: Text(l.noAccountBody),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(l.close)),
        ],
      ),
    );
  }

  void _showSnack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg, style: AppTypography.bodyMd)),
    );
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
        child: Directionality(
          textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 8),
                  _EmergencyBanner(l: l, cs: cs),
                  const SizedBox(height: 20),
                  _GovHeader(l: l, cs: cs),
                  const SizedBox(height: 24),
                  Container(
                    decoration: BoxDecoration(
                      color: cs.surfaceContainerLowest,
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.primary.withOpacity(0.06),
                          blurRadius: 16,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(l.nationalIdLabel,
                            style: AppTypography.headlineSm
                                .copyWith(color: cs.onSurface)),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _nationalIdCtrl,
                          keyboardType: TextInputType.number,
                          textDirection: TextDirection.ltr,
                          maxLength: 14,
                          inputFormatters: [
                            FilteringTextInputFormatter.digitsOnly,
                          ],
                          style: AppTypography.mono
                              .copyWith(color: cs.onSurface, fontSize: 15),
                          decoration: InputDecoration(
                            counterText: '',
                            hintText: l.nationalIdHint,
                            prefixIcon: Icon(Icons.badge_rounded,
                                color: cs.primary, size: 20),
                          ),
                          validator: (v) {
                            if (v == null || v.isEmpty) return l.requiredField;
                            if (v.length != 14) return l.nationalIdInvalid;
                            return null;
                          },
                        ),
                        Padding(
                          padding: const EdgeInsets.only(top: 4, right: 4),
                          child: Text(l.nationalIdHelper,
                              style: AppTypography.labelSm
                                  .copyWith(color: cs.onSurfaceVariant),
                              textAlign: TextAlign.right),
                        ),
                        const SizedBox(height: 16),
                        Text(l.passwordLabel,
                            style: AppTypography.headlineSm
                                .copyWith(color: cs.onSurface)),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _passCtrl,
                          obscureText: _obscure,
                          style: AppTypography.bodyMd
                              .copyWith(color: cs.onSurface),
                          decoration: InputDecoration(
                            hintText: l.passwordHint,
                            prefixIcon: Icon(Icons.lock_rounded,
                                color: cs.primary, size: 20),
                            suffixIcon: IconButton(
                              icon: Icon(
                                _obscure
                                    ? Icons.visibility_outlined
                                    : Icons.visibility_off_outlined,
                                color: cs.outline,
                              ),
                              onPressed: () =>
                                  setState(() => _obscure = !_obscure),
                            ),
                          ),
                          validator: (v) =>
                              (v == null || v.isEmpty) ? l.requiredField : null,
                        ),
                        const SizedBox(height: 20),
                        ElevatedButton.icon(
                          onPressed: _loading ? null : _login,
                          icon: _loading
                              ? SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: cs.onPrimary,
                                  ),
                                )
                              : const Icon(Icons.verified_user_rounded),
                          label: Text(l.secureLogin),
                        ),
                        if (_biometricAvailable) ...[
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Expanded(child: Divider(color: cs.outlineVariant)),
                              Padding(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 12),
                                child: Text(l.orBiometric,
                                    style: AppTypography.labelSm
                                        .copyWith(color: cs.onSurfaceVariant)),
                              ),
                              Expanded(child: Divider(color: cs.outlineVariant)),
                            ],
                          ),
                          const SizedBox(height: 16),
                          InkWell(
                            onTap: _biometricLogin,
                            borderRadius: BorderRadius.circular(14),
                            child: Container(
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: cs.surfaceContainerLow,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Row(
                                children: [
                                  Container(
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                      color: cs.surfaceContainerLowest,
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Icon(Icons.fingerprint_rounded,
                                        size: 28, color: cs.secondary),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.end,
                                      children: [
                                        Text(l.fingerprintLogin,
                                            style: AppTypography.headlineSm
                                                .copyWith(color: cs.onSurface)),
                                        Text(l.fingerprintSub,
                                            style: AppTypography.labelSm
                                                .copyWith(
                                                    color:
                                                        cs.onSurfaceVariant)),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: cs.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.info_outline_rounded,
                                size: 16, color: cs.onSurfaceVariant),
                            const SizedBox(width: 6),
                            Text(
                              isAr
                                  ? 'لا تملك حساباً أو نسيت كلمة المرور؟'
                                  : "Don't have an account or forgot your password?",
                              style: AppTypography.labelMd
                                  .copyWith(color: cs.onSurfaceVariant),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        OutlinedButton(
                          onPressed: _showAccountInfo,
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(double.infinity, 44),
                            side: BorderSide(color: cs.secondary),
                          ),
                          child: Text(l.noAccountTitle,
                              style: AppTypography.labelLg
                                  .copyWith(color: cs.secondary)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Sub-widgets ─────────────────────────────────────────────────────────────

class _EmergencyBanner extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  const _EmergencyBanner({required this.l, required this.cs});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.push('${AppRoutes.emergencyQr}?fromLogin=true'),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: cs.errorContainer,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 12,
                        height: 12,
                        margin: const EdgeInsets.only(left: 6),
                        child: Stack(
                          children: [
                            Container(
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: cs.error.withOpacity(0.4),
                              ),
                            ),
                            Center(
                              child: Container(
                                width: 6,
                                height: 6,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: cs.error,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(l.emergencyAccess,
                          style: AppTypography.headlineSm
                              .copyWith(color: cs.onErrorContainer)),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(l.emergencyAccessSub,
                      style: AppTypography.labelSm.copyWith(
                          color: cs.onErrorContainer.withOpacity(0.8)),
                      textAlign: TextAlign.right),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: cs.surfaceContainerLowest.withOpacity(0.7),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(Icons.qr_code_2_rounded, color: cs.error, size: 24),
            ),
          ],
        ),
      ),
    );
  }
}

class _GovHeader extends StatelessWidget {
  final AppLocalizations l;
  final ColorScheme cs;
  const _GovHeader({required this.l, required this.cs});

  @override
  Widget build(BuildContext context) {
    final isAr = l.isArabic;
    return Column(
      children: [
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            color: cs.surfaceContainerLowest,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withOpacity(0.08),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          padding: const EdgeInsets.all(12),
          child: const MnisShieldLogo(size: 56),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: cs.surfaceContainerHigh,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.account_balance_rounded, size: 14, color: cs.primary),
              const SizedBox(width: 4),
              Text(isAr ? 'جمهورية مصر العربية' : 'Arab Republic of Egypt',
                  style: AppTypography.labelMd
                      .copyWith(color: cs.onSurfaceVariant)),
              const SizedBox(width: 4),
              Text('•', style: TextStyle(color: cs.outlineVariant)),
              const SizedBox(width: 4),
              Text(
                  isAr
                      ? 'الهيئة العامة للرعاية الصحية'
                      : 'General Authority for Healthcare',
                  style: AppTypography.labelMd.copyWith(
                      color: cs.primary, fontWeight: FontWeight.w700)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(l.welcomeBack,
            style: AppTypography.headlineLg.copyWith(color: cs.onSurface)),
        const SizedBox(height: 4),
        Text(l.loginSubtitle,
            style: AppTypography.bodyMd.copyWith(color: cs.onSurfaceVariant),
            textAlign: TextAlign.center),
      ],
    );
  }
}


