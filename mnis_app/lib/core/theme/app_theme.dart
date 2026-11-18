import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'app_colors.dart';
import 'app_typography.dart';

abstract class AppTheme {
  // ── Shared shape ──────────────────────────────────────────────────────────
  static final _shapes = const RoundedRectangleBorder(
    borderRadius: BorderRadius.all(Radius.circular(8)),
  );

  // ═══════════════════════════════════════════════════════════════════════
  // LIGHT THEME
  // ═══════════════════════════════════════════════════════════════════════
  static ThemeData get light {
    final colorScheme = const ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.primary,
      onPrimary: AppColors.onPrimary,
      primaryContainer: AppColors.primaryContainer,
      onPrimaryContainer: AppColors.onPrimaryContainer,
      secondary: AppColors.secondary,
      onSecondary: AppColors.onSecondary,
      secondaryContainer: AppColors.secondaryContainer,
      onSecondaryContainer: AppColors.onSecondaryContainer,
      tertiary: AppColors.tertiary,
      onTertiary: AppColors.onTertiary,
      tertiaryContainer: AppColors.tertiaryContainer,
      onTertiaryContainer: AppColors.onTertiaryContainer,
      error: AppColors.error,
      onError: AppColors.onError,
      errorContainer: AppColors.errorContainer,
      onErrorContainer: AppColors.onErrorContainer,
      surface: AppColors.surface,
      onSurface: AppColors.onSurface,
      onSurfaceVariant: AppColors.onSurfaceVariant,
      outline: AppColors.outline,
      outlineVariant: AppColors.outlineVariant,
      inverseSurface: AppColors.inverseSurface,
      onInverseSurface: AppColors.inverseOnSurface,
      inversePrimary: AppColors.inversePrimary,
      surfaceTint: AppColors.surfaceTint,
    );

    return _buildTheme(colorScheme, Brightness.light);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DARK THEME
  // ═══════════════════════════════════════════════════════════════════════
  static ThemeData get dark {
    final colorScheme = const ColorScheme(
      brightness: Brightness.dark,
      primary: AppColors.primaryDark,
      onPrimary: AppColors.onPrimaryDark,
      primaryContainer: AppColors.primaryContainerDark,
      onPrimaryContainer: AppColors.onPrimaryContainerDark,
      secondary: AppColors.secondaryDark,
      onSecondary: AppColors.onSecondaryDark,
      secondaryContainer: AppColors.secondaryContainerDark,
      onSecondaryContainer: AppColors.onSecondaryContainerDark,
      tertiary: AppColors.tertiaryDark,
      onTertiary: AppColors.onTertiaryDark,
      tertiaryContainer: AppColors.tertiaryContainerDark,
      onTertiaryContainer: AppColors.onTertiaryContainerDark,
      error: AppColors.errorDark,
      onError: AppColors.onErrorDark,
      errorContainer: AppColors.errorContainerDark,
      onErrorContainer: AppColors.onErrorContainerDark,
      surface: AppColors.surfaceDark,
      onSurface: AppColors.onSurfaceDark,
      onSurfaceVariant: AppColors.onSurfaceVariantDark,
      outline: AppColors.outlineDark,
      outlineVariant: AppColors.outlineVariantDark,
      inverseSurface: AppColors.onSurfaceDark,
      onInverseSurface: AppColors.surfaceDark,
      inversePrimary: AppColors.primary,
      surfaceTint: AppColors.primaryDark,
    );

    return _buildTheme(colorScheme, Brightness.dark);
  }

