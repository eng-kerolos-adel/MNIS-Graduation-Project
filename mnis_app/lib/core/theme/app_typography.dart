import 'package:flutter/material.dart';

/// Typography scale matching the Clinical Clarity & Civic Trust design system.
/// Cairo for Arabic (RTL), Inter for Latin content.
abstract class AppTypography {
  static const String cairoFamily = 'Cairo';
  static const String interFamily = 'Inter';

  // ── Display ──────────────────────────────────────────────────────────────
  static const TextStyle displayLg = TextStyle(
    fontFamily: cairoFamily,
    fontSize: 40,
    fontWeight: FontWeight.w700,
    height: 1.2,
    letterSpacing: -0.8,
  );

  static const TextStyle displayLgMobile = TextStyle(
    fontFamily: cairoFamily,
    fontSize: 32,
    fontWeight: FontWeight.w700,
    height: 1.25,
    letterSpacing: -0.32,
  );

  // ── Headline ─────────────────────────────────────────────────────────────
  static const TextStyle headlineLg = TextStyle(
    fontFamily: cairoFamily,
    fontSize: 28,
    fontWeight: FontWeight.w600,
    height: 1.29,
    letterSpacing: -0.42,
  );

  static const TextStyle headlineMd = TextStyle(
    fontFamily: cairoFamily,
    fontSize: 22,
    fontWeight: FontWeight.w600,
    height: 1.36,
  );

  static const TextStyle headlineSm = TextStyle(
    fontFamily: cairoFamily,
    fontSize: 18,
    fontWeight: FontWeight.w600,
    height: 1.44,
  );

  // ── Body ─────────────────────────────────────────────────────────────────
  static const TextStyle bodyLg = TextStyle(
    fontFamily: cairoFamily,
    fontSize: 18,
    fontWeight: FontWeight.w400,
    height: 1.56,
  );

  static const TextStyle bodyMd = TextStyle(
    fontFamily: cairoFamily,
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 1.5,
  );

  static const TextStyle bodySm = TextStyle(
    fontFamily: cairoFamily,
    fontSize: 14,
    fontWeight: FontWeight.w400,
    height: 1.43,
  );

  // ── Label ─────────────────────────────────────────────────────────────────
  static const TextStyle labelLg = TextStyle(
    fontFamily: cairoFamily,
    fontSize: 14,
    fontWeight: FontWeight.w600,
    height: 1.43,
    letterSpacing: 0.1,
  );

  static const TextStyle labelMd = TextStyle(
    fontFamily: cairoFamily,
    fontSize: 12,
    fontWeight: FontWeight.w600,
    height: 1.33,
    letterSpacing: 0.5,
  );

  static const TextStyle labelSm = TextStyle(
    fontFamily: cairoFamily,
    fontSize: 11,
    fontWeight: FontWeight.w700,
    height: 1.45,
    letterSpacing: 0.5,
  );

  // ── Mono / Numeric (IDs, medical codes) ──────────────────────────────────
  static const TextStyle mono = TextStyle(
    fontFamily: interFamily,
    fontSize: 13,
    fontWeight: FontWeight.w400,
    letterSpacing: 1.2,
    fontFeatures: [FontFeature.tabularFigures()],
  );
}


