const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  console.log("Starting E2E Test...");
  try {
    // 1. Get Receptionist
    const rec = await prisma.user.findFirst({ where: { role: 'RECEPTIONIST' } });
    const doc = await prisma.user.findFirst({ where: { role: 'DOCTOR' } });
    const pharm = await prisma.user.findFirst({ where: { role: 'PHARMACIST' } });
    
    console.log("Users found:", !!rec, !!doc, !!pharm);

    // 2. See if there are patients in queue
    const queue = await prisma.queueTicket.findMany();
    console.log("Queue size:", queue.length);

    // 3. See if Prescriptions are linked to Pharmacy Claims
    const rx = await prisma.prescription.findMany({ include: { items: true } });
    console.log("Prescriptions:", rx.length);

    const claims = await prisma.pharmacyClaim.findMany();
    console.log("Claims:", claims.length);

    const er = await prisma.eRCase.findMany();
    console.log("ER Cases:", er.length);

    const referrals = await prisma.referral.findMany();
    console.log("Referrals:", referrals.length);

  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
test();
