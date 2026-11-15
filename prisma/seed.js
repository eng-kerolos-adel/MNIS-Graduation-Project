/* Comprehensive National Medical Identity System (MNIS) Seed — Populates All 20+ Tables */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const crypto = require('crypto');

const prisma = new PrismaClient();
const key = Buffer.from(process.env.ENCRYPTION_KEY, 'base64');
const enc = (plain) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':');
};
const idx = (v) => crypto.createHmac('sha256', process.env.BLIND_INDEX_KEY).update(v).digest('hex');
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

async function main() {
  const pw = process.env.SEED_PASSWORD;
  if (!pw || pw.length < 12) throw new Error('Set SEED_PASSWORD (12+ chars) to seed demo users');
  const passwordHash = await argon2.hash(pw);

  // 1. Seed Staff & Executive Users
  const usersData = [
    ['doctor@mnis.demo', 'DOCTOR', 'Dr. Tarek Mahmoud', 'د. طارق محمود', 'EGY-DOC-184920', 'Cardiology & Internal Medicine', 'أمراض القلب والباطنة', 'Cairo University Hospitals', 'مستشفيات جامعة القاهرة'],
    ['doctor2@mnis.demo', 'DOCTOR', 'Dr. Nadia El-Sayed', 'د. نادية السيد', 'EGY-DOC-209311', 'Endocrinology & Diabetes', 'الغدد الصماء والسكري', 'Ain Shams Specialized Hospital', 'مستشفى عين شمس التخصصي'],
    ['pharmacist@mnis.demo', 'PHARMACIST', 'Ph. Mona Ibrahim', 'ص. منى إبراهيم', 'PH-2291', 'Clinical Pharmacy', 'الصيدلة الإكلينيكية', 'MNIS Central Pharmacy', 'الصيدلية المركزية الموحدة'],
    ['lab1@mnis.demo', 'LAB_TECH', 'Lab Tech One', 'أخصائي معمل أول', 'LB-4471', 'Hematology & Chemistry', 'أمراض الدم والكيمياء الحيوية', 'National Reference Lab', 'المعمل المرجعي القومي'],
    ['lab2@mnis.demo', 'LAB_TECH', 'Dr. Amany Fahmy', 'د. أماني فهمي', 'LB-4472', 'Diagnostic Immunology', 'المناعة التشخيصية', 'National Reference Lab', 'المعمل المرجعي القومي'],
    ['er@mnis.demo', 'HOSPITAL_STAFF', 'Nurse Hala Zaki', 'م. هالة ذكي', 'NR-1187', 'Emergency & Trauma Triage', 'فرز الطوارئ والحالات الحرجة', 'Kasr Al-Ainy Emergency Center', 'طوارئ قصر العيني'],
    ['exec@mnis.demo', 'EXECUTIVE', 'Eng. Sami Farouk', 'م. سامي فاروق', null, 'National Health Command', 'غرفة القيادة الوطنية', 'Ministry of Health & Population', 'وزارة الصحة والسكان'],
    ['reception@mnis.demo', 'RECEPTIONIST', 'Reception Desk', 'مكتب الاستقبال الموحد', null, 'Patient Registration', 'تسجيل المواطنين والبطاقات', 'Outpatient Complex', 'مجمع العيادات الخارجية'],
    ['admin@mnis.demo', 'ADMIN', 'System Admin', 'مدير النظام السيادي', null, 'System Governance', 'حوكمة وأمن المعلومات', 'MNIS Core Infrastructure', 'البنية التحتية الوطنية'],
  ];

  const userMap = {};
  for (const [email, role, en, ar, lic, specEn, specAr, facEn, facAr] of usersData) {
    const u = await prisma.user.upsert({
      where: { email },
      update: { fullNameEn: en, fullNameAr: ar, licenseNo: lic, specialityEn: specEn, specialityAr: specAr, facilityEn: facEn, facilityAr: facAr, passwordHash },
      create: { email, role, fullNameEn: en, fullNameAr: ar, licenseNo: lic, specialityEn: specEn, specialityAr: specAr, facilityEn: facEn, facilityAr: facAr, passwordHash },
    });
    userMap[email] = u;
  }

  const doctor = userMap['doctor@mnis.demo'];
  const doctor2 = userMap['doctor2@mnis.demo'];
  const pharmacist = userMap['pharmacist@mnis.demo'];
  const labTech = userMap['lab1@mnis.demo'];
  const reception = userMap['reception@mnis.demo'];
  const admin = userMap['admin@mnis.demo'];

  // 2. Seed Citizens (Patients) across Egyptian Governorates with Allergies & Chronic Conditions
  const ptsData = [
    {
      nid: '29304151234567',
      mti: 'MTI-EG-2930415',
      en: 'Ahmed Mohamed Ali',
      ar: 'أحمد محمد علي',
      sex: 'MALE',
      bd: '1985-04-12',
      bt: 'A+',
      gov: 'القاهرة (Cairo)',
      city: 'Nasr City',
      district: 'مدينة نصر',
      addressEn: '14 Abbas El-Akkad St, Nasr City, Cairo',
      addressAr: '١٤ شارع عباس العقاد، مدينة نصر، القاهرة',
      ins: true,
      donor: true,
      chronics: [
        { en: 'Essential Hypertension (I10)', ar: 'ارتفاع ضغط الدم المزمن (I10)' },
        { en: 'Type 2 Diabetes Mellitus (E11)', ar: 'مرض السكري من النوع الثاني (E11)' },
      ],
      allergies: [
        { en: 'Penicillin / Amoxicillin (Severe Anaphylaxis)', ar: 'حساسية مفرطة من البنسلين والأموكسيسيلين' },
      ],
    },
    {
      nid: '29001011234561',
      mti: 'MTI-EG-2900101',
      en: 'Mona Hassan Ibrahim',
      ar: 'منى حسن إبراهيم',
      sex: 'FEMALE',
      bd: '1990-01-01',
      bt: 'O+',
      gov: 'الجيزة (Giza)',
      city: 'Dokki',
      district: 'الدقي',
      addressEn: '22 Tahrir St, Dokki, Giza',
      addressAr: '٢٢ شارع التحرير، الدقي، الجيزة',
      ins: true,
      donor: true,
      chronics: [
        { en: 'Bronchial Asthma (J45)', ar: 'ربو شعبي مزمن (J45)' },
      ],
      allergies: [
        { en: 'Aspirin / NSAIDs', ar: 'حساسية من الأسبرين والمسكنات غير الستيرويدية' },
      ],
    },
    {
      nid: '28812121234562',
      mti: 'MTI-EG-2881212',
      en: 'Youssef Adel Fathy',
      ar: 'يوسف عادل فتحي',
      sex: 'MALE',
      bd: '1988-12-12',
      bt: 'B+',
      gov: 'الإسكندرية (Alexandria)',
      city: 'Smouha',
      district: 'سموحة',
      addressEn: '8 Victor Emmanuel Sq, Smouha, Alexandria',
      addressAr: '٨ ميدان فيكتور عمانويل، سموحة، الإسكندرية',
      ins: true,
      donor: false,
      chronics: [
        { en: 'Ischemic Heart Disease (I25)', ar: 'قصور الشريان التاجي (I25)' },
        { en: 'Dyslipidemia (E78)', ar: 'ارتفاع الكوليسترول ودهون الدم (E78)' },
      ],
      allergies: [],
    },
    {
      nid: '29506061234563',
      mti: 'MTI-EG-2950606',
      en: 'Sara Khaled Mahmoud',
      ar: 'سارة خالد محمود',
      sex: 'FEMALE',
      bd: '1995-06-06',
      bt: 'AB+',
      gov: 'بورسعيد (Port Said)',
      city: 'Al-Sharq',
      district: 'حي الشرق',
      addressEn: '10 El-Gomhouria St, Port Said',
      addressAr: '١٠ شارع الجمهورية، بورسعيد',
      ins: true,
      donor: true,
      chronics: [],
      allergies: [
        { en: 'Sulfa Drugs (Sulfonamides)', ar: 'حساسية من مركبات السلفا' },
      ],
    },
    {
      nid: '27903201234564',
      mti: 'MTI-EG-2790320',
      en: 'Mahmoud Abdel-Rahman Sayed',
      ar: 'محمود عبد الرحمن سيد',
      sex: 'MALE',
      bd: '1979-03-20',
      bt: 'O-',
      gov: 'أسوان (Aswan)',
      city: 'Aswan Center',
      district: 'كورنيش النيل - أسوان',
      addressEn: '45 Nile Corniche, Aswan',
      addressAr: '٤٥ كورنيش النيل، أسوان',
      ins: true,
      donor: true,
      chronics: [
        { en: 'Chronic Kidney Disease Stage 2 (N18.2)', ar: 'قصور كلوي مزمن من الدرجة الثانية (N18.2)' },
        { en: 'Essential Hypertension (I10)', ar: 'ارتفاع ضغط الدم (I10)' },
      ],
      allergies: [
        { en: 'Iodinated Contrast Media', ar: 'حساسية من صبغات الأشعة باليود' },
      ],
    },
    {
      nid: '28409181234565',
      mti: 'MTI-EG-2840918',
      en: 'Fatma El-Zahraa Mostafa',
      ar: 'فاطمة الزهراء مصطفى',
      sex: 'FEMALE',
      bd: '1984-09-18',
      bt: 'A-',
      gov: 'الأقصر (Luxor)',
      city: 'Luxor',
      district: 'وسط المدينة - الأقصر',
      addressEn: '12 Karnak Temple Rd, Luxor',
      addressAr: '١٢ طريق معبد الكرنك، الأقصر',
      ins: true,
      donor: false,
      chronics: [
        { en: 'Hypothyroidism (E03.9)', ar: 'قصور الغدة الدرقية (E03.9)' },
      ],
      allergies: [],
    },
    {
      nid: '27511051234566',
      mti: 'MTI-EG-2751105',
      en: 'Hassanein Mohamed Eliwa',
      ar: 'حسنين محمد عليوة',
      sex: 'MALE',
      bd: '1975-11-05',
      bt: 'B-',
      gov: 'أسيوط (Asyut)',
      city: 'Asyut',
      district: 'حي غرب أسيوط',
      addressEn: '9 El-Gamaa St, Asyut',
      addressAr: '٩ شارع الجامعة، أسيوط',
      ins: false,
      donor: false,
      chronics: [
        { en: 'Type 2 Diabetes Mellitus (E11)', ar: 'مرض السكري من النوع الثاني (E11)' },
      ],
      allergies: [],
    },
  ];

  const patients = [];
  for (const p of ptsData) {
    const record = await prisma.patient.upsert({
      where: { nationalIdIdx: idx(p.nid) },
      update: {
        fullNameEn: p.en,
        fullNameAr: p.ar,
        bloodType: p.bt,
        governorate: p.gov,
        city: p.city,
        district: p.district,
        addressEn: p.addressEn,
        addressAr: p.addressAr,
        insuranceActive: p.ins,
        organDonor: p.donor,
        chronicConditions: p.chronics,
        allergies: p.allergies,
      },
      create: {
        mti: p.mti,
        nationalIdEnc: enc(p.nid),
        nationalIdIdx: idx(p.nid),
        fullNameEn: p.en,
        fullNameAr: p.ar,
        sex: p.sex,
        birthDate: new Date(p.bd),
        bloodType: p.bt,
        governorate: p.gov,
        city: p.city,
        district: p.district,
        addressEn: p.addressEn,
        addressAr: p.addressAr,
        insuranceActive: p.ins,
        organDonor: p.donor,
        chronicConditions: p.chronics,
        allergies: p.allergies,
      },
    });
    patients.push(record);
  }

  // Link citizen login to all seeded patients
  for (const p of patients) {
    await prisma.user.upsert({
      where: { patientId: p.id },
      update: {
        fullNameEn: p.fullNameEn,
        fullNameAr: p.fullNameAr,
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      },
      create: {
        role: 'PATIENT',
        patientId: p.id,
        fullNameEn: p.fullNameEn,
        fullNameAr: p.fullNameAr,
        passwordHash,
        mustChangePassword: false,
        isActive: true,
      },
    });
  }
  const firstPatient = patients[0];
  const citizenUser = await prisma.user.findUnique({ where: { patientId: firstPatient.id } });

  // 3. Seed NFC Emergency Cards for Patients
  for (let i = 0; i < patients.length; i++) {
    const p = patients[i];
    const tokenRaw = `NFC-EG-DEMO-00${i + 1}`;
    const tHash = sha256(tokenRaw);
    await prisma.nfcCard.upsert({
      where: { tokenHash: tHash },
      update: { status: 'ACTIVE', patientId: p.id },
      create: {
        patientId: p.id,
        tokenHash: tHash,
        status: 'ACTIVE',
        printedById: reception.id,
      },
    });
  }

  // 4. Seed Doctor Weekly Schedule (Sun - Thu)
  for (const dayOfWeek of [0, 1, 2, 3, 4]) {
    await prisma.doctorSchedule.upsert({
      where: {
        doctorId_dayOfWeek_startTime: {
          doctorId: doctor.id,
          dayOfWeek,
          startTime: '09:00',
        },
      },
      update: { endTime: '17:00', slotMinutes: 20, isActive: true },
      create: {
        doctorId: doctor.id,
        dayOfWeek,
        startTime: '09:00',
        endTime: '17:00',
        slotMinutes: 20,
        isActive: true,
      },
    });
  }

  // 5. Seed Visits (Ensure 1 IN_CONSULTATION and several WAITING + COMPLETED)
  const existingInConsult = await prisma.visit.findFirst({ where: { status: 'IN_CONSULTATION' } });
  if (!existingInConsult) {
    await prisma.visit.create({
      data: {
        patientId: patients[0].id,
        ticketNo: 'C-101',
        reasonEn: 'Hypertension & Diabetes Follow-up + Chest Discomfort',
        reasonAr: 'متابعة ضغط الدم والسكري مع فحص ألم بالصدر',
        status: 'IN_CONSULTATION',
        isEmergency: false,
        doctorId: doctor.id,
        calledAt: new Date(),
      },
    });
  }
  const waitingCount = await prisma.visit.count({ where: { status: 'WAITING' } });
  if (waitingCount < 3) {
    await prisma.visit.create({
      data: {
        patientId: patients[1].id,
        ticketNo: 'A-102',
        reasonEn: 'Bronchial Asthma exacerbation review',
        reasonAr: 'مراجعة نوبات الربو الشعبي وتجديد البخاخات',
        status: 'WAITING',
        isEmergency: false,
        doctorId: doctor.id,
      },
    });
    await prisma.visit.create({
      data: {
        patientId: patients[2].id,
        ticketNo: 'E-103',
        reasonEn: 'Urgent Cardiology ECG & Troponin review',
        reasonAr: 'مراجعة عاجلة لرسم القلب وإنزيمات القلب',
        status: 'WAITING',
        isEmergency: true,
        doctorId: doctor.id,
      },
    });
  }
  const completedVisitCount = await prisma.visit.count({ where: { status: 'COMPLETED' } });
  if (completedVisitCount === 0) {
    const arrived = new Date(Date.now() - 45 * 60000);
    const called = new Date(Date.now() - 27 * 60000);
    await prisma.visit.create({
      data: {
        patientId: patients[4].id,
        ticketNo: 'A-099',
        reasonEn: 'Renal function & blood pressure check',
        reasonAr: 'متابعة وظائف الكلى وضغط الدم',
        status: 'COMPLETED',
        doctorId: doctor.id,
        arrivedAt: arrived,
        calledAt: called,
        completedAt: new Date(Date.now() - 10 * 60000),
      },
    });
  }

  // 6. Seed Appointments (Requested & Confirmed)
  if ((await prisma.appointment.count()) === 0) {
    await prisma.appointment.createMany({
      data: [
        {
          patientId: patients[0].id,
          doctorId: doctor.id,
          type: 'CLINIC',
          preferredDate: new Date(Date.now() + 2 * 86400000),
          reason: 'متابعة دورية لضغط الدم والسكر التراكمي — عيادة الباطنة والقلب',
          status: 'REQUESTED',
        },
        {
          patientId: patients[1].id,
          doctorId: doctor.id,
          type: 'CLINIC',
          preferredDate: new Date(Date.now() + 3 * 86400000),
          reason: 'استشارة حساسية الصدر وفحص كفاءة الرئة',
          status: 'REQUESTED',
        },
        {
          patientId: patients[2].id,
          doctorId: doctor.id,
          type: 'CLINIC',
          preferredDate: new Date(Date.now() + 86400000),
          scheduledAt: new Date(Date.now() + 86400000),
          reason: 'متابعة القسطرة القلبية وتعديل جرعة السيولة',
          status: 'CONFIRMED',
          decidedById: reception.id,
          decidedAt: new Date(),
        },
      ],
    });
  }

  // 7. Seed Prescriptions, PrescriptionItems, ChronicAllowances, RenewalRequests, Claims & Settlements
  const rxList = [
    {
      code: 'RX-EG-1001',
      patient: patients[0],
      physician: doctor,
      diagEn: 'Essential Hypertension & Type 2 Diabetes Mellitus',
      diagAr: 'ارتفاع ضغط الدم الأساسي والسكري من النوع الثاني',
      icd10: 'I10',
      status: 'DISPENSED',
      isChronic: true,
      items: [
        { nameEn: 'Amlodipine', nameAr: 'أملوديبين', form: 'Tablet', dose: '5mg', freqEn: 'Once daily', freqAr: 'قرص مرة يومياً', days: 30, qty: 30, allowance: 30 },
        { nameEn: 'Metformin', nameAr: 'ميتفورمين', form: 'Tablet', dose: '1000mg', freqEn: 'Twice daily after meals', freqAr: 'مرتين يومياً بعد الأكل', days: 30, qty: 60, allowance: 60 },
      ],
    },
    {
      code: 'RX-EG-1002',
      patient: patients[0],
      physician: doctor2,
      diagEn: 'Diabetic Neuropathy & Glycemic Control Follow-up',
      diagAr: 'التهاب الأعصاب الطرفية وضبط السكر',
      icd10: 'E11.4',
      status: 'SIGNED',
      isChronic: true,
      items: [
        { nameEn: 'Metformin', nameAr: 'ميتفورمين', form: 'Tablet', dose: '1000mg', freqEn: 'Twice daily', freqAr: 'مرتين يومياً', days: 30, qty: 60, allowance: 60 },
        { nameEn: 'Atorvastatin', nameAr: 'أتورفاستاتين', form: 'Tablet', dose: '20mg', freqEn: 'Once daily at night', freqAr: 'قرص مساءً يومياً', days: 30, qty: 30, allowance: 30 },
      ],
    },
    {
      code: 'RX-EG-1003',
      patient: patients[1],
      physician: doctor,
      diagEn: 'Persistent Bronchial Asthma',
      diagAr: 'ربو شعبي مستمر',
      icd10: 'J45.4',
      status: 'DISPENSED',
      isChronic: true,
      items: [
        { nameEn: 'Salbutamol Inhaler', nameAr: 'بخاخ سالبوتامول موسع للشعب', form: 'Inhaler', dose: '100mcg', freqEn: '2 puffs as needed', freqAr: 'بختان عند اللزوم', days: 30, qty: 2, allowance: 2 },
        { nameEn: 'Amlodipine', nameAr: 'أملوديبين', form: 'Tablet', dose: '5mg', freqEn: 'Once daily', freqAr: 'مرة يومياً', days: 30, qty: 30, allowance: 30 },
      ],
    },
    {
      code: 'RX-EG-1004',
      patient: patients[2],
      physician: doctor,
      diagEn: 'Coronary Artery Disease & Hyperlipidemia',
      diagAr: 'قصور الشريان التاجي وارتفاع دهون الدم',
      icd10: 'I25.1',
      status: 'VERIFIED',
      isChronic: true,
      items: [
        { nameEn: 'Clopidogrel', nameAr: 'كلوبيدوجريل (بلافيكس)', form: 'Tablet', dose: '75mg', freqEn: 'Once daily', freqAr: 'قرص يومياً بعد الغداء', days: 30, qty: 30, allowance: 30 },
        { nameEn: 'Atorvastatin', nameAr: 'أتورفاستاتين', form: 'Tablet', dose: '40mg', freqEn: 'Once daily', freqAr: 'قرص مساءً', days: 30, qty: 30, allowance: 30 },
      ],
    },
    {
      code: 'RX-EG-1005',
      patient: patients[3],
      physician: doctor,
      diagEn: 'Acute Upper Respiratory Tract Infection',
      diagAr: 'التهاب حاد بالجهاز التنفسي العلوي',
      icd10: 'J06.9',
      status: 'DRAFT',
      isChronic: false,
      items: [
        { nameEn: 'Paracetamol', nameAr: 'باراسيتامول', form: 'Tablet', dose: '500mg', freqEn: 'Every 8 hours', freqAr: 'كل ٨ ساعات', days: 5, qty: 15, allowance: null },
      ],
    },
  ];

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const nextMonthReset = new Date(curYear, curMonth, 1);

  const createdRxs = [];
  for (const r of rxList) {
    let rx = await prisma.prescription.findUnique({ where: { code: r.code }, include: { items: true } });
    if (!rx) {
      rx = await prisma.prescription.create({
        data: {
          code: r.code,
          patientId: r.patient.id,
          physicianId: r.physician.id,
          diagnosisEn: r.diagEn,
          diagnosisAr: r.diagAr,
          icd10: r.icd10,
          status: r.status,
          isChronic: r.isChronic,
          signedAt: r.status !== 'DRAFT' ? now : null,
          signatureHash: r.status !== 'DRAFT' ? sha256(r.code) : null,
          verifiedById: r.status === 'VERIFIED' || r.status === 'DISPENSED' ? pharmacist.id : null,
          verifiedAt: r.status === 'VERIFIED' || r.status === 'DISPENSED' ? now : null,
          dispensedById: r.status === 'DISPENSED' ? pharmacist.id : null,
          dispensedAt: r.status === 'DISPENSED' ? now : null,
          items: {
            create: r.items.map((it) => ({
              nameEn: it.nameEn,
              nameAr: it.nameAr,
              form: it.form,
              dose: it.dose,
              frequencyEn: it.freqEn,
              frequencyAr: it.freqAr,
              durationDays: it.days,
              quantity: it.qty,
              monthlyAllowance: it.allowance,
            })),
          },
        },
        include: { items: true },
      });
    }
    createdRxs.push(rx);

    // Seed Chronic Allowances for chronic items
    if (r.isChronic && rx.items.length > 0) {
      for (const item of rx.items) {
        if (item.monthlyAllowance) {
          await prisma.chronicAllowance.upsert({
            where: {
              patientId_itemId_periodYear_periodMonth: {
                patientId: r.patient.id,
                itemId: item.id,
                periodYear: curYear,
                periodMonth: curMonth,
              },
            },
            update: {},
            create: {
              patientId: r.patient.id,
              prescriptionId: rx.id,
              itemId: item.id,
              nameEn: `${item.nameEn} ${item.dose}`,
              nameAr: `${item.nameAr} ${item.dose}`,
              monthlyLimit: item.monthlyAllowance,
              consumed: Math.min(10, Math.floor(item.monthlyAllowance / 3)),
              periodYear: curYear,
              periodMonth: curMonth,
              resetAt: nextMonthReset,
            },
          });
        }
      }
    }
  }

  // Seed Renewal Requests for /doctor/renewals and Fraud Rapid Refills
  if ((await prisma.renewalRequest.count({ where: { status: 'PENDING' } })) === 0 && createdRxs.length >= 2) {
    await prisma.renewalRequest.createMany({
      data: [
        {
          patientId: patients[0].id,
          prescriptionId: createdRxs[0].id,
          status: 'PENDING',
          note: 'طلب تجديد شهري لأدوية الضغط والسكري عبر تطبيق المواطن',
        },
        {
          patientId: patients[1].id,
          prescriptionId: createdRxs[2].id,
          status: 'PENDING',
          note: 'طلب تجديد بخاخ الربو الشعبي الشهري',
        },
      ],
    });
  }

  // Seed Pharmacy Claims & Settlements
  for (const rx of createdRxs.filter((x) => x.status === 'DISPENSED')) {
    const existingClaim = await prisma.pharmacyClaim.findUnique({ where: { prescriptionId: rx.id } });
    if (!existingClaim) {
      const totalAmount = rx.items.length * 240;
      const coveragePct = 85;
      const insuranceAmount = totalAmount * (coveragePct / 100);
      const patientBalance = totalAmount - insuranceAmount;
      await prisma.pharmacyClaim.create({
        data: {
          prescriptionId: rx.id,
          patientId: rx.patientId,
          dispensedById: pharmacist.id,
          totalAmount,
          coveragePct,
          insuranceAmount,
          patientBalance,
          status: 'SUBMITTED',
        },
      });
    }
  }

  // Seed a historical Pharmacy Settlement for previous month
  const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
  const prevYear = curMonth === 1 ? curYear - 1 : curYear;
  await prisma.pharmacySettlement.upsert({
    where: { periodYear_periodMonth: { periodYear: prevYear, periodMonth: prevMonth } },
    update: {},
    create: {
      periodYear: prevYear,
      periodMonth: prevMonth,
      totalClaims: 42,
      totalAmount: 38640,
      submittedById: pharmacist.id,
      submittedAt: new Date(curYear, curMonth - 1, 1),
      status: 'SETTLED',
    },
  });

  // 8. Seed Pharmacy Drug Inventory
  if ((await prisma.drugInventory.count()) === 0) {
    await prisma.drugInventory.createMany({
      data: [
        { nameEn: 'Amlodipine 5mg', nameAr: 'أملوديبين ٥ مجم (علاج الضغط)', form: 'Tablet', batchNo: 'B-AML-2026', expiryDate: new Date(Date.now() + 300 * 86400000), quantity: 420, reorderAt: 50, unitCost: 45 },
        { nameEn: 'Metformin 1000mg', nameAr: 'ميتفورمين ١٠٠٠ مجم (منظم السكر)', form: 'Tablet', batchNo: 'B-MET-2026', expiryDate: new Date(Date.now() + 280 * 86400000), quantity: 650, reorderAt: 80, unitCost: 60 },
        { nameEn: 'Atorvastatin 20mg', nameAr: 'أتورفاستاتين ٢٠ مجم (خافض الكوليسترول)', form: 'Tablet', batchNo: 'B-ATO-2026', expiryDate: new Date(Date.now() + 365 * 86400000), quantity: 290, reorderAt: 40, unitCost: 95 },
        { nameEn: 'Clopidogrel 75mg', nameAr: 'كلوبيدوجريل ٧٥ مجم (مضاد الصفائح)', form: 'Tablet', batchNo: 'B-CLO-2026', expiryDate: new Date(Date.now() + 240 * 86400000), quantity: 180, reorderAt: 35, unitCost: 140 },
        { nameEn: 'Human Insulin Glargine 100IU/mL', nameAr: 'أنسولين جلارجين طويل المفعول', form: 'Pen', batchNo: 'B-INS-2026', expiryDate: new Date(Date.now() + 180 * 86400000), quantity: 18, reorderAt: 25, unitCost: 320 },
        { nameEn: 'Ceftriaxone 1g IV Vial', nameAr: 'سيفتر ياكسون ١ جم وريدي للطوارئ', form: 'Vial', batchNo: 'B-CEF-2026', expiryDate: new Date(Date.now() + 200 * 86400000), quantity: 12, reorderAt: 20, unitCost: 75 },
      ],
    });
  }

  // 9. Seed Lab Samples & Verified Results & Condition Flags
  const verifiedSampleCount = await prisma.labSample.count({ where: { status: 'VERIFIED' } });
  if (verifiedSampleCount === 0) {
    const collected = new Date(Date.now() - 3 * 3600000);
    const verified = new Date(Date.now() - 1 * 3600000);
    const s1 = await prisma.labSample.create({
      data: {
        barcode: 'EG-CBC-9001',
        patientId: patients[0].id,
        panelEn: 'HbA1c & Fasting Blood Glucose Panel',
        panelAr: 'تحليل السكر التراكمي وسكر الصائم',
        sampleTypeEn: 'Venous blood — EDTA & Fluoride',
        sampleTypeAr: 'دم وريدي — EDTA',
        orderedById: doctor.id,
        priority: 'URGENT',
        status: 'VERIFIED',
        collectedAt: collected,
        receivedAt: new Date(collected.getTime() + 1800000),
        enteredById: labTech.id,
        verifiedById: labTech.id,
        verifiedAt: verified,
        results: {
          create: [
            { analyteEn: 'HbA1c (Glycated Hemoglobin)', analyteAr: 'الهيموجلوبين السكري التراكمي', value: 7.8, unit: '%', refLow: 4.0, refHigh: 5.6, flag: 'HIGH' },
            { analyteEn: 'Fasting Plasma Glucose', analyteAr: 'سكر الدم الصائم', value: 154, unit: 'mg/dL', refLow: 70, refHigh: 100, flag: 'HIGH' },
            { analyteEn: 'Hemoglobin (Hb)', analyteAr: 'الهيموجلوبين', value: 14.2, unit: 'g/dL', refLow: 13.0, refHigh: 17.0, flag: 'NORMAL' },
          ],
        },
      },
    });

    // Also create a pending ConditionFlag for Doctor Review
    await prisma.conditionFlag.create({
      data: {
        patientId: patients[0].id,
        sampleId: s1.id,
        flaggedById: labTech.id,
        conditionEn: 'Uncontrolled Hyperglycemia (HbA1c > 7.5%)',
        conditionAr: 'ارتفاع غير منضبط بالسكر التراكمي (HbA1c > 7.5%)',
        conditionType: 'CHRONIC_CONDITION',
        status: 'PENDING',
      },
    });
  }

  // 10. Seed Lab Reagents (with 2 low-stock items to trigger alert banner)
  if ((await prisma.reagent.count()) === 0) {
    await prisma.reagent.createMany({
      data: [
        { catalogNo: 'RGT-CBC-01', nameEn: 'Sysmex Cellpack Diluent & Lyse Kit', nameAr: 'محلول عد الدم الكامل (Sysmex CBC)', quantity: 42, unit: 'kits', lowStockAt: 15, expiryDate: new Date(Date.now() + 240 * 86400000), supplierEn: 'Roche Egypt', supplierAr: 'روش مصر للمستلزمات' },
        { catalogNo: 'RGT-HBA-02', nameEn: 'Cobas HbA1c Tina-quant Gen.3', nameAr: 'كاشف السكر التراكمي (Cobas HbA1c)', quantity: 8, unit: 'kits', lowStockAt: 12, expiryDate: new Date(Date.now() + 150 * 86400000), supplierEn: 'Roche Diagnostics', supplierAr: 'روش التشخيصية' },
        { catalogNo: 'RGT-TRP-03', nameEn: 'High-Sensitivity Troponin-I Assay', nameAr: 'كاشف إنزيم القلب عالي الحساسية (Troponin-I)', quantity: 5, unit: 'kits', lowStockAt: 10, expiryDate: new Date(Date.now() + 120 * 86400000), supplierEn: 'Abbott Egypt', supplierAr: 'أبوت مصر' },
        { catalogNo: 'RGT-LIP-04', nameEn: 'Enzymatic Lipid Profile Panel Reagent', nameAr: 'كاشف دهون الدم والكوليسترول الكامل', quantity: 35, unit: 'kits', lowStockAt: 10, expiryDate: new Date(Date.now() + 300 * 86400000), supplierEn: 'Beckman Coulter', supplierAr: 'بيكمان كولتر' },
      ],
    });
  }

  // 11. Seed Lab Instruments & Calibration Records
  if ((await prisma.labInstrument.count()) === 0) {
    const analyzers = [
      { serialNo: 'ANL-COBAS-01', nameEn: 'Roche Cobas Pro c503 Chemistry Analyzer', nameAr: 'جهاز كيمياء الدم والمناعة (Roche Cobas Pro)', locationEn: 'Roche Cobas Pro c503', locationAr: 'قسم الكيمياء الإكلينيكية', interval: 30, result: 'PASS', notes: 'Control Sera L1 & L2 within ±0.4 SD' },
      { serialNo: 'ANL-SYSMEX-02', nameEn: 'Sysmex XN-1000 Hematology Analyzer', nameAr: 'جهاز صورة الدم الكاملة (Sysmex XN-1000)', locationEn: 'Sysmex XN-1000', locationAr: 'قسم أمراض الدم', interval: 14, result: 'PASS', notes: 'Tri-level whole blood QC passed' },
      { serialNo: 'ANL-ABBOTT-03', nameEn: 'Abbott Alinity i Immunoassay System', nameAr: 'جهاز الهرمونات ودلالات الأورام (Abbott Alinity)', locationEn: 'Abbott Alinity i', locationAr: 'وحدة المناعة والهرمونات', interval: 30, result: 'ADJUSTED', notes: '2-point curve recalibration completed' },
    ];
    for (const a of analyzers) {
      const inst = await prisma.labInstrument.create({
        data: {
          serialNo: a.serialNo,
          nameEn: a.nameEn,
          nameAr: a.nameAr,
          locationEn: a.locationEn,
          locationAr: a.locationAr,
          calibIntervalDays: a.interval,
          isActive: true,
        },
      });
      await prisma.calibrationRecord.create({
        data: {
          instrumentId: inst.id,
          performedById: labTech.id,
          performedAt: new Date(Date.now() - 2 * 86400000),
          nextDueAt: new Date(Date.now() + (a.interval - 2) * 86400000),
          result: a.result,
          notes: a.notes,
        },
      });
    }
  }

  // 12. Seed Radiology Upload for First Patient
  if ((await prisma.radiologyUpload.count()) === 0) {
    const samplePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await prisma.radiologyUpload.create({
      data: {
        patientId: patients[0].id,
        uploadedById: labTech.id,
        titleEn: 'X-Ray — Chest PA & Lateral View',
        titleAr: 'X-Ray — أشعة صدر أمامية وجانبية',
        mimeType: 'image/png',
        fileSizeBytes: 1024,
        fileBase64: samplePng,
        notes: 'Clear bilateral lung fields, normal cardiothoracic ratio, intact costophrenic angles. || الرئتان سليمتان، حجم القلب في المعدل الطبيعي، والزوايا الضلعية الحجابية حادة وسليمة.',
      },
    });
  }

  // 13. Seed Beds & Occupy 4 Beds for Realistic Occupancy Metrics
  if ((await prisma.bed.count()) === 0) {
    const wards = [
      ['ICU — Cardiac', 'عناية مركزة قلب'],
      ['Internal Medicine', 'قسم الباطنة العامة'],
      ['Surgery Ward', 'قسم الجراحة العامة'],
    ];
    for (const [w, [en, ar]] of wards.entries()) {
      for (let n = 1; n <= 6; n++) {
        await prisma.bed.create({ data: { wardEn: en, wardAr: ar, bedNumber: `W${w + 1}-${100 + n}` } });
      }
    }
  }
  const occupiedCount = await prisma.bed.count({ where: { status: 'OCCUPIED' } });
  if (occupiedCount === 0) {
    const allBeds = await prisma.bed.findMany({ orderBy: { bedNumber: 'asc' }, take: 4 });
    for (let i = 0; i < Math.min(3, allBeds.length); i++) {
      await prisma.bed.update({
        where: { id: allBeds[i].id },
        data: {
          status: 'OCCUPIED',
          patientId: patients[i + 2].id,
          acuity: i === 0 ? 1 : 2,
          admittedAt: new Date(Date.now() - (i + 1) * 3600000),
        },
      });
    }
  }

  // 14. Seed Blood Bank Units across all 8 Blood Types
  if ((await prisma.bloodUnit.count()) === 0) {
    const types = [
      ['O+', 6],
      ['O-', 3],
      ['A+', 5],
      ['A-', 2],
      ['B+', 4],
      ['B-', 2],
      ['AB+', 3],
      ['AB-', 2],
    ];
    let seq = 1001;
    for (const [bt, count] of types) {
      for (let i = 0; i < count; i++) {
        seq++;
        await prisma.bloodUnit.create({
          data: {
            bloodType: bt,
            unitCode: `BB-EG-${seq}`,
            collectedAt: new Date(Date.now() - 5 * 86400000),
            expiresAt: new Date(Date.now() + 30 * 86400000),
            status: 'AVAILABLE',
            donorName: 'National Blood Transfusion Center',
            notes: i % 3 === 0 ? 'PLASMA|300' : 'PACKED_RBC|450',
          },
        });
      }
    }
  }

  // 15. Seed Operating Room (OR) Cases (Completed, In Progress, Scheduled)
  if ((await prisma.orCase.count()) === 0) {
    await prisma.orCase.createMany({
      data: [
        {
          patientId: patients[2].id,
          surgeonId: doctor.id,
          procedureEn: 'Diagnostic Coronary Angiography & Stent Placement',
          procedureAr: 'قسطرة قلبية تشخيصية وتركيب دعامة دوائية بالشريان التاجي',
          theaterNo: 'OR-02',
          scheduledStart: new Date(Date.now() - 4 * 3600000),
          scheduledEnd: new Date(Date.now() - 2 * 3600000),
          status: 'COMPLETED',
          anaesthesiaEn: 'Local + Conscious Sedation',
          anaesthesiaAr: 'تخدير موضعي ومهدئ وريدي',
          createdById: admin.id,
        },
        {
          patientId: patients[4].id,
          surgeonId: doctor.id,
          procedureEn: 'AV Fistula Creation for Hemodialysis Access',
          procedureAr: 'عمل وصلة شريانية وريدية للغسيل الكلوي',
          theaterNo: 'OR-01',
          scheduledStart: new Date(Date.now() - 1 * 3600000),
          scheduledEnd: new Date(Date.now() + 1 * 3600000),
          status: 'IN_PROGRESS',
          anaesthesiaEn: 'Regional Block',
          anaesthesiaAr: 'تخدير نصفي / طرفي',
          createdById: admin.id,
        },
        {
          patientId: patients[3].id,
          surgeonId: doctor.id,
          procedureEn: 'Laparoscopic Cholecystectomy',
          procedureAr: 'استئصال المرارة بالمنظار الجراحي',
          theaterNo: 'OR-03',
          scheduledStart: new Date(Date.now() + 3 * 3600000),
          scheduledEnd: new Date(Date.now() + 5 * 3600000),
          status: 'SCHEDULED',
          anaesthesiaEn: 'General Anaesthesia',
          anaesthesiaAr: 'تخدير كلي',
          createdById: admin.id,
        },
      ],
    });
  }

  // 16. Seed Inter-Facility Referrals (Hospital, Lab, Pharmacy)
  if ((await prisma.referral.count()) === 0) {
    await prisma.referral.createMany({
      data: [
        {
          patientId: patients[0].id,
          senderId: doctor.id,
          target: 'HOSPITAL',
          urgency: 'CRITICAL',
          status: 'PENDING',
          departmentEn: 'Cardiology Care Unit (CCU)',
          departmentAr: 'وحدة رعاية القلب الحرجة (CCU)',
          reasonEn: 'Unstable angina with hypertensive urgency — immediate telemetry monitoring required.',
          reasonAr: 'ذبحة صدرية غير مستقرة مع ارتفاع حاد بضغط الدم — يتطلب متابعة فورية برعاية القلب.',
        },
        {
          patientId: patients[1].id,
          senderId: doctor.id,
          target: 'LAB',
          urgency: 'ROUTINE',
          status: 'ACCEPTED',
          testPanel: 'CBC & IgE Allergy Panel',
          reasonEn: 'Evaluate eosinophilia and total IgE for bronchial asthma control.',
          reasonAr: 'فحص صورة الدم الكاملة ومؤشرات الحساسية المناعية لمتابعة الربو الشعبي.',
        },
        {
          patientId: patients[4].id,
          senderId: doctor2.id,
          target: 'PHARMACY',
          urgency: 'ROUTINE',
          status: 'COMPLETED',
          medicationEn: 'Erythropoietin 4000 IU + Calcium Carbonate',
          medicationAr: 'إريثروبيوتين ٤٠٠٠ وحدة + كربونات الكالسيوم',
          reasonEn: 'Monthly renal anemia & bone mineral support refill.',
          reasonAr: 'صرف بروتوكول دعم أنيميا الكلى الشهري.',
        },
      ],
    });
  }

  // 17. Seed Citizen Push Notifications for Flutter App
  if (citizenUser && (await prisma.pushNotification.count({ where: { userId: citizenUser.id } })) === 0) {
    await prisma.pushNotification.createMany({
      data: [
        {
          userId: citizenUser.id,
          type: 'LAB_RESULT_READY',
          titleEn: 'Lab Results Verified & Ready',
          titleAr: 'نتائج التحاليل الطبية جاهزة ومعتمدة',
          bodyEn: 'Your HbA1c & Fasting Glucose panel (EG-CBC-9001) has been verified by the National Reference Lab.',
          bodyAr: 'تم اعتماد نتائج تحليل السكر التراكمي وسكر الصائم (EG-CBC-9001) وهي متاحة الآن في ملفك الطبي.',
          data: { barcode: 'EG-CBC-9001' },
        },
        {
          userId: citizenUser.id,
          type: 'PRESCRIPTION_DISPENSED',
          titleEn: 'Chronic Medication Dispensed',
          titleAr: 'تم صرف الروشتة الإلكترونية بنجاح',
          bodyEn: 'Prescription #RX-EG-1001 (Amlodipine & Metformin) was dispensed via UHIA insurance.',
          bodyAr: 'تم صرف الروشتة رقم #RX-EG-1001 (أملوديبين وميتفورمين) بتغطية التأمين الصحي الشامل.',
          data: { code: 'RX-EG-1001' },
        },
        {
          userId: citizenUser.id,
          type: 'APPOINTMENT_CONFIRMED',
          titleEn: 'Cardiology Follow-up Reminder',
          titleAr: 'تذكير بموعد المتابعة الطبية',
          bodyEn: 'Your follow-up consultation with Dr. Tarek Mahmoud at Cairo University Hospitals is active.',
          bodyAr: 'موعد المتابعة الدورية مع د. طارق محمود بعيادة القلب والباطنة مسجل ومفعل.',
          data: { ticketNo: 'C-101' },
        },
      ],
    });
  }

  // 19. Seed Citizen External Medical Documents for Flutter App
  if ((await prisma.document.count({ where: { patientId: firstPatient.id } })) === 0) {
    const samplePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await prisma.document.createMany({
      data: [
        {
          patientId: firstPatient.id,
          label: 'تقرير رسم قلب بالمجهود (ECG Stress Test) — مستشفى قصر العيني',
          mimeType: 'image/png',
          fileSizeBytes: 184320,
          fileBase64: samplePng,
          status: 'REVIEWED',
          reviewedById: doctor.id,
          reviewedAt: new Date(Date.now() - 86400000),
        },
        {
          patientId: firstPatient.id,
          label: 'شهادة حساسية دوائية معتمدة (Penicillin Anaphylaxis Alert)',
          mimeType: 'image/png',
          fileSizeBytes: 98304,
          fileBase64: samplePng,
          status: 'REVIEWED',
          reviewedById: doctor.id,
          reviewedAt: new Date(Date.now() - 172800000),
        },
      ],
    });
  }

  console.log('Comprehensive MNIS seed complete across all tables!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
