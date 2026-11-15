import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/l10n/app_localizations.dart';
import '../../../../core/router/app_router.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/providers/session_provider.dart';
import '../../../../core/utils/error_messages.dart';
import '../../../../core/utils/providers.dart';

class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() =>
      _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _loading = false;

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    super.dispose();
  }

  bool get _strongEnough {
    final v = _newCtrl.text;
    return v.length >= 10 &&
        RegExp(r'[A-Za-z]').hasMatch(v) &&
        RegExp(r'\d').hasMatch(v);
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final isAr = ref.read(localeProvider).languageCode == 'ar';
    setState(() => _loading = true);
    try {
      await ref
          .read(sessionControllerProvider.notifier)
          .changePassword(_currentCtrl.text, _newCtrl.text);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).passwordChangedRelogin)),
      );
      context.go(AppRoutes.login);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(friendlyError(e, isAr: isAr))),
      );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final cs = Theme.of(context).colorScheme;
    final isAr = ref.watch(localeProvider).languageCode == 'ar';

    return Scaffold(
      backgroundColor: cs.surface,
      body: SafeArea(
        child: Directionality(
          textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(
                      child: Container(
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          color: cs.errorContainer,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Icon(Icons.password_rounded,
                            size: 34, color: cs.onErrorContainer),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(l.changePasswordTitle,
                        style: AppTypography.headlineMd
                            .copyWith(color: cs.onSurface),
                        textAlign: TextAlign.center),
                    const SizedBox(height: 6),
                    Text(l.changePasswordSubtitle,
                        style: AppTypography.bodyMd
                            .copyWith(color: cs.onSurfaceVariant),
                        textAlign: TextAlign.center),
                    const SizedBox(height: 28),
                    Text(l.currentPasswordLabel,
                        style: AppTypography.headlineSm
                            .copyWith(color: cs.onSurface)),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: _currentCtrl,
                      obscureText: _obscureCurrent,
                      autofocus: true,
                      decoration: InputDecoration(
                        prefixIcon: Icon(Icons.lock_outline, color: cs.primary),
                        suffixIcon: IconButton(
                          icon: Icon(_obscureCurrent
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined),
                          onPressed: () =>
                              setState(() => _obscureCurrent = !_obscureCurrent),
                        ),
                      ),
                      validator: (v) =>
                          (v == null || v.isEmpty) ? l.requiredField : null,
                    ),
                    const SizedBox(height: 16),
                    Text(l.newPasswordLabel,
                        style: AppTypography.headlineSm
                            .copyWith(color: cs.onSurface)),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: _newCtrl,
                      obscureText: _obscureNew,
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        prefixIcon: Icon(Icons.lock_rounded, color: cs.primary),
                        suffixIcon: IconButton(
                          icon: Icon(_obscureNew
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined),
                          onPressed: () =>
                              setState(() => _obscureNew = !_obscureNew),
                        ),
                      ),
                      validator: (v) {
                        if (v == null || v.isEmpty) return l.requiredField;
                        if (!_strongEnough) return l.passwordRules;
                        return null;
                      },
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(l.passwordRules,
                          style: AppTypography.labelSm.copyWith(
                            color: _strongEnough ? cs.tertiary : cs.onSurfaceVariant,
                          )),
                    ),
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: _loading ? null : _submit,
                      child: _loading
                          ? SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: cs.onPrimary),
                            )
                          : Text(l.savePassword),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}


