/**
 * Prisma Seed Script
 * Ported from server/database/seed-data.sql
 * Run: npx prisma db seed
 */

import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ["error"] });

async function main() {
  console.log("🌱 Seeding database...");

  // =============================================
  // 1. ASSET TYPES
  // =============================================
  const assetTypes = [
    { categoryName: "Hardware", typeName: "Laptop" },
    { categoryName: "Hardware", typeName: "Desktop" },
    { categoryName: "Hardware", typeName: "Monitor" },
    { categoryName: "Hardware", typeName: "Server" },
    { categoryName: "Hardware", typeName: "UPS" },
    { categoryName: "Hardware", typeName: "Printer" },
    { categoryName: "Hardware", typeName: "RAM" },
    { categoryName: "Hardware", typeName: "Mobile Phone" },
    { categoryName: "Hardware", typeName: "Tablet" },
    { categoryName: "Hardware", typeName: "Docking Station" },
    { categoryName: "Hardware", typeName: "IP Phone" },
    { categoryName: "Hardware", typeName: "External Hard Drive" },
    { categoryName: "Hardware", typeName: "Headset" },
    { categoryName: "Hardware", typeName: "Projector" },
    { categoryName: "Hardware", typeName: "Keyboard & Mouse" },
    { categoryName: "Software", typeName: "Design & Graphics" },
    { categoryName: "Software", typeName: "Development" },
    { categoryName: "Software", typeName: "Productivity Suite" },
    { categoryName: "Software", typeName: "Database Management" },
    { categoryName: "Software", typeName: "Project Management" },
    { categoryName: "Software", typeName: "Communication" },
    { categoryName: "Software", typeName: "VPN Client" },
    { categoryName: "Software", typeName: "Security" },
    { categoryName: "Networking", typeName: "Switch" },
    { categoryName: "Networking", typeName: "Router" },
    { categoryName: "Networking", typeName: "Firewall" },
    { categoryName: "Networking", typeName: "Access Point" },
    { categoryName: "Networking", typeName: "Patch Panel" },
    { categoryName: "Networking", typeName: "Wireless Controller" },
    { categoryName: "Networking", typeName: "Modem" },
    { categoryName: "Networking", typeName: "Server Rack" },
    { categoryName: "Networking", typeName: "VPN Gateway" },
  ];

  for (const at of assetTypes) {
    await prisma.assetType.upsert({
      where: { categoryName_typeName: at },
      update: {},
      create: at,
    });
  }
  console.log(`✅ ${assetTypes.length} asset types seeded`);

  // =============================================
  // 2. SYSTEM SETTINGS
  // =============================================
  const settings: { key: string; value: string }[] = [
    { key: "enableEmailNotifications", value: "true" },
    { key: "enableManualDispatch", value: "true" },
    { key: "enableActiveTimeWindow", value: "false" },
    { key: "activeHoursStart", value: "08:00" },
    { key: "activeHoursEnd", value: "18:00" },
    { key: "activeHoursTimezone", value: "" },
    { key: "enableLocationAllocation", value: "true" },
    { key: "enableMaintenanceAlerts", value: "true" },
    { key: "enableLicenseExpiryAlerts", value: "true" },
    { key: "enableAnomalyAlerts", value: "true" },
    { key: "enableHoarderAlerts", value: "true" },
    { key: "enableLemonAlerts", value: "true" },
    { key: "enableSoftwareDuplicateAlerts", value: "true" },
    { key: "enableGhostAssetAlerts", value: "true" },
    { key: "enableUserCreationAlerts", value: "true" },
    { key: "smtpHost", value: "smtp.gmail.com" },
    { key: "smtpPort", value: "465" },
    { key: "smtpUser", value: "" },
    { key: "smtpPassword", value: "" },
    { key: "hoarderAlertStep", value: "3" },
    { key: "softwareDuplicateAlertStep", value: "2" },
    { key: "lemonAlertWindowDays", value: "14" },
    { key: "lemonAlertCount", value: "3" },
    { key: "ghostAssetDormantDays", value: "365" },
    { key: "emailResumeDate", value: "" },
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }
  console.log(`✅ ${settings.length} system settings seeded`);

  // =============================================
  // 3. DEFAULT ADMIN USER
  // =============================================
  const adminPassword = await hash("Admin@1234", 12);
  await prisma.user.upsert({
    where: { id: "ADMIN001" },
    update: {},
    create: {
      id: "ADMIN001",
      fullName: "System Administrator",
      email: "admin@assetflow.local",
      password: adminPassword,
      role: "Admin",
      managedCategories: "ALL",
      department: "IT",
    },
  });
  console.log("✅ Default admin user created (ADMIN001 / Admin@1234)");

  console.log("\n🎉 Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
