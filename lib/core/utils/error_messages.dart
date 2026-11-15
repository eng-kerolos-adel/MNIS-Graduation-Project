import '../network/api_exception.dart';

/// Turns a backend error code into a message in the given language. Falls
/// back to a generic message for codes we don't specifically recognise.
String friendlyError(Object error, {required bool isAr}) {
  if (error is! ApiException) {
    return isAr ? 'حدث خطأ غير متوقع' : 'An unexpected error occurred';
  }
  if (error.isNetworkError) {
    return isAr
        ? 'تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.'
        : 'Could not reach the server. Check your internet connection.';
  }
  const map = <String, ({String ar, String en})>{
    'INVALID_CREDENTIALS': (
      ar: 'الرقم القومي أو كلمة المرور غير صحيحة',
      en: 'Incorrect national ID or password',
    ),
    'PASSWORD_CHANGE_REQUIRED': (
      ar: 'يجب تغيير كلمة المرور المؤقتة أولاً',
      en: 'You must change your temporary password first',
    ),
    'NO_LINKED_PATIENT': (
      ar: 'هذا الحساب غير مرتبط بملف طبي',
      en: 'This account is not linked to a medical file',
    ),
    'DATE_IN_PAST': (
      ar: 'اختر تاريخاً في المستقبل',
      en: 'Please choose a future date',
    ),
    'TOO_MANY_OPEN_REQUESTS': (
      ar: 'لديك عدد كبير من طلبات المواعيد المفتوحة بالفعل',
      en: 'You already have too many open appointment requests',
    ),
    'APPOINTMENT_NOT_CANCELLABLE': (
      ar: 'لا يمكن إلغاء هذا الموعد',
      en: 'This appointment can no longer be cancelled',
    ),
    'ONLY_DISPENSED_OWN_PRESCRIPTIONS_CAN_BE_RENEWED': (
      ar: 'يمكن طلب تجديد الروشتات المصروفة فقط',
      en: 'Only dispensed prescriptions can be renewed',
    ),
    'RENEWAL_ALREADY_PENDING': (
      ar: 'يوجد بالفعل طلب تجديد قيد المراجعة لهذه الروشتة',
      en: 'A renewal request for this prescription is already pending',
    ),
    'DOCTOR_NOT_FOUND': (
      ar: 'الطبيب المختار غير متاح',
      en: 'The selected doctor is not available',
    ),
  };
  final m = map[error.code];
  if (m != null) return isAr ? m.ar : m.en;
  if (error.statusCode == 429) {
    return isAr
        ? 'محاولات كثيرة جداً، حاول مرة أخرى بعد دقيقة'
        : 'Too many attempts, please try again in a minute';
  }
  return isAr ? 'تعذّر تنفيذ العملية' : 'The action could not be completed';
}