  static ThemeData _buildTheme(ColorScheme cs, Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    return ThemeData(
      useMaterial3: true,
      colorScheme: cs,
      brightness: brightness,

      // ── Scaffold ──────────────────────────────────────────────────────────
      scaffoldBackgroundColor: cs.surface,

      // ── AppBar ────────────────────────────────────────────────────────────
      appBarTheme: AppBarTheme(
        backgroundColor: cs.surface.withOpacity(0.9),
        foregroundColor: cs.onSurface,
        elevation: 0,
        scrolledUnderElevation: 1,
        shadowColor: cs.primary.withOpacity(0.08),
        surfaceTintColor: Colors.transparent,
        systemOverlayStyle:
            isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
        titleTextStyle: AppTypography.headlineSm.copyWith(color: cs.onSurface),
        iconTheme: IconThemeData(color: cs.onSurface),
      ),

      // ── Navigation Bar (bottom) ──────────────────────────────────────────
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: isDark
            ? AppColors.surfaceContainerLowDark
            : AppColors.surfaceContainerLowest,
        indicatorColor: cs.primaryContainer.withOpacity(0.3),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return AppTypography.labelSm.copyWith(color: cs.primary);
          }
          return AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant);
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return IconThemeData(color: cs.primary, size: 24);
          }
          return IconThemeData(color: cs.onSurfaceVariant, size: 24);
        }),
        elevation: 3,
        height: 72,
      ),

      // ── Card ──────────────────────────────────────────────────────────────
      cardTheme: CardThemeData(
        color: isDark
            ? AppColors.surfaceContainerLowDark
            : AppColors.surfaceContainerLowest,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: isDark
                ? AppColors.outlineVariantDark.withOpacity(0.4)
                : AppColors.outlineVariant.withOpacity(0.5),
          ),
        ),
        shadowColor: AppColors.primary.withOpacity(0.05),
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      ),

      // ── Elevated Button ───────────────────────────────────────────────────
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: cs.primary,
          foregroundColor: cs.onPrimary,
          minimumSize: const Size(double.infinity, 52),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          textStyle: AppTypography.headlineSm,
          elevation: 0,
        ),
      ),

      // ── Outlined Button ──────────────────────────────────────────────────
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: cs.secondary,
          minimumSize: const Size(double.infinity, 52),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          side: BorderSide(color: cs.secondary, width: 1.5),
          textStyle: AppTypography.headlineSm,
        ),
      ),

      // ── Text Button ───────────────────────────────────────────────────────
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: cs.secondary,
          textStyle: AppTypography.labelLg,
        ),
      ),

      // ── Input Decoration ──────────────────────────────────────────────────
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark
            ? AppColors.surfaceContainerLowDark
            : AppColors.surfaceContainerLow,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(
              color: isDark ? AppColors.outlineDark : AppColors.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(
              color: isDark
                  ? AppColors.outlineVariantDark
                  : AppColors.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: cs.secondary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: cs.error),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        hintStyle: AppTypography.bodyMd.copyWith(
            color: isDark ? AppColors.outlineDark : AppColors.outline),
        labelStyle: AppTypography.labelLg.copyWith(color: cs.onSurfaceVariant),
      ),

      // ── Chip ─────────────────────────────────────────────────────────────
      chipTheme: ChipThemeData(
        backgroundColor: isDark
            ? AppColors.surfaceContainerHighDark
            : AppColors.surfaceContainerHigh,
        selectedColor: cs.primaryContainer,
        labelStyle: AppTypography.labelMd,
        shape: const StadiumBorder(),
        side: BorderSide.none,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      ),

      // ── Divider ──────────────────────────────────────────────────────────
      dividerTheme: DividerThemeData(
        color: isDark ? AppColors.outlineVariantDark : AppColors.outlineVariant,
        thickness: 1,
        space: 1,
      ),

      // ── List Tile ────────────────────────────────────────────────────────
      listTileTheme: ListTileThemeData(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        titleTextStyle: AppTypography.bodyMd.copyWith(color: cs.onSurface),
        subtitleTextStyle:
            AppTypography.bodySm.copyWith(color: cs.onSurfaceVariant),
        iconColor: cs.onSurfaceVariant,
      ),

      // ── Text Styles ──────────────────────────────────────────────────────
      textTheme: TextTheme(
        displayLarge: AppTypography.displayLg.copyWith(color: cs.onSurface),
        displayMedium:
            AppTypography.displayLgMobile.copyWith(color: cs.onSurface),
        headlineLarge: AppTypography.headlineLg.copyWith(color: cs.onSurface),
        headlineMedium: AppTypography.headlineMd.copyWith(color: cs.onSurface),
        headlineSmall: AppTypography.headlineSm.copyWith(color: cs.onSurface),
        bodyLarge: AppTypography.bodyLg.copyWith(color: cs.onSurface),
        bodyMedium: AppTypography.bodyMd.copyWith(color: cs.onSurface),
        bodySmall: AppTypography.bodySm.copyWith(color: cs.onSurfaceVariant),
        labelLarge: AppTypography.labelLg.copyWith(color: cs.onSurface),
        labelMedium: AppTypography.labelMd.copyWith(color: cs.onSurfaceVariant),
        labelSmall: AppTypography.labelSm.copyWith(color: cs.onSurfaceVariant),
      ),

      // ── Page Transitions ─────────────────────────────────────────────────
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
    );
  }
}

/// Extension for quick surface color lookups per design system hierarchy.
extension ColorSchemeX on ColorScheme {
  Color get surfaceContainerLowest => brightness == Brightness.dark
      ? AppColors.surfaceContainerLowestDark
      : AppColors.surfaceContainerLowest;

  Color get surfaceContainerLow => brightness == Brightness.dark
      ? AppColors.surfaceContainerLowDark
      : AppColors.surfaceContainerLow;

  Color get surfaceContainer => brightness == Brightness.dark
      ? AppColors.surfaceContainerDark
      : AppColors.surfaceContainer;

  Color get surfaceContainerHigh => brightness == Brightness.dark
      ? AppColors.surfaceContainerHighDark
      : AppColors.surfaceContainerHigh;

  Color get surfaceContainerHighest => brightness == Brightness.dark
      ? AppColors.surfaceContainerHighestDark
      : AppColors.surfaceContainerHighest;

  Color get tertiaryFixed => brightness == Brightness.dark
      ? AppColors.tertiaryFixed
      : AppColors.tertiaryFixed;

  Color get tertiaryFixedDim => AppColors.tertiaryFixedDim;

  Color get secondaryFixed => brightness == Brightness.dark
      ? AppColors.secondaryContainerDark
      : AppColors.secondaryFixed;

  Color get primaryFixedDim => AppColors.primaryFixedDim;
}


