import { Prisma } from '@prisma/client';

/** Patient fields selected across modules; AuditInterceptor automatically decrypts nationalIdEnc -> nationalId and strips nationalIdEnc. */
export const PATIENT_PUBLIC_SELECT = {
  id: true,
  mti: true,
  nationalIdEnc: true,
  fullNameEn: true,
  fullNameAr: true,
  sex: true,
  birthDate: true,
  bloodType: true,
  governorate: true,
  addressEn: true,
  addressAr: true,
  photoUrl: true,
  insuranceActive: true,
  organDonor: true,
  allergies: true,
  chronicConditions: true,
} satisfies Prisma.PatientSelect;
