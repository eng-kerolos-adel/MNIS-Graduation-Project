import 'package:flutter/material.dart';

class AppLocalizations {
  final Locale locale;
  AppLocalizations(this.locale);

  static AppLocalizations of(BuildContext context) =>
      Localizations.of<AppLocalizations>(context, AppLocalizations)!;

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  bool get isArabic => locale.languageCode == 'ar';

  // ── App ─────────────────────────────────────────────────────────────────
  String get appName => isArabic ? 'MNIS' : 'MNIS';
  String get appFullName => isArabic
      ? 'منظومة الهوية الطبية الوطنية'
      : 'National Medical Identity System';
  String get ministry => isArabic
      ? 'جمهورية مصر العربية • الهيئة العامة للرعاية الصحية'
      : 'Arab Republic of Egypt • General Authority for Health Care';

  // ── Onboarding ───────────────────────────────────────────────────────────
  String get skip => isArabic ? 'تخطي' : 'Skip';
  String get next => isArabic ? 'التالي' : 'Next';
  String get getStarted => isArabic ? 'ابدأ الآن' : 'Get Started';

  String get onboarding1Title => isArabic
      ? 'نظام الهوية الطبية الوطنية'
      : 'National Medical Identity System';
  String get onboarding1Subtitle =>
      isArabic ? 'صحتك في كارت واحد' : 'Your health in one card';
  String get onboarding1Body => isArabic
      ? 'منظومة رقمية قومية تربط كافة المستشفيات والعيادات والمعامل بملف صحي سيادي موحد لكل مواطن.'
      : 'A national digital system linking all hospitals, clinics, and labs to a unified health file for every citizen.';

  String get onboarding2Title =>
      isArabic ? 'البطاقة الذكية المتكاملة' : 'Integrated Smart Card';
  String get onboarding2Subtitle => isArabic
      ? 'اقترب من الجهاز فقط'
      : 'Just tap your card';
  String get onboarding2Body => isArabic
      ? 'بطاقتك الصحية الذكية بتقنية NFC تتيح لأي طاقم طبي الوصول الفوري لبياناتك الحيوية في الطوارئ.'
      : 'Your NFC-enabled smart health card gives any medical team instant access to your vital data in emergencies.';

  String get onboarding3Title =>
      isArabic ? 'رمز الطوارئ الطبي' : 'Medical Emergency QR';
  String get onboarding3Subtitle =>
      isArabic ? 'حماية فورية بدون إنترنت' : 'Instant protection offline';
  String get onboarding3Body => isArabic
      ? 'رمز QR مشفر يحتوي على بياناتك الحيوية ومعلومات الطوارئ للاستخدام دون الحاجة لتسجيل الدخول.'
      : 'An encrypted QR code containing your vital data and emergency info, usable without logging in.';

  String get govApproved =>
      isArabic ? 'اعتماد حكومي' : 'Government Approved';
  String get govApprovedSub =>
      isArabic ? 'وزارة الصحة المصرية' : 'Egyptian Ministry of Health';
  String get dataEncrypted =>
      isArabic ? 'بياناتك مشفرة' : 'Your Data Encrypted';
  String get dataEncryptedSub =>
      isArabic ? 'حماية سيادية تامة' : 'Full sovereign protection';

  // ── Auth ─────────────────────────────────────────────────────────────────
  String get welcomeBack =>
      isArabic ? 'مرحباً بك مجدداً' : 'Welcome Back';
  String get loginSubtitle => isArabic
      ? 'سجّل الدخول للوصول إلى سجلك الطبي الموحد وخدمات التأمين الصحي'
      : 'Sign in to access your unified medical record and health insurance services';

  String get mtiLabel =>
      isArabic ? 'رقم التعريفي الطبي (MTI)' : 'Medical ID Number (MTI)';
  String get mtiHint => '01-05-2001-347-9';
  String get mtiHelper => isArabic
      ? 'موجود على واجهة بطاقة التأمين الصحي الذكية'
      : 'Found on the front of your smart health card';
  String get nationalIdBadge =>
      isArabic ? 'رقم الهوية الوطنية الطبية' : 'National Medical ID';

  String get passwordLabel =>
      isArabic ? 'كلمة السر' : 'Password';
  String get passwordHint =>
      isArabic ? 'أدخل كلمة المرور الخاصة بك' : 'Enter your password';
  String get forgotPassword => isArabic
      ? 'نسيت كلمة السر أو فقدت الكارت؟'
      : 'Forgot password or lost card?';

