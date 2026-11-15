import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../../core/l10n/app_localizations.dart';
import '../../../../core/models/appointment_models.dart';
import '../../../../core/providers/session_provider.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../../../core/utils/error_messages.dart';
import '../../../../core/utils/providers.dart';
import '../../../../core/utils/shared_widgets.dart';

class ShareRecordScreen extends ConsumerStatefulWidget {
  const ShareRecordScreen({super.key});

  @override
  ConsumerState<ShareRecordScreen> createState() => _ShareRecordScreenState();
}

class _ShareRecordScreenState extends ConsumerState<ShareRecordScreen> {
  ShareCode? _code;
  bool _busy = false;
  Timer? _timer;
  Duration _remaining = Duration.zero;

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _generate() async {
    final isAr = ref.read(localeProvider).languageCode == 'ar';
    setState(() => _busy = true);
    try {
      final code = await ref.read(repositoryProvider).createShare();
      _timer?.cancel();
      setState(() {
        _code = code;
        _remaining = code.expiresAt.difference(DateTime.now());
      });
      _timer = Timer.periodic(const Duration(seconds: 1), (t) {
        final left = code.expiresAt.difference(DateTime.now());
        if (left.isNegative) {
          t.cancel();
          if (mounted) setState(() => _remaining = Duration.zero);
        } else if (mounted) {
          setState(() => _remaining = left);
        }
      });
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
    final expired = _code != null && _remaining <= Duration.zero;
    final mm = _remaining.inMinutes.remainder(60).toString().padLeft(2, '0');
    final ss = _remaining.inSeconds.remainder(60).toString().padLeft(2, '0');

    return Scaffold(
      backgroundColor: cs.surface,
      appBar: AppBar(
        title: Text(l.shareRecordTitle),
        leading: IconButton(
          icon: Icon(isAr ? Icons.arrow_forward_rounded : Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: Directionality(
        textDirection: isAr ? TextDirection.rtl : TextDirection.ltr,
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                Container(
                  width: 72, height: 72,
                  decoration: BoxDecoration(color: cs.secondaryContainer, borderRadius: BorderRadius.circular(20)),
                  child: Icon(Icons.qr_code_rounded, size: 34, color: cs.onSecondaryContainer),
                ),
                const SizedBox(height: 16),
                Text(l.shareRecordBody,
                    style: AppTypography.bodyMd.copyWith(color: cs.onSurfaceVariant), textAlign: TextAlign.center),
                const SizedBox(height: 28),
                if (_code == null || expired) ...[
                  if (expired)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: Text(l.codeExpired, style: AppTypography.bodyMd.copyWith(color: cs.error)),
                    ),
                  ElevatedButton.icon(
                    onPressed: _busy ? null : _generate,
                    icon: _busy
                        ? SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: cs.onPrimary))
                        : const Icon(Icons.qr_code_2_rounded),
                    label: Text(_code == null ? l.generateCode : l.generateNewCode),
                    style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 52)),
                  ),
                ] else ...[
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: cs.surfaceContainerLowest,
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [BoxShadow(color: AppColors.primary.withOpacity(0.08), blurRadius: 16)],
                    ),
                    child: Column(
                      children: [
                        QrImageView(data: _code!.code, size: 160, backgroundColor: Colors.white),
                        const SizedBox(height: 16),
                        GestureDetector(
                          onTap: () {
                            Clipboard.setData(ClipboardData(text: _code!.code));
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(isAr ? 'تم نسخ الكود' : 'Code copied')),
                            );
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                            decoration: BoxDecoration(color: cs.surfaceContainerLow, borderRadius: BorderRadius.circular(12)),
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              Icon(Icons.copy_rounded, size: 16, color: cs.onSurfaceVariant),
                              const SizedBox(width: 8),
                              Text(_code!.code,
                                  style: AppTypography.mono.copyWith(
                                      color: cs.primary, fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: 4)),
                            ]),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(l.shareCodeHint,
                            style: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant),
                            textAlign: TextAlign.center),
                        const SizedBox(height: 10),
                        StatusBadge(
                          label: '$mm:$ss',
                          backgroundColor: cs.errorContainer,
                          textColor: cs.onErrorContainer,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextButton.icon(
                    onPressed: _busy ? null : _generate,
                    icon: const Icon(Icons.refresh_rounded),
                    label: Text(l.generateNewCode),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}


