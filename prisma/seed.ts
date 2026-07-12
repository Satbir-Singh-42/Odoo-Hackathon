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
  // 3. DEFAULT USERS
  // =============================================
  const adminPassword = await hash("Admin@1234", 12);
  const userPassword = await hash("User@1234", 12);

  const users = [
    {
      id: "ADMIN001",
      fullName: "System Administrator",
      email: "admin@assetflow.local",
      password: adminPassword,
      role: "Admin",
      managedCategories: "ALL",
      department: "IT",
    },
    {
      id: "MGR001",
      fullName: "IT Manager",
      email: "itmanager@assetflow.local",
      password: adminPassword,
      role: "Manager",
      managedCategories: "Hardware,Software",
      department: "IT",
    },
    {
      id: "EMP001",
      fullName: "John Doe",
      email: "john.doe@assetflow.local",
      password: userPassword,
      role: "Viewer",
      managedCategories: "",
      department: "Engineering",
    },
    {
      id: "EMP002",
      fullName: "Jane Smith",
      email: "jane.smith@assetflow.local",
      password: userPassword,
      role: "Viewer",
      managedCategories: "",
      department: "Design",
    },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: u,
    });
  }
  console.log(`✅ ${users.length} users seeded`);

  // =============================================
  // 4. VENDORS
  // =============================================
  const vendors = [
    {
      vendorCode: "VND-DELL",
      vendorName: "Dell Technologies",
      contactPerson: "Mike Johnson",
      email: "sales@dell.local",
      phone: "1-800-555-0101",
      address: "Round Rock, TX",
      category: "Hardware",
      rating: 4.8,
    },
    {
      vendorCode: "VND-APPL",
      vendorName: "Apple Inc.",
      contactPerson: "Sarah Connor",
      email: "enterprise@apple.local",
      phone: "1-800-555-0102",
      address: "Cupertino, CA",
      category: "Hardware",
      rating: 4.9,
    },
    {
      vendorCode: "VND-MSFT",
      vendorName: "Microsoft Corp",
      contactPerson: "Bill Gates",
      email: "licensing@microsoft.local",
      phone: "1-800-555-0103",
      address: "Redmond, WA",
      category: "Software",
      rating: 4.7,
    },
    {
      vendorCode: "VND-CSCO",
      vendorName: "Cisco Systems",
      contactPerson: "John Chambers",
      email: "sales@cisco.local",
      phone: "1-800-555-0104",
      address: "San Jose, CA",
      category: "Networking",
      rating: 4.6,
    },
  ];

  for (const v of vendors) {
    await prisma.vendor.upsert({
      where: { vendorCode: v.vendorCode },
      update: {},
      create: v,
    });
  }
  console.log(`✅ ${vendors.length} vendors seeded`);

  // =============================================
  // 5. ASSETS
  // =============================================
  const dell = await prisma.vendor.findUnique({ where: { vendorCode: "VND-DELL" } });
  const apple = await prisma.vendor.findUnique({ where: { vendorCode: "VND-APPL" } });
  const msft = await prisma.vendor.findUnique({ where: { vendorCode: "VND-MSFT" } });

  const assets = [
    {
      assetCode: "HW-LT-001",
      assetName: "Dell Latitude 7420",
      categoryId: "Hardware",
      assetTypeId: "Laptop",
      vendorId: dell?.id,
      purchasePrice: 1200.0,
      totalQuantity: 1,
      serialNumber: "DL7420-XYZ-01",
      model: "Latitude 7420",
      ram: "16GB",
      storage: "512GB SSD",
      processor: "Intel Core i7",
      status: "Available",
      condition: "Excellent",
    },
    {
      assetCode: "HW-LT-002",
      assetName: "MacBook Pro 16",
      categoryId: "Hardware",
      assetTypeId: "Laptop",
      vendorId: apple?.id,
      purchasePrice: 2400.0,
      totalQuantity: 1,
      serialNumber: "MBP16-ABC-02",
      model: "MacBook Pro 16-inch 2023",
      ram: "32GB",
      storage: "1TB SSD",
      processor: "Apple M2 Pro",
      status: "Allocated",
      condition: "Good",
    },
    {
      assetCode: "SW-O365-001",
      assetName: "Microsoft Office 365 E3",
      categoryId: "Software",
      assetTypeId: "Productivity Suite",
      vendorId: msft?.id,
      purchasePrice: 20.0,
      totalQuantity: 100,
      licenseType: "SUBSCRIPTION",
      licenseExpiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      status: "Partially Allocated",
    }
  ];

  for (const a of assets) {
    await prisma.asset.upsert({
      where: { assetCode: a.assetCode },
      update: {},
      create: a,
    });
  }
  console.log(`✅ ${assets.length} assets seeded`);

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