  String get secureLogin =>
      isArabic ? 'دخول آمن' : 'Secure Login';
  String get orBiometric => isArabic ? 'أو عبر المصادقة الحيوية' : 'or use biometrics';
  String get fingerprintLogin =>
      isArabic ? 'الدخول السريع بالبصمة' : 'Quick Biometric Login';
  String get fingerprintSub =>
      isArabic ? 'Face ID / بصمة الإصبع المسجلة' : 'Face ID / Fingerprint';

  String get emergencyAccess => isArabic
      ? 'حالة طوارئ طبية؟'
      : 'Medical Emergency?';
  String get emergencyAccessSub => isArabic
      ? 'اعرض QR الطوارئ والبيانات الحيوية فوراً دون تسجيل'
      : 'Show Emergency QR and vital data instantly without login';

  // ── Home ─────────────────────────────────────────────────────────────────
  String get greeting => isArabic ? 'صباح الخير' : 'Good morning';
  String get todayDate => isArabic ? 'اليوم' : 'Today';
  String get emergency137 => isArabic ? 'طوارئ 137' : 'Emergency 137';

  String get nfcEnabled => isArabic ? 'NFC مفعّل' : 'NFC Active';
  String get bloodType => isArabic ? 'فصيلة الدم' : 'Blood Type';
  String get insuranceActive => isArabic
      ? 'تأمين صحي شامل - ساري'
      : 'Comprehensive Insurance — Active';
  String get showQr => isArabic
      ? 'عرض رمز الاستجابة السريع (QR الطبي)'
      : 'Show Medical QR Code';
  String get verifiedOfficially =>
      isArabic ? 'معتمد رسمياً' : 'Officially Verified';

  String get lastVisit => isArabic ? 'آخر زيارة' : 'Last Visit';
  String get activeMeds => isArabic ? 'أدوية نشطة' : 'Active Meds';
  String get nextAppointment => isArabic ? 'موعد قادم' : 'Next Appt.';
  String get medicalRecord => isArabic ? 'الملف الطبي' : 'Medical File';
  String get labResults => isArabic ? 'نتائج التحاليل' : 'Lab Results';
  String get prescriptions => isArabic ? 'الروشتات' : 'Prescriptions';
  String get emergencyQr => isArabic ? 'QR الطوارئ' : 'Emergency QR';

  // ── Medical File ─────────────────────────────────────────────────────────
  String get medicalFileTitle =>
      isArabic ? 'الملف الطبي الموحد' : 'Unified Medical File';
  String get mnisSystem =>
      isArabic ? 'السجل الرقمي المركزي الموحد (MNIS)' : 'Central Digital Record (MNIS)';
  String get clinicalAlert => isArabic
      ? 'تنبيه سريري: سجل حساسية نشط وخطير مسجل برقم الهوية'
      : 'Clinical Alert: Active critical allergy record on file';
  String get allergyDrugs => isArabic
      ? 'حساسية أدوية خطيرة (Known Allergies):'
      : 'Critical Drug Allergies (Known Allergies):';
  String get chronicConditions =>
      isArabic ? 'الأمراض المزمنة المسجلة:' : 'Registered Chronic Conditions:';
  String get primaryPhysician =>
      isArabic ? 'طبيب الأسرة المعتمد:' : 'Certified Primary Physician:';
  String get officiallyInsured =>
      isArabic ? 'مؤمَّن رسمياً' : 'Officially Insured';
  String get clinicalTimeline =>
      isArabic ? 'السجل الطبي التفصيلي' : 'Detailed Medical Timeline';

  // ── Lab Results ──────────────────────────────────────────────────────────
  String get labResultsTitle =>
      isArabic ? 'نتائج الفحوصات والتحاليل' : 'Lab Results & Diagnostics';
  String get filterAll => isArabic ? 'الكل' : 'All';
  String get filterLab => isArabic ? 'تحاليل مخبرية' : 'Lab Tests';
  String get filterRadiology => isArabic ? 'أشعة ورنين' : 'Radiology';
  String get filterPending => isArabic ? 'تقارير معلقة' : 'Pending';
  String get digitallyVerified =>
      isArabic ? 'معتمد وموقع رقمياً' : 'Digitally verified';
  String get outOfNormalRange =>
      isArabic ? 'خارج النطاق الطبيعي' : 'Out of normal range';
  String get lastUpdated => isArabic ? 'آخر تحديث معتمد' : 'Last certified update';
  String get filterBtn => isArabic ? 'تصفية' : 'Filter';

