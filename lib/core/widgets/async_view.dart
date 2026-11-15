import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../theme/app_typography.dart';
import '../utils/error_messages.dart';

/// Standard loading / error / data handling for an [AsyncValue], with a
/// retry button on error. Keeps every screen's error handling consistent.
class AsyncValueView<T> extends StatelessWidget {
  final AsyncValue<T> value;
  final Widget Function(BuildContext context, T data) builder;
  final VoidCallback? onRetry;
  final bool isAr;
  final double loadingHeight;

  const AsyncValueView({
    super.key,
    required this.value,
    required this.builder,
    required this.isAr,
    this.onRetry,
    this.loadingHeight = 240,
  });

  @override
  Widget build(BuildContext context) {
    return value.when(
      data: (d) => builder(context, d),
      loading: () => SizedBox(
        height: loadingHeight,
        child: const Center(child: CircularProgressIndicator()),
      ),
      error: (err, st) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded,
                size: 40, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 10),
            Text(
              friendlyError(err, isAr: isAr),
              style: AppTypography.bodyMd
                  .copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
              textAlign: TextAlign.center,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh_rounded),
                label: Text(isAr ? 'إعادة المحاولة' : 'Retry'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Simple "nothing here yet" placeholder for empty lists.
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String message;
  const EmptyState({super.key, required this.icon, required this.message});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 40, color: cs.outline),
          const SizedBox(height: 10),
          Text(message,
              style: AppTypography.bodyMd.copyWith(color: cs.onSurfaceVariant),
              textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

