import '../models/appointment_models.dart';
import '../models/models.dart';
import 'api_client.dart';

/// One typed method per backend endpoint the citizen app uses. Screens never
/// call [ApiClient] directly — everything goes through here so the JSON shape
/// only has to be understood in one place.
class MnisRepository {
  MnisRepository(this._api);
  final ApiClient _api;

  Map<String, dynamic> _asMap(dynamic j) => (j as Map).cast<String, dynamic>();
  List<Map<String, dynamic>> _asList(dynamic j) =>
      (j as List).map((e) => (e as Map).cast<String, dynamic>()).toList();

  // ── Auth ───────────────────────────────────────────────────────────────
  Future<({String accessToken, String? refreshToken, SessionUser user})>
      login(String nationalId, String password) async {
    final res = await _api.post(
      '/auth/login',
      {'identifier': nationalId, 'password': password},
      _asMap,
    );
    return (
      accessToken: res['accessToken'] as String,
      refreshToken: res['refreshToken'] as String?,
      user: SessionUser.fromJson(_asMap(res['user'])),
    );
  }

  Future<({String accessToken, String? refreshToken})> refresh(
    String refreshToken,
  ) async {
    final res =
        await _api.post('/auth/refresh', {'refreshToken': refreshToken}, _asMap);
    return (
      accessToken: res['accessToken'] as String,
      refreshToken: res['refreshToken'] as String?,
    );
  }

  Future<void> logout(String? refreshToken) => _api.post(
        '/auth/logout',
        {if (refreshToken != null) 'refreshToken': refreshToken},
        (_) => null,
      );

  Future<SessionUser> me() async =>
      SessionUser.fromJson(await _api.get('/auth/me', _asMap));

  Future<void> changePassword(String current, String next) => _api.post(
        '/auth/change-password',
        {'currentPassword': current, 'newPassword': next},
        (_) => null,
      );

  // ── Citizen record ────────────────────────────────────────────────────
  Future<PatientProfile> profile() async =>
      PatientProfile.fromJson(await _api.get('/me/profile', _asMap));

  Future<PatientProfile> updateOrganDonor(bool organDonor) async =>
      PatientProfile.fromJson(
        await _api.patch('/me/profile', {'organDonor': organDonor}, _asMap),
      );

  Future<EmergencyCard> emergencyCard() async =>
      EmergencyCard.fromJson(await _api.get('/me/card', _asMap));

  Future<List<PrescriptionModel>> prescriptions() async => (await _api
          .get('/me/prescriptions', _asList))
      .map(PrescriptionModel.fromJson)
      .toList();

  Future<List<LabResultPanel>> labResults() async =>
      (await _api.get('/me/lab-results', _asList))
          .map(LabResultPanel.fromJson)
          .toList();

  Future<List<VisitModel>> visits() async =>
      (await _api.get('/me/visits', _asList)).map(VisitModel.fromJson).toList();

  // ── Appointments ──────────────────────────────────────────────────────
  Future<List<AppointmentModel>> appointments() async =>
      (await _api.get('/me/appointments', _asList))
          .map(AppointmentModel.fromJson)
          .toList();

  Future<AppointmentModel> requestAppointment({
    required DateTime preferredDate,
    required String reason,
    String? doctorId,
    String? labId,
    String? preferredTime,
    AppointmentType type = AppointmentType.clinic,
    String? testPanel,
  }) async =>
      AppointmentModel.fromJson(await _api.post(
        '/me/appointments',
        {
          'preferredDate': preferredDate.toIso8601String(),
          if (preferredTime != null) 'preferredTime': preferredTime,
          'reason': reason,
          if (doctorId != null) 'doctorId': doctorId,
          if (labId != null) 'labId': labId,
          'type': type == AppointmentType.lab ? 'LAB' : 'CLINIC',
          if (testPanel != null) 'testPanel': testPanel,
        },
        _asMap,
      ));

  Future<List<LabFacilityOption>> labs() async =>
      (await _api.get('/schedule/labs', _asList))
          .map(LabFacilityOption.fromJson)
          .toList();

  Future<List<String>> doctorSlots(String doctorId, String dateYmd) async {
    final rows = await _api.get('/schedule/doctors/$doctorId/slots?date=$dateYmd', _asList);
    return rows
        .map((e) => (e['slotStart'] as String?) ?? '')
        .where((s) => s.isNotEmpty)
        .toList();
  }

  // ── Citizen-uploaded documents ──────────────────────────────────────────
  Future<List<DocumentModel>> documents() async =>
      (await _api.get('/me/documents', _asList)).map(DocumentModel.fromJson).toList();

  Future<({String mimeType, String fileBase64})> documentFile(String id) async {
    final j = await _api.get('/me/documents/$id', _asMap);
    return (mimeType: j['mimeType'] as String, fileBase64: j['fileBase64'] as String);
  }

  Future<DocumentModel> uploadDocument({
    required String label,
    required String mimeType,
    required String fileBase64,
  }) async {
    // Calculate fileSizeBytes roughly from base64
    final fileSizeBytes = (fileBase64.length * 0.75).toInt();
    return DocumentModel.fromJson(await _api.post(
      '/me/documents',
      {'label': label, 'mimeType': mimeType, 'fileBase64': fileBase64, 'fileSizeBytes': fileSizeBytes},
      _asMap,
    ));
  }

  Future<void> cancelAppointment(String id) =>
      _api.delete('/me/appointments/$id', (_) => null);

  Future<List<DoctorOption>> doctors() async =>
      (await _api.get('/schedule/doctors', _asList)).map(DoctorOption.fromJson).toList();

  // ── Prescription renewals ────────────────────────────────────────────
  Future<List<RenewalRequestModel>> renewals() async =>
      (await _api.get('/me/renewals', _asList))
          .map(RenewalRequestModel.fromJson)
          .toList();

  Future<void> requestRenewal(String prescriptionId) => _api.post(
        '/me/renewals',
        {'prescriptionId': prescriptionId},
        (_) => null,
      );

  // ── Share with a doctor ───────────────────────────────────────────────
  Future<ShareCode> createShare() async =>
      ShareCode.fromJson(await _api.post('/me/share-token', {}, _asMap));

  // ── Sovereign Summary Hub (Referrals, Radiology, Chronic, Access Log)
  Future<Map<String, dynamic>> summaryHub() async =>
      _api.get('/me/summary-hub', _asMap);
}