  // ── Prescriptions ────────────────────────────────────────────────────────
  String get prescriptionsTitle =>
      isArabic ? 'سجل الروشتات الرقمية' : 'Digital Prescriptions';
  String get prescriptionsSub => isArabic
      ? 'المنظومة الوطنية الموحدة لتتبع وصرف الدواء'
      : 'National unified system for drug tracking and dispensing';
  String get safetyCheck =>
      isArabic ? 'تذكير بالحساسية الدوائية' : 'Allergy reminder';
  String get safe100 => isArabic ? 'مسجل' : 'On file';
  String safetyCheckBody(bool hasAllergies, String allergyNames) => isArabic
      ? (hasAllergies
          ? 'حساسيتك المسجلة ($allergyNames) ظاهرة لطبيبك وصيدليتك تلقائياً. أخبر الصيدلي بها دائماً قبل الصرف.'
          : 'لا توجد حساسية دوائية مسجلة في ملفك. أخبر الصيدلي فوراً إذا لاحظت أي حساسية جديدة.')
      : (hasAllergies
          ? 'Your registered allergies ($allergyNames) are visible to your doctor and pharmacist. Always mention them before dispensing.'
          : 'No drug allergy is registered in your file. Tell your pharmacist right away if you notice a new one.');
  String get activePrescriptions =>
      isArabic ? 'الروشتات النشطة' : 'Active Prescriptions';
  String get chronicMeds =>
      isArabic ? 'الأدوية المزمنة' : 'Chronic Medications';
  String get dispensed => isArabic ? 'المصروفة من الصيدلية' : 'Dispensed';
  String get validForDispensing =>
      isArabic ? 'صالحة للصرف' : 'Valid for dispensing';

  // ── Emergency QR ─────────────────────────────────────────────────────────
  String get emergencyQrTitle =>
      isArabic ? 'رمز الطوارئ الطبي' : 'Medical Emergency QR';
  String get emergencyBanner =>
      isArabic ? 'تنبيه طوارئ فوري' : 'IMMEDIATE EMERGENCY ALERT';
  String get emergencyBannerSub => isArabic
      ? 'هذا الرمز للاستخدام الطبي العاجل فقط — صلاحية مؤقتة مشفرة لحماية خصوصيتك'
      : 'This QR is for emergency medical use only — temporary encrypted validity to protect your privacy';
  String get activeStatus => isArabic ? 'نشط' : 'ACTIVE';
  String get quickRescue => 'MNIS QuickRescue™';
  String get shareEmergencyQr =>
      isArabic ? 'مشاركة رمز الطوارئ' : 'Share Emergency QR';
  String get regenerateQr =>
      isArabic ? 'تجديد الرمز المشفر' : 'Regenerate Encrypted Code';
  String get emergencyContacts =>
      isArabic ? 'جهات الاتصال في الطوارئ' : 'Emergency Contacts';
  String get callEmergency =>
      isArabic ? 'اتصل بالطوارئ (137)' : 'Call Emergency (137)';

  // ── Bottom Nav ───────────────────────────────────────────────────────────
  String get navHome => isArabic ? 'الرئيسية' : 'Home';
  String get navMedical => isArabic ? 'ملفي' : 'My File';
  String get navLab => isArabic ? 'التحاليل' : 'Labs';
  String get navRx => isArabic ? 'الروشتات' : 'Prescriptions';
  String get navQr => isArabic ? 'QR' : 'QR';

