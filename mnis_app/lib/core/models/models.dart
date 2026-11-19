import 'package:flutter/material.dart';

/// A string that exists in both languages, exactly as most fields come back
/// from the MNIS API (`xxxEn` / `xxxAr` pairs).
class Bilingual {
  final String en;
  final String ar;
  const Bilingual(this.en, this.ar);

  factory Bilingual.of(dynamic json, {String fallback = ''}) {
    if (json is Map) {
      return Bilingual(
        (json['en'] as String?) ?? fallback,
        (json['ar'] as String?) ?? fallback,
      );
    }
    return Bilingual(fallback, fallback);
  }

  String pick(Locale locale) => locale.languageCode == 'ar' ? ar : en;
}

List<Bilingual> bilingualList(dynamic json) {
  if (json is! List) return const [];
  return json.map((e) => Bilingual.of(e)).toList();
}

DateTime? parseDate(dynamic v) => v == null ? null : DateTime.tryParse(v as String);

int ageFromBirthDate(DateTime birthDate) {
  final now = DateTime.now();
  var age = now.year - birthDate.year;
  if (now.month < birthDate.month ||
      (now.month == birthDate.month && now.day < birthDate.day)) {
    age--;
  }
  return age < 0 ? 0 : age;
}

// ─── Session ────────────────────────────────────────────────────────────────

class SessionUser {
  final String id;
  final String? email;
  final String role;
  final String fullNameEn;
  final String fullNameAr;
  final String? patientId;
  final bool mustChangePassword;

  const SessionUser({
    required this.id,
    required this.email,
    required this.role,
    required this.fullNameEn,
    required this.fullNameAr,
    required this.patientId,
    required this.mustChangePassword,
  });

  factory SessionUser.fromJson(Map<String, dynamic> j) => SessionUser(
        id: j['id'] as String,
        email: j['email'] as String?,
        role: j['role'] as String,
        fullNameEn: (j['fullNameEn'] as String?) ?? '',
        fullNameAr: (j['fullNameAr'] as String?) ?? '',
        patientId: j['patientId'] as String?,
        mustChangePassword: (j['mustChangePassword'] as bool?) ?? false,
      );

  bool get isPatient => role == 'PATIENT';
}

// ─── Patient profile ──────────────────────────────────────────────────────

class PatientProfile {
  final String mti;
  final String nationalId;
  final Bilingual fullName;
  final String sex; // 'MALE' | 'FEMALE'
  final DateTime? birthDate;
  final String bloodType;
  final Bilingual address;
  final String? photoUrl;
  final bool insuranceActive;
  final bool organDonor;
  final List<Bilingual> chronicConditions;
  final List<Bilingual> allergies;

  const PatientProfile({
    required this.mti,
    required this.nationalId,
    required this.fullName,
    required this.sex,
    required this.birthDate,
    required this.bloodType,
    required this.address,
    required this.photoUrl,
    required this.insuranceActive,
    required this.organDonor,
    required this.chronicConditions,
    required this.allergies,
  });

  int get age => birthDate == null ? 0 : ageFromBirthDate(birthDate!);
  bool get isFemale => sex == 'FEMALE';

  factory PatientProfile.fromJson(Map<String, dynamic> j) => PatientProfile(
        mti: (j['mti'] as String?) ?? '—',
        nationalId: (j['nationalId'] as String?) ?? '',
        fullName: Bilingual.of({'en': j['fullNameEn'], 'ar': j['fullNameAr']}),
        sex: (j['sex'] as String?) ?? 'MALE',
        birthDate: parseDate(j['birthDate']),
        bloodType: (j['bloodType'] as String?) ?? '—',
        address: Bilingual.of({'en': j['addressEn'], 'ar': j['addressAr']}),
        photoUrl: j['photoUrl'] as String?,
        insuranceActive: (j['insuranceActive'] as bool?) ?? false,
        organDonor: (j['organDonor'] as bool?) ?? false,
        chronicConditions: bilingualList(j['chronicConditions']),
        allergies: bilingualList(j['allergies']),
      );

  Map<String, dynamic> toJson() => {
        'mti': mti,
        'nationalId': nationalId,
        'fullNameEn': fullName.en,
        'fullNameAr': fullName.ar,
        'sex': sex,
        'birthDate': birthDate?.toIso8601String(),
        'bloodType': bloodType,
        'addressEn': address.en,
        'addressAr': address.ar,
        'photoUrl': photoUrl,
        'insuranceActive': insuranceActive,
        'organDonor': organDonor,
        'chronicConditions': chronicConditions
            .map((c) => {'en': c.en, 'ar': c.ar})
            .toList(),
        'allergies':
            allergies.map((a) => {'en': a.en, 'ar': a.ar}).toList(),
      };
}

