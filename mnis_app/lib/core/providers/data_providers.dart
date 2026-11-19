import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/appointment_models.dart';
import '../models/models.dart';
import '../storage/secure_session_store.dart';
import 'session_provider.dart';

/// Rebuilding a data provider only makes sense while someone is signed in;
/// this also makes every provider below automatically refetch on login/logout.
final _uidProvider = Provider<String?>(
  (ref) => ref.watch(sessionControllerProvider).value?.id,
);

final profileProvider = FutureProvider.autoDispose<PatientProfile>((ref) async {
  ref.watch(_uidProvider);
  final profile = await ref.watch(repositoryProvider).profile();
  unawaited(SecureSessionStore.instance.cacheProfileJson(jsonEncode(profile.toJson())));
  return profile;
});

/// Emergency data: try the network first, but never fail outright — fall back
/// to whatever was last cached so the emergency screen still works offline.
/// `null` only when there has never been a successful fetch on this device.
final emergencyCardProvider = FutureProvider.autoDispose<EmergencyCard?>((ref) async {
  ref.watch(_uidProvider);
  try {
    final card = await ref.watch(repositoryProvider).emergencyCard();
    await SecureSessionStore.instance.cacheEmergencyCardJson(jsonEncode(card.toJson()));
    return card;
  } catch (_) {
    final cached = await SecureSessionStore.instance.readEmergencyCardJson();
    if (cached == null) return null;
    return EmergencyCard.fromJson(jsonDecode(cached) as Map<String, dynamic>);
  }
});

final emergencyCardUpdatedAtProvider = FutureProvider.autoDispose<DateTime?>(
  (ref) async {
    ref.watch(emergencyCardProvider);
    return SecureSessionStore.instance.readEmergencyCachedAt();
  },
);

final prescriptionsProvider =
    FutureProvider.autoDispose<List<PrescriptionModel>>((ref) async {
  ref.watch(_uidProvider);
  return ref.watch(repositoryProvider).prescriptions();
});

final labResultsProvider =
    FutureProvider.autoDispose<List<LabResultPanel>>((ref) async {
  ref.watch(_uidProvider);
  return ref.watch(repositoryProvider).labResults();
});

final visitsProvider = FutureProvider.autoDispose<List<VisitModel>>((ref) async {
  ref.watch(_uidProvider);
  return ref.watch(repositoryProvider).visits();
});

final appointmentsProvider =
    FutureProvider.autoDispose<List<AppointmentModel>>((ref) async {
  ref.watch(_uidProvider);
  return ref.watch(repositoryProvider).appointments();
});

final doctorsProvider = FutureProvider.autoDispose<List<DoctorOption>>((ref) async {
  ref.watch(_uidProvider);
  return ref.watch(repositoryProvider).doctors();
});

final labsProvider = FutureProvider.autoDispose<List<LabFacilityOption>>((ref) async {
  ref.watch(_uidProvider);
  return ref.watch(repositoryProvider).labs();
});

final documentsProvider = FutureProvider.autoDispose<List<DocumentModel>>((ref) async {
  ref.watch(_uidProvider);
  return ref.watch(repositoryProvider).documents();
});

final renewalsProvider =
    FutureProvider.autoDispose<List<RenewalRequestModel>>((ref) async {
  ref.watch(_uidProvider);
  return ref.watch(repositoryProvider).renewals();
});

final summaryHubProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  ref.watch(_uidProvider);
  return ref.watch(repositoryProvider).summaryHub();
});

// ─── Derived: home screen dashboard numbers ─────────────────────────────────

class DashboardStats {
  final VisitModel? lastVisit;
  final int activeMedsCount;
  final AppointmentModel? nextAppointment;
  const DashboardStats(this.lastVisit, this.activeMedsCount, this.nextAppointment);
}

final dashboardStatsProvider = FutureProvider.autoDispose<DashboardStats>((ref) async {
  final repo = ref.watch(repositoryProvider);
  ref.watch(_uidProvider);
  final results = await Future.wait([
    repo.visits(),
    repo.prescriptions(),
    repo.appointments(),
  ]);
  final visits = results[0] as List<VisitModel>;
  final prescriptions = results[1] as List<PrescriptionModel>;
  final appointments = results[2] as List<AppointmentModel>;

  visits.sort((a, b) => b.arrivedAt.compareTo(a.arrivedAt));
  final activeMeds = prescriptions
      .where((p) => p.status == RxStatus.verified || p.status == RxStatus.dispensed)
      .length;
  final now = DateTime.now();
  final upcoming = appointments
      .where((a) =>
          a.status == AppointmentStatus.confirmed &&
          (a.scheduledAt ?? a.preferredDate).isAfter(now))
      .toList()
    ..sort((a, b) =>
        (a.scheduledAt ?? a.preferredDate).compareTo(b.scheduledAt ?? b.preferredDate));

  return DashboardStats(
    visits.isEmpty ? null : visits.first,
    activeMeds,
    upcoming.isEmpty ? null : upcoming.first,
  );
});

// ─── Derived: unified clinical timeline ────────────────────────────────────

enum TimelineKind { visit, prescription, lab }

class TimelineEntry {
  final DateTime date;
  final TimelineKind kind;
  final Object data;
  const TimelineEntry(this.date, this.kind, this.data);
}

final timelineProvider = FutureProvider.autoDispose<List<TimelineEntry>>((ref) async {
  final repo = ref.watch(repositoryProvider);
  ref.watch(_uidProvider);
  final results = await Future.wait([
    repo.visits(),
    repo.prescriptions(),
    repo.labResults(),
  ]);
  final entries = <TimelineEntry>[
    for (final v in results[0] as List<VisitModel>)
      TimelineEntry(v.arrivedAt, TimelineKind.visit, v),
    for (final p in results[1] as List<PrescriptionModel>)
      TimelineEntry(p.createdAt, TimelineKind.prescription, p),
    for (final l in results[2] as List<LabResultPanel>)
      if (l.verifiedAt != null)
        TimelineEntry(l.verifiedAt!, TimelineKind.lab, l),
  ];
  entries.sort((a, b) => b.date.compareTo(a.date));
  return entries;
});