  // -- Auth (national ID login) ----------------------------------------------
  String get nationalIdLabel =>
      isArabic ? 'الرقم القومي' : 'National ID';
  String get nationalIdHint => '29001011234567';
  String get nationalIdHelper => isArabic
      ? 'الرقم القومي المكون من 14 رقماً كما في بطاقتك'
      : '14-digit national ID, as printed on your card';
  String get nationalIdInvalid => isArabic
      ? 'أدخل رقماً قومياً صحيحاً مكوناً من 14 رقماً'
      : 'Enter a valid 14-digit national ID';
  String get requiredField => isArabic ? 'مطلوب' : 'Required';
  String get noAccountTitle =>
      isArabic ? 'كيف أحصل على حساب؟' : 'How do I get an account?';
  String get noAccountBody => isArabic
      ? 'يقوم موظف الاستقبال بفتح حسابك عند أول زيارة لأي منشأة صحية تابعة للمنظومة، ويسلّمك كلمة مرور مؤقتة لأول دخول. أحضر بطاقة الرقم القومي معك.'
      : 'Reception opens your account on your first visit to any facility on the network and hands you a temporary password for first sign-in. Bring your national ID card.';
  String get enableBiometricTitle =>
      isArabic ? 'تفعيل الدخول بالبصمة؟' : 'Enable biometric sign-in?';
  String get enableBiometricBody => isArabic
      ? 'يمكنك لاحقاً الدخول بسرعة باستخدام بصمتك أو التعرف على الوجه بدلاً من كتابة كلمة المرور في كل مرة.'
      : 'Next time, you can sign in quickly with your fingerprint or face instead of typing your password.';
  String get enable => isArabic ? 'تفعيل' : 'Enable';
  String get notNow => isArabic ? 'ليس الآن' : 'Not now';
  String get biometricUnavailable => isArabic
      ? 'المصادقة الحيوية غير متاحة على هذا الجهاز'
      : 'Biometric authentication is not available on this device';
  String get biometricFailed =>
      isArabic ? 'فشلت المصادقة الحيوية' : 'Biometric authentication failed';
  String get appLockedTitle =>
      isArabic ? 'التطبيق مقفل' : 'App locked';
  String get appLockedSubtitle => isArabic
      ? 'افتح ببصمتك أو بصمة الوجه للمتابعة'
      : 'Unlock with your fingerprint or face to continue';
  String get tapToUnlock =>
      isArabic ? 'اضغط لفتح القفل' : 'Tap to unlock';
  String get usePasswordInstead =>
      isArabic ? 'استخدم كلمة المرور بدلاً من ذلك' : 'Use password instead';
  String get biometricNoSession => isArabic
      ? 'لا توجد جلسة محفوظة. سجّل الدخول بكلمة المرور أولاً.'
      : 'No saved session. Please sign in with your password first.';

  // -- Change password --------------------------------------------------------
  String get changePasswordTitle =>
      isArabic ? 'غيّر كلمة المرور المؤقتة' : 'Change your temporary password';
  String get changePasswordSubtitle => isArabic
      ? 'لا يمكنك استخدام التطبيق قبل اختيار كلمة مرور خاصة بك.'
      : "You can't use the app until you choose your own password.";
  String get currentPasswordLabel =>
      isArabic ? 'كلمة المرور المؤقتة' : 'Temporary password';
  String get newPasswordLabel =>
      isArabic ? 'كلمة المرور الجديدة' : 'New password';
  String get passwordRules => isArabic
      ? '10 أحرف على الأقل، وتحتوي على حروف وأرقام'
      : 'At least 10 characters, with letters and digits';
  String get savePassword => isArabic ? 'حفظ' : 'Save';
  String get passwordChangedRelogin => isArabic
      ? 'تم تغيير كلمة المرور، سجّل الدخول من جديد'
      : 'Password changed. Please sign in again.';

  // -- Account sheet / logout ---------------------------------------------------
  String get myAccount => isArabic ? 'حسابي' : 'My account';
  String get logout => isArabic ? 'تسجيل الخروج' : 'Sign out';
  String get logoutConfirmTitle =>
      isArabic ? 'تسجيل الخروج؟' : 'Sign out?';
  String get logoutConfirmBody => isArabic
      ? 'ستحتاج لتسجيل الدخول مرة أخرى للوصول إلى ملفك الطبي.'
      : "You'll need to sign in again to access your medical file.";
  String get cancel => isArabic ? 'إلغاء' : 'Cancel';
  String get close => isArabic ? 'إغلاق' : 'Close';
  String get changePassword => isArabic ? 'تغيير كلمة المرور' : 'Change password';
  String get shareWithDoctor =>
      isArabic ? 'مشاركة الملف مع طبيب' : 'Share record with a doctor';
  String get appointmentsMenu => isArabic ? 'مواعيدي' : 'My appointments';
  String get settingsTitle => isArabic ? 'الإعدادات' : 'Settings';
  String get notificationsComingSoon => isArabic
      ? 'الإشعارات غير متاحة بعد'
      : 'Notifications are not available yet';