/// The compact record fetched from `/me/emergency-card`, cached on-device so
/// the emergency screen keeps working with no signal.
class EmergencyCard {
  final String mti;
  final Bilingual fullName;
  final String sex;
  final DateTime? birthDate;
  final String bloodType;
  final List<Bilingual> allergies;
  final List<Bilingual> chronicConditions;
  final bool organDonor;

  const EmergencyCard({
    required this.mti,
    required this.fullName,
    required this.sex,
    required this.birthDate,
    required this.bloodType,
    required this.allergies,
    required this.chronicConditions,
    required this.organDonor,
  });

  int get age => birthDate == null ? 0 : ageFromBirthDate(birthDate!);

  factory EmergencyCard.fromJson(Map<String, dynamic> j) => EmergencyCard(
        mti: (j['mti'] as String?) ?? '—',
        fullName: Bilingual.of({'en': j['fullNameEn'], 'ar': j['fullNameAr']}),
        sex: (j['sex'] as String?) ?? 'MALE',
        birthDate: parseDate(j['birthDate']),
        bloodType: (j['bloodType'] as String?) ?? '—',
        allergies: bilingualList(j['allergies']),
        chronicConditions: bilingualList(j['chronicConditions']),
        organDonor: (j['organDonor'] as bool?) ?? false,
      );

  Map<String, dynamic> toJson() => {
        'mti': mti,
        'fullNameEn': fullName.en,
        'fullNameAr': fullName.ar,
        'sex': sex,
        'birthDate': birthDate?.toIso8601String(),
        'bloodType': bloodType,
        'allergies':
            allergies.map((a) => {'en': a.en, 'ar': a.ar}).toList(),
        'chronicConditions': chronicConditions
            .map((c) => {'en': c.en, 'ar': c.ar})
            .toList(),
        'organDonor': organDonor,
      };
}

// ─── Prescriptions ──────────────────────────────────────────────────────────

class PrescriptionItem {
  final Bilingual name;
  final String? form;
  final String dose;
  final Bilingual frequency;
  final int durationDays;
  final int quantity;

  const PrescriptionItem({
    required this.name,
    required this.form,
    required this.dose,
    required this.frequency,
    required this.durationDays,
    required this.quantity,
  });

  factory PrescriptionItem.fromJson(Map<String, dynamic> j) =>
      PrescriptionItem(
        name: Bilingual.of({'en': j['nameEn'], 'ar': j['nameAr']}),
        form: j['form'] as String?,
        dose: (j['dose'] as String?) ?? '',
        frequency:
            Bilingual.of({'en': j['frequencyEn'], 'ar': j['frequencyAr']}),
        durationDays: (j['durationDays'] as num?)?.toInt() ?? 0,
        quantity: (j['quantity'] as num?)?.toInt() ?? 0,
      );
}

enum RxStatus { draft, signed, verified, dispensed, partiallyDispensed, rejected }

RxStatus _rxStatusFrom(String raw) {
  switch (raw) {
    case 'SIGNED':
      return RxStatus.signed;
    case 'VERIFIED':
      return RxStatus.verified;
    case 'DISPENSED':
      return RxStatus.dispensed;
    case 'PARTIALLY_DISPENSED':
      return RxStatus.partiallyDispensed;
    case 'REJECTED':
      return RxStatus.rejected;
    default:
      return RxStatus.draft;
  }
}

class PrescriptionModel {
  final String id;
  final String code;
  final Bilingual diagnosis;
  final String? icd10;
  final RxStatus status;
  final DateTime createdAt;
  final DateTime? dispensedAt;
  final List<PrescriptionItem> items;
  final Bilingual? physicianName;
  final Bilingual? physicianSpeciality;

  const PrescriptionModel({
    required this.id,
    required this.code,
    required this.diagnosis,
    required this.icd10,
    required this.status,
    required this.createdAt,
    required this.dispensedAt,
    required this.items,
    this.physicianName,
    this.physicianSpeciality,
  });

  bool get canRequestRenewal => status == RxStatus.dispensed;

  factory PrescriptionModel.fromJson(Map<String, dynamic> j) =>
      PrescriptionModel(
        id: j['id'] as String,
        code: (j['code'] as String?) ?? j['id'].toString().substring(0, 8),
        diagnosis:
            Bilingual.of({'en': j['diagnosisEn'], 'ar': j['diagnosisAr']}),
        icd10: j['icd10'] as String?,
        status: _rxStatusFrom(j['status'] as String? ?? 'DRAFT'),
        createdAt: parseDate(j['createdAt']) ?? DateTime.now(),
        dispensedAt: parseDate(j['dispensedAt']),
        items: (j['items'] as List? ?? [])
            .map((e) => PrescriptionItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        physicianName: j['physician'] is Map
            ? Bilingual.of({
                'en': (j['physician'] as Map)['fullNameEn'],
                'ar': (j['physician'] as Map)['fullNameAr'],
              })
            : null,
        physicianSpeciality: j['physician'] is Map &&
                (((j['physician'] as Map)['specialityEn'] != null) ||
                    ((j['physician'] as Map)['specialityAr'] != null))
            ? Bilingual.of({
                'en': (j['physician'] as Map)['specialityEn'],
                'ar': (j['physician'] as Map)['specialityAr'],
              })
            : null,
      );
}

// ─── Lab results ────────────────────────────────────────────────────────────

enum ResultFlag { normal, low, high, critical }

ResultFlag _flagFrom(String raw) {
  switch (raw) {
    case 'LOW':
      return ResultFlag.low;
    case 'HIGH':
      return ResultFlag.high;
    case 'CRITICAL':
      return ResultFlag.critical;
    default:
      return ResultFlag.normal;
  }
}

class LabResultRow {
  final Bilingual analyte;
  final double value;
  final String unit;
  final double refLow;
  final double refHigh;
  final ResultFlag flag;

