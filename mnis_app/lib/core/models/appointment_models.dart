import 'models.dart';

enum AppointmentStatus { requested, confirmed, rejected, cancelled, completed }

enum AppointmentType { clinic, lab }

AppointmentType _apptTypeFrom(String raw) => raw == 'LAB' ? AppointmentType.lab : AppointmentType.clinic;

AppointmentStatus _apptStatusFrom(String raw) {
  switch (raw) {
    case 'CONFIRMED':
      return AppointmentStatus.confirmed;
    case 'REJECTED':
      return AppointmentStatus.rejected;
    case 'CANCELLED':
      return AppointmentStatus.cancelled;
    case 'COMPLETED':
      return AppointmentStatus.completed;
    default:
      return AppointmentStatus.requested;
  }
}

class AppointmentModel {
  final String id;
  final AppointmentType type;
  final DateTime preferredDate;
  final String reason;
  final String? testPanel;
  final AppointmentStatus status;
  final DateTime? scheduledAt;
  final String? note;
  final Bilingual? doctorName;
  final Bilingual? doctorSpeciality;
  final Bilingual? facilityName;

  const AppointmentModel({
    required this.id,
    required this.type,
    required this.preferredDate,
    required this.reason,
    required this.testPanel,
    required this.status,
    required this.scheduledAt,
    required this.note,
    this.doctorName,
    this.doctorSpeciality,
    this.facilityName,
  });

  bool get isCancellable =>
      status == AppointmentStatus.requested ||
      status == AppointmentStatus.confirmed;

  factory AppointmentModel.fromJson(Map<String, dynamic> j) =>
      AppointmentModel(
        id: j['id'] as String,
        type: _apptTypeFrom(j['type'] as String? ?? 'CLINIC'),
        preferredDate: parseDate(j['preferredDate']) ?? DateTime.now(),
        reason: (j['reason'] as String?) ?? '',
        testPanel: j['testPanel'] as String?,
        status: _apptStatusFrom(j['status'] as String? ?? 'REQUESTED'),
        scheduledAt: parseDate(j['scheduledAt']),
        note: j['note'] as String?,
        doctorName: j['doctor'] is Map
            ? Bilingual.of({
                'en': (j['doctor'] as Map)['fullNameEn'],
                'ar': (j['doctor'] as Map)['fullNameAr'],
              })
            : null,
        doctorSpeciality: j['doctor'] is Map &&
                (((j['doctor'] as Map)['specialityEn'] != null) ||
                    ((j['doctor'] as Map)['specialityAr'] != null))
            ? Bilingual.of({
                'en': (j['doctor'] as Map)['specialityEn'],
                'ar': (j['doctor'] as Map)['specialityAr'],
              })
            : null,
        facilityName: j['doctor'] is Map &&
                (((j['doctor'] as Map)['facilityEn'] != null) ||
                    ((j['doctor'] as Map)['facilityAr'] != null))
            ? Bilingual.of({
                'en': (j['doctor'] as Map)['facilityEn'],
                'ar': (j['doctor'] as Map)['facilityAr'],
              })
            : null,
      );
}

enum DocumentStatus { pendingReview, reviewed }

class DocumentModel {
  final String id;
  final String label;
  final String mimeType;
  final int fileSizeBytes;
  final DocumentStatus status;
  final DateTime createdAt;
  final DateTime? reviewedAt;

  const DocumentModel({
    required this.id,
    required this.label,
    required this.mimeType,
    required this.fileSizeBytes,
    required this.status,
    required this.createdAt,
    required this.reviewedAt,
  });

  bool get isImage => mimeType.startsWith('image/');
  bool get isPdf => mimeType == 'application/pdf';

  factory DocumentModel.fromJson(Map<String, dynamic> j) => DocumentModel(
        id: j['id'] as String,
        label: (j['label'] as String?) ?? '',
        mimeType: (j['mimeType'] as String?) ?? 'application/octet-stream',
        fileSizeBytes: (j['fileSizeBytes'] as num?)?.toInt() ?? 0,
        status: (j['status'] as String?) == 'REVIEWED' ? DocumentStatus.reviewed : DocumentStatus.pendingReview,
        createdAt: parseDate(j['createdAt']) ?? DateTime.now(),
        reviewedAt: parseDate(j['reviewedAt']),
      );
}

class DoctorOption {
  final String id;
  final Bilingual name;
  final Bilingual speciality;
  final Bilingual facility;
  const DoctorOption(this.id, this.name, this.speciality, this.facility);

  factory DoctorOption.fromJson(Map<String, dynamic> j) => DoctorOption(
        j['id'] as String,
        Bilingual.of({'en': j['fullNameEn'], 'ar': j['fullNameAr']}),
        Bilingual.of({'en': j['specialityEn'], 'ar': j['specialityAr']}),
        Bilingual.of({'en': j['facilityEn'], 'ar': j['facilityAr']}),
      );
}

class LabFacilityOption {
  final String id;
  final Bilingual name;
  final Bilingual staffName;
  const LabFacilityOption(this.id, this.name, this.staffName);

  factory LabFacilityOption.fromJson(Map<String, dynamic> j) => LabFacilityOption(
        j['id'] as String,
        Bilingual.of({
          'en': j['nameEn'] ?? j['facilityEn'],
          'ar': j['nameAr'] ?? j['facilityAr'],
        }),
        Bilingual.of({
          'en': j['staffNameEn'] ?? j['fullNameEn'],
          'ar': j['staffNameAr'] ?? j['fullNameAr'],
        }),
      );
}

enum RenewalStatus { pending, approved, rejected }

RenewalStatus _renewalStatusFrom(String raw) {
  switch (raw) {
    case 'APPROVED':
      return RenewalStatus.approved;
    case 'REJECTED':
      return RenewalStatus.rejected;
    default:
      return RenewalStatus.pending;
  }
}

class RenewalRequestModel {
  final String id;
  final String prescriptionId;
  final RenewalStatus status;
  final DateTime createdAt;

  const RenewalRequestModel({
    required this.id,
    required this.prescriptionId,
    required this.status,
    required this.createdAt,
  });

  factory RenewalRequestModel.fromJson(Map<String, dynamic> j) =>
      RenewalRequestModel(
        id: j['id'] as String,
        prescriptionId: (j['prescriptionId'] as String?) ?? '',
        status: _renewalStatusFrom(j['status'] as String? ?? 'PENDING'),
        createdAt: parseDate(j['createdAt']) ?? DateTime.now(),
      );
}

class ShareCode {
  final String code;
  final DateTime expiresAt;
  const ShareCode(this.code, this.expiresAt);

  factory ShareCode.fromJson(Map<String, dynamic> j) => ShareCode(
        j['code'] as String,
        parseDate(j['expiresAt']) ?? DateTime.now(),
      );
}