  // -- Common async states -----------------------------------------------------
  String get retry => isArabic ? 'إعادة المحاولة' : 'Retry';
  String get noInternet => isArabic
      ? 'تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.'
      : 'Could not reach the server. Check your internet connection.';
  String get maleLabel => isArabic ? 'ذكر' : 'Male';
  String get femaleLabel => isArabic ? 'أنثى' : 'Female';
  String get noRecentActivity =>
      isArabic ? 'لا يوجد نشاط طبي مسجل بعد' : 'No recent medical activity yet';
  String get noTimelineEvents => isArabic
      ? 'لم تتم إضافة أي زيارات أو روشتات أو نتائج بعد'
      : 'No visits, prescriptions or results recorded yet';
  String get labResultsEmpty => isArabic
      ? 'لا توجد نتائج معتمدة بعد'
      : 'No verified results yet';
  String get prescriptionsEmpty =>
      isArabic ? 'لا توجد روشتات مسجلة بعد' : 'No prescriptions on file yet';
  String get noUpcomingAppointment =>
      isArabic ? 'لا يوجد موعد قادم' : 'No upcoming appointment';

  // -- Appointments -------------------------------------------------------------
  String get appointmentsTitle => isArabic ? 'مواعيدي' : 'My appointments';
  String get requestAppointment =>
      isArabic ? 'طلب ميعاد جديد' : 'Request an appointment';
  String get appointmentReasonLabel =>
      isArabic ? 'سبب الزيارة' : 'Reason for visit';
  String get preferredDateLabel =>
      isArabic ? 'التاريخ المفضل' : 'Preferred date';
  String get chooseDoctorOptional =>
      isArabic ? 'اختر طبيباً (اختياري)' : 'Choose a doctor (optional)';
  String get noPreference => isArabic ? 'بدون تفضيل' : 'No preference';
  String get submitRequest => isArabic ? 'إرسال الطلب' : 'Submit request';
  String get appointmentsEmpty =>
      isArabic ? 'لا توجد مواعيد بعد' : 'No appointments yet';
  String get appointmentRequestSent => isArabic
      ? 'تم إرسال طلب الموعد، بانتظار تأكيد الاستقبال'
      : 'Appointment request sent, awaiting reception confirmation';
  String get cancelAppointment => isArabic ? 'إلغاء الموعد' : 'Cancel appointment';
  String get cancelAppointmentConfirm => isArabic
      ? 'هل تريد إلغاء هذا الموعد؟'
      : 'Cancel this appointment?';
  String get appointmentCancelled =>
      isArabic ? 'تم إلغاء الموعد' : 'Appointment cancelled';
  String statusRequested(bool ar) => ar ? 'بانتظار التأكيد' : 'Requested';
  String statusConfirmed(bool ar) => ar ? 'مؤكد' : 'Confirmed';
  String statusRejected(bool ar) => ar ? 'مرفوض' : 'Rejected';
  String statusCancelled(bool ar) => ar ? 'ملغي' : 'Cancelled';
  String statusCompleted(bool ar) => ar ? 'تم' : 'Completed';

  // -- Prescription renewal ------------------------------------------------------
  String get requestRenewal => isArabic ? 'طلب تجديد' : 'Request renewal';
  String get requestRenewalConfirmTitle =>
      isArabic ? 'طلب تجديد الروشتة؟' : 'Request a renewal?';
  String get requestRenewalConfirmBody => isArabic
      ? 'سيصل طلبك إلى الطبيب لمراجعته واعتماد روشتة جديدة.'
      : 'Your request goes to the physician to review and issue a new prescription.';
  String get renewalRequestSent =>
      isArabic ? 'تم إرسال طلب التجديد' : 'Renewal request sent';
  String get renewalPendingBadge =>
      isArabic ? 'طلب تجديد قيد المراجعة' : 'Renewal request pending';
  String get send => isArabic ? 'إرسال' : 'Send';

  // -- Share with doctor ---------------------------------------------------------
  String get shareRecordTitle =>
      isArabic ? 'مشاركة الملف مع طبيب' : 'Share record with a doctor';
  String get shareRecordBody => isArabic
      ? 'أنشئ كوداً مؤقتاً يستخدمه الطبيب مرة واحدة للاطلاع على ملفك، ثم ينتهي تلقائياً.'
      : 'Generate a temporary code a doctor can use once to view your record — it expires automatically.';
  String get generateCode => isArabic ? 'إنشاء الكود' : 'Generate code';
  String get generateNewCode => isArabic ? 'إنشاء كود جديد' : 'Generate a new code';
  String get codeExpired => isArabic ? 'انتهت صلاحية الكود' : 'This code has expired';
  String get shareCodeHint => isArabic
      ? 'أطلع الطبيب على هذا الكود ليدخله في نظامه'
      : 'Show this code to the doctor to enter in their system';

