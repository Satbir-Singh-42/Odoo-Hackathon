import { prisma } from "@/lib/prisma";

// In-memory cache — collapses 13+ identical DB reads per cron cycle into one.
// Invalidated via invalidateAdminEmailsCache() when the email list changes.
let _emailsCache: string | null = null;
let _emailsCacheExpiry = 0;
let _managerEmailsCache: string | null = null;
let _managerEmailsCacheExpiry = 0;
const EMAILS_CACHE_TTL_MS = 60 * 1000; // 60 seconds

let _managerEmailsFallbackCache = false;

export function invalidateAdminEmailsCache() {
  _emailsCache = null;
  _emailsCacheExpiry = 0;
  _managerEmailsCache = null;
  _managerEmailsCacheExpiry = 0;
  _managerEmailsFallbackCache = false;
}

export function dedupeEmails(value?: string | null): string {
  if (!value || typeof value !== "string") {
    return "";
  }

  const seen = new Map<string, string>();
  value.split(",").forEach((entry) => {
    const email = entry.trim();
    if (email) {
      seen.set(email.toLowerCase(), email);
    }
  });

  return [...seen.values()].join(", ");
}

export function toEmailList(value?: string | null): string[] {
  const deduped = dedupeEmails(value);
  if (!deduped) {
    return [];
  }

  return deduped
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isEmailInList(email: string, emailListValue?: string | null): boolean {
  if (!email) {
    return false;
  }

  const normalized = email.trim().toLowerCase();
  return toEmailList(emailListValue).some((entry) => entry.toLowerCase() === normalized);
}

export async function getAdminEmails(): Promise<string> {
  const now = Date.now();
  if (_emailsCache !== null && now < _emailsCacheExpiry) {
    return _emailsCache;
  }

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'AdminEmails' },
    });

    const fromSettings = setting?.value;
    const emails = fromSettings
      ? dedupeEmails(fromSettings)
      : dedupeEmails(process.env.EMAIL_RECIPIENT || "");

    _emailsCache = emails;
    _emailsCacheExpiry = now + EMAILS_CACHE_TTL_MS;
    return emails;
  } catch (error) {
    console.error("Failed to fetch admin emails from settings:", error);
    return dedupeEmails(process.env.EMAIL_RECIPIENT || "");
  }
}

export async function getOperationsManagerEmails(): Promise<string> {
  const { emails } = await getOperationsManagerEmailsWithFallbackInfo();
  return emails;
}

export async function getOperationsManagerEmailsWithFallbackInfo(): Promise<{ emails: string, isFallback: boolean }> {
  const now = Date.now();
  if (_managerEmailsCache !== null && now < _managerEmailsCacheExpiry) {
    return {
      emails: _managerEmailsCache,
      isFallback: _managerEmailsFallbackCache,
    };
  }

  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'OperationsManagerEmails' },
    });

    const fromSettings = setting?.value || "";
    let emails = dedupeEmails(fromSettings);
    let isFallback = false;

    if (!emails) {
      emails = await getAdminEmails();
      isFallback = true;
    }

    _managerEmailsCache = emails;
    _managerEmailsFallbackCache = isFallback;
    _managerEmailsCacheExpiry = now + EMAILS_CACHE_TTL_MS;
    return { emails, isFallback };
  } catch (error) {
    console.error("Failed to fetch operations manager emails from settings:", error);
    const emails = await getAdminEmails();
    return { emails, isFallback: true };
  }
}

export async function getAdminDisplayNames(adminEmails?: string): Promise<string> {
  const emails = adminEmails
    ? toEmailList(adminEmails)
    : toEmailList(await getAdminEmails());

  if (emails.length === 0) {
    return "";
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        isDeleted: false,
        email: {
          in: emails,
          mode: 'insensitive'
        }
      },
      select: { fullName: true }
    });

    const names = users
      .map((row: { fullName: string }) => row.fullName)
      .filter(Boolean)
      .join(", ");

    return names || dedupeEmails(emails.join(", "));
  } catch (error) {
    console.error("Failed to resolve admin display names:", error);
    return dedupeEmails(emails.join(", "));
  }
}

export async function getOperationsManagerDisplayNames(managerEmails?: string): Promise<string> {
  const emails = managerEmails
    ? toEmailList(managerEmails)
    : toEmailList(await getOperationsManagerEmails());

  if (emails.length === 0) {
    return "";
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        isDeleted: false,
        email: {
          in: emails,
          mode: 'insensitive'
        }
      },
      select: { fullName: true }
    });

    const names = users
      .map((row: { fullName: string }) => row.fullName)
      .filter(Boolean)
      .join(", ");

    return names || dedupeEmails(emails.join(", "));
  } catch (error) {
    console.error("Failed to resolve manager display names:", error);
    return dedupeEmails(emails.join(", "));
  }
}

export async function filterEmailsByCategory(emailsCsv: string, categoryName: string): Promise<string> {
  if (!emailsCsv || !categoryName) return emailsCsv;
  const emailList = toEmailList(emailsCsv);
  if (emailList.length === 0) return "";

  try {
    const users = await prisma.user.findMany({
      where: {
        isDeleted: false,
        email: {
          in: emailList,
          mode: 'insensitive'
        }
      },
      select: {
        email: true,
        managedCategories: true
      }
    });

    const validUserEmails = new Set<string>();
    const filteredUserEmails: string[] = [];

    for (const row of users) {
      if (!row.email) continue;
      
      validUserEmails.add(row.email.toLowerCase());
      const managed = row.managedCategories;
      
      if (!managed || managed === "ALL") {
        filteredUserEmails.push(row.email);
      } else {
        const categories = managed.split(",").map((c: string) => c.trim());
        if (categories.includes("ALL") || categories.includes(categoryName)) {
          filteredUserEmails.push(row.email);
        }
      }
    }

    const externalEmails = emailList.filter(
      (e) => !validUserEmails.has(e.toLowerCase()),
    );

    return [...filteredUserEmails, ...externalEmails].join(", ");
  } catch (error) {
    console.error("Failed to filter emails by category:", error);
    return emailsCsv;
  }
}