  const LabResultRow({
    required this.analyte,
    required this.value,
    required this.unit,
    required this.refLow,
    required this.refHigh,
    required this.flag,
  });

  factory LabResultRow.fromJson(Map<String, dynamic> j) => LabResultRow(
        analyte: Bilingual.of({'en': j['analyteEn'], 'ar': j['analyteAr']}),
        value: (j['value'] as num).toDouble(),
        unit: (j['unit'] as String?) ?? '',
        refLow: (j['refLow'] as num?)?.toDouble() ?? 0,
        refHigh: (j['refHigh'] as num?)?.toDouble() ?? 0,
        flag: _flagFrom(j['flag'] as String? ?? 'NORMAL'),
      );
}

class LabResultPanel {
  final String id;
  final String barcode;
  final String status;
  final Bilingual panel;
  final Bilingual sampleType;
  final DateTime collectedAt;
  final DateTime? verifiedAt;
  final List<LabResultRow> rows;

  const LabResultPanel({
    required this.id,
    required this.barcode,
    this.status = 'VERIFIED',
    required this.panel,
    required this.sampleType,
    required this.collectedAt,
    required this.verifiedAt,
    required this.rows,
  });

  bool get isVerified => status == 'VERIFIED';
  bool get hasCritical => rows.any((r) => r.flag == ResultFlag.critical);
  bool get hasAbnormal =>
      rows.any((r) => r.flag != ResultFlag.normal);

  factory LabResultPanel.fromJson(Map<String, dynamic> j) => LabResultPanel(
        id: j['id'] as String,
        barcode: (j['barcode'] as String?) ?? '',
        status: (j['status'] as String?) ?? 'VERIFIED',
        panel: Bilingual.of({'en': j['panelEn'], 'ar': j['panelAr']}),
        sampleType:
            Bilingual.of({'en': j['sampleTypeEn'], 'ar': j['sampleTypeAr']}),
        collectedAt: parseDate(j['collectedAt']) ?? DateTime.now(),
        verifiedAt: parseDate(j['verifiedAt']),
        rows: (j['results'] as List? ?? [])
            .map((e) => LabResultRow.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

// ─── Visits ─────────────────────────────────────────────────────────────────

class VisitModel {
  final String id;
  final String ticketNo;
  final Bilingual reason;
  final String status;
  final DateTime arrivedAt;
  final DateTime? completedAt;
  final Bilingual? doctorName;

  const VisitModel({
    required this.id,
    required this.ticketNo,
    required this.reason,
    required this.status,
    required this.arrivedAt,
    required this.completedAt,
    this.doctorName,
  });

  factory VisitModel.fromJson(Map<String, dynamic> j) => VisitModel(
        id: j['id'] as String,
        ticketNo: (j['ticketNo'] as String?) ?? '',
        reason: Bilingual.of({'en': j['reasonEn'], 'ar': j['reasonAr']}),
        status: (j['status'] as String?) ?? 'WAITING',
        arrivedAt: parseDate(j['arrivedAt']) ?? DateTime.now(),
        completedAt: parseDate(j['completedAt']),
        doctorName: j['doctor'] is Map
            ? Bilingual.of({
                'en': (j['doctor'] as Map)['fullNameEn'],
                'ar': (j['doctor'] as Map)['fullNameAr'],
              })
            : null,
      );
}



class AppNotification {
  final String id;
  final Bilingual title;
  final Bilingual body;
  final DateTime sentAt;
  final DateTime? readAt;
  final Map<String, dynamic> data;

  const AppNotification({
    required this.id,
    required this.title,
    required this.body,
    required this.sentAt,
    this.readAt,
    required this.data,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: j['id'] as String,
        title: Bilingual.of({'en': j['titleEn'], 'ar': j['titleAr']}),
        body: Bilingual.of({'en': j['bodyEn'], 'ar': j['bodyAr']}),
        sentAt: parseDate(j['sentAt']) ?? DateTime.now(),
        readAt: parseDate(j['readAt']),
        data: j['data'] as Map<String, dynamic>? ?? {},
      );
}