  // -- Emergency contacts ---------------------------------------------------------
  String get manageContacts =>
      isArabic ? 'إدارة جهات اتصال الطوارئ' : 'Manage emergency contacts';
  String get addContact => isArabic ? 'إضافة جهة اتصال' : 'Add contact';
  String get contactNameLabel => isArabic ? 'الاسم' : 'Name';
  String get contactPhoneLabel => isArabic ? 'رقم الهاتف' : 'Phone number';
  String get maxContactsReached => isArabic
      ? 'أقصى عدد لجهات الاتصال هو 3'
      : 'You can add up to 3 contacts';
  String get noContactsYet => isArabic
      ? 'لم تتم إضافة جهات اتصال طوارئ بعد'
      : 'No emergency contacts added yet';
  String get lastSynced => isArabic ? 'آخر تحديث' : 'Last updated';
  String get neverSynced => isArabic
      ? 'لم تتم المزامنة بعد — اتصل بالإنترنت مرة واحدة على الأقل'
      : "Not synced yet — connect to the internet at least once";
  String get emergencyDataStale => isArabic
      ? 'بيانات محفوظة — قد لا تعكس آخر تحديث'
      : 'Cached data — may not reflect the latest update';
  String get codeRegenerated =>
      isArabic ? 'تم تحديث البيانات' : 'Data refreshed';

  // -- Appointment type (clinic vs lab) ----------------------------------------
  String get appointmentTypeClinic => isArabic ? 'كشف عيادة' : 'Clinic visit';
  String get appointmentTypeLab => isArabic ? 'تحليل معملي' : 'Lab test';
  String get chooseAppointmentType =>
      isArabic ? 'نوع الموعد' : 'Appointment type';
  String get testPanelLabel =>
      isArabic ? 'التحليل المطلوب' : 'Test you need';
  String get testPanelHint =>
      isArabic ? 'مثال: صورة دم كاملة، سكر تراكمي' : 'e.g. Complete Blood Count, HbA1c';
  String get testPanelRequired => isArabic
      ? 'اكتب اسم التحليل المطلوب'
      : 'Enter which test you need';

  // -- Document uploads ---------------------------------------------------------
  String get myDocuments => isArabic ? 'ملفاتي الطبية' : 'My documents';
  String get uploadDocument => isArabic ? 'رفع ملف' : 'Upload a file';
  String get documentLabelHint => isArabic
      ? 'سمِّ الملف، مثال: تحليل دهون مستشفى الأمل'
      : "Name the file, e.g. 'Lipid panel — Al Amal Hospital'";
  String get documentLabelRequired =>
      isArabic ? 'اكتب اسماً للملف' : 'Give the file a name';
  String get chooseFile => isArabic ? 'اختر ملفاً' : 'Choose a file';
  String get documentsEmpty => isArabic
      ? 'لم ترفع أي ملفات طبية بعد'
      : "You haven't uploaded any medical documents yet";
  String get documentsHint => isArabic
      ? 'صور أو ملفات PDF لتحاليل أو تقارير من خارج المنظومة'
      : 'Photos or PDFs of tests or reports from outside the system';
  String get fileTooLarge => isArabic
      ? 'حجم الملف أكبر من المسموح (٤ ميجابايت كحد أقصى)'
      : 'File is too large (4MB maximum)';
  String get unsupportedFileType => isArabic
      ? 'نوع الملف غير مدعوم — استخدم صورة أو PDF'
      : 'Unsupported file type — use an image or a PDF';
  String get documentUploaded =>
      isArabic ? 'تم رفع الملف بنجاح' : 'File uploaded successfully';
  String get pendingReview => isArabic ? 'بانتظار المراجعة' : 'Pending review';
  String get reviewed => isArabic ? 'تمت المراجعة' : 'Reviewed';
  String get openFile => isArabic ? 'عرض الصورة' : 'View image';
  String get shareOrSaveFile => isArabic ? 'مشاركة / حفظ' : 'Share / Save';
  String get uploading => isArabic ? 'جاري الرفع…' : 'Uploading…';
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  bool isSupported(Locale locale) =>
      ['ar', 'en'].contains(locale.languageCode);

  @override
  Future<AppLocalizations> load(Locale locale) async =>
      AppLocalizations(locale);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}


