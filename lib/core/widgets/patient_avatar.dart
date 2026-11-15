import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// A patient photo, falling back to a plain person icon when there is no
/// photo on file yet (reception does not always capture one) instead of
/// attempting a network request with an empty URL.
class PatientAvatar extends StatelessWidget {
  final String? url;
  final double size;
  final BorderRadius borderRadius;
  const PatientAvatar({
    super.key,
    required this.url,
    this.size = 64,
    this.borderRadius = const BorderRadius.all(Radius.circular(12)),
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final placeholder = Container(
      width: size,
      height: size,
      color: cs.surfaceContainerHigh,
      child: Icon(Icons.person, color: cs.onSurfaceVariant, size: size * 0.55),
    );
    if (url == null || url!.isEmpty) {
      return ClipRRect(borderRadius: borderRadius, child: placeholder);
    }
    return ClipRRect(
      borderRadius: borderRadius,
      child: CachedNetworkImage(
        imageUrl: url!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        placeholder: (_, __) => placeholder,
        errorWidget: (_, __, ___) => placeholder,
      ),
    );
  }
}


