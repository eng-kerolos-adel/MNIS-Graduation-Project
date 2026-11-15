import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';

// ─── Theme Mode ─────────────────────────────────────────────────────────────
final themeModeProvider = StateProvider<ThemeMode>((ref) => ThemeMode.system);

// ─── Locale ──────────────────────────────────────────────────────────────────
final localeProvider = StateProvider<Locale>((ref) => const Locale('ar'));

// Real session/profile/prescriptions/lab-results/etc. providers live in
// lib/core/providers/session_provider.dart and data_providers.dart.


