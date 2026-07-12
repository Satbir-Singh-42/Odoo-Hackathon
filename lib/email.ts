/**
 * lib/email.ts
 * Full email service — ported from the original emailService.js.
 * Sends maintenance, license, anomaly, troubleshoot, welcome, and password-reset emails
 * via Nodemailer (Gmail SMTP or any SMTP relay).
 */

import nodemailer from "nodemailer";
import { getSystemSettings } from "@/lib/services/notificationService";

// =============================================
// CONSTANTS
// =============================================

const EMAIL_SYSTEM_NAME = "Asset Management System";
const CLIENT_URL = process.env.CLIENT_URL ?? "";
const PORTAL_LINK = CLIENT_URL || "#";
const SHOULD_LOG_WARNINGS = process.env.NODE_ENV !== "production";

const CELL_STYLE = "padding:8px 12px;border:1px solid #e2e8f0;";
const HEADER_CELL_STYLE = "padding:8px 12px;border:1px solid #e2e8f0;text-align:left;";

// =============================================
// SMTP TRANSPORTER (cached, config-aware)
// =============================================

let transporter: nodemailer.Transporter | null = null;
let lastSmtpConfigString: string | null = null;
let hasWarnedMissingTransporterConfig = false;

function warnSkip(message: string, meta?: unknown) {
  if (!SHOULD_LOG_WARNINGS) return;
  if (meta) console.warn(`[EmailService] ${message}`, meta);
  else console.warn(`[EmailService] ${message}`);
}

function splitEmailList(value?: string | null): string[] {
  if (!value) return [];
  return String(value).split(",").map((e) => e.trim()).filter(Boolean);
}

function dedupeEmailList(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((email) => {
    const key = email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeEmailList(value?: string | string[] | null): string[] {
  if (Array.isArray(value)) return dedupeEmailList(value.map((e) => e.trim()).filter(Boolean));
  return dedupeEmailList(splitEmailList(value));
}

async function getSmtpSettings(): Promise<{
  host: string;
  port: number;
  user: string;
  pass: string;
}> {
  try {
    const settings = await getSystemSettings();
    const parsed = settings["notification_control_settings"]
      ? JSON.parse(settings["notification_control_settings"])
      : {};
    return {
      host: parsed.smtpHost || process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(parsed.smtpPort || process.env.SMTP_PORT || 587),
      user: parsed.smtpUser || process.env.EMAIL_USER || "",
      pass: parsed.smtpPassword || process.env.EMAIL_APP_PASSWORD || "",
    };
  } catch {
    return {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.EMAIL_USER || "",
      pass: process.env.EMAIL_APP_PASSWORD || "",
    };
  }
}

export async function getTransporter(): Promise<nodemailer.Transporter | null> {
  const { host, port, user, pass } = await getSmtpSettings();
  const configString = JSON.stringify({ host, port, user, pass });

  if (transporter && lastSmtpConfigString === configString) return transporter;

  if (host.includes("gmail.com") && (!user || !pass)) {
    if (!hasWarnedMissingTransporterConfig && SHOULD_LOG_WARNINGS) {
      console.warn("[EmailService] Gmail SMTP requires credentials. Email sending is disabled.");
      hasWarnedMissingTransporterConfig = true;
    }
    return null;
  }

  const config: nodemailer.TransportOptions & Record<string, unknown> = {
    host,
    port,
    secure: port === 465,
  };

  if (user && pass) {
    config.auth = { user, pass };
  } else {
    config.tls = { rejectUnauthorized: false };
  }

  transporter = nodemailer.createTransport(config);
  lastSmtpConfigString = configString;
  hasWarnedMissingTransporterConfig = false;
  return transporter;
}

async function getFromAddress(): Promise<string> {
  const { user } = await getSmtpSettings();
  const fromEmail = user || process.env.EMAIL_FROM || "asset-management@internal.local";
  return `"${EMAIL_SYSTEM_NAME}" <${fromEmail}>`;
}

/** Get admin email recipients from env or system settings. */
export async function getAdminEmails(): Promise<string[]> {
  const envEmail = process.env.EMAIL_RECIPIENT ?? process.env.EMAIL_FROM ?? "";
  if (envEmail) return normalizeEmailList(envEmail);
  try {
    const settings = await getSystemSettings();
    return normalizeEmailList(settings["admin_emails"] ?? "");
  } catch {
    return [];
  }
}

// =============================================
// CORE SEND
// =============================================

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  cc?: string | string[] | null;
  from?: string;
  smtp?: { host: string; port: number; user?: string; pass?: string };
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  // Check global toggle
  try {
    const settings = await getSystemSettings();
    const parsed = settings["notification_control_settings"]
      ? JSON.parse(settings["notification_control_settings"])
      : {};
    if (parsed.enableEmailNotifications === false) {
      warnSkip("Skipped email send — email notifications disabled globally.", { subject: options.subject });
      return;
    }
  } catch { /* ignore */ }

  const toList = normalizeEmailList(options.to);
  if (toList.length === 0) {
    warnSkip("Skipped email send — recipient is missing.", { subject: options.subject });
    return;
  }

  let t: nodemailer.Transporter | null;
  if (options.smtp) {
    // Per-call SMTP override (used by test-smtp)
    t = nodemailer.createTransport({
      host: options.smtp.host,
      port: options.smtp.port,
      secure: options.smtp.port === 465,
      auth: options.smtp.user && options.smtp.pass
        ? { user: options.smtp.user, pass: options.smtp.pass }
        : undefined,
      tls: { rejectUnauthorized: false },
    } as nodemailer.TransportOptions);
  } else {
    t = await getTransporter();
  }

  if (!t) return;

  const ccList = normalizeEmailList(options.cc);
  const toSet = new Set(toList.map((e) => e.toLowerCase()));
  const filteredCc = ccList.filter((e) => !toSet.has(e.toLowerCase()));

  await t.sendMail({
    from: options.from ?? await getFromAddress(),
    to: toList.join(", "),
    cc: filteredCc.length > 0 ? filteredCc.join(", ") : undefined,
    subject: options.subject,
    html: options.html,
  });
}

// =============================================
// TEMPLATE RENDERER
// =============================================

interface EmailTemplateParams {
  title: string;
  headerGradient: string;
  subtitle: string;
  subtitleColor: string;
  contentHtml: string;
  footerBgColor?: string;
  footerText?: string;
}

function renderEmailTemplate(params: EmailTemplateParams): string {
  const {
    title, headerGradient, subtitle, subtitleColor,
    contentHtml, footerBgColor = "#f8fafc",
    footerText = `${EMAIL_SYSTEM_NAME} — Automated Notification`,
  } = params;
  return `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <div style="background:${headerGradient};padding:24px 32px;">
    <h2 style="color:#ffffff;margin:0;font-size:20px;">${title}</h2>
    <p style="color:${subtitleColor};margin:6px 0 0;font-size:14px;">${subtitle}</p>
  </div>
  <div style="padding:24px 32px;">${contentHtml}</div>
  <div style="background:${footerBgColor};padding:12px 32px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#94a3b8;">${footerText}</p>
  </div>
</div>`;
}

/** Simple branded wrapper — used by emailDispatcher */
export function buildEmailHtml(params: { title: string; body: string; actionLabel?: string; actionUrl?: string }): string {
  const { title, body, actionLabel, actionUrl } = params;
  const btn = actionLabel && actionUrl
    ? `<div style="text-align:center;margin:28px 0;"><a href="${actionUrl}" style="background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${actionLabel}</a></div>`
    : "";
  return renderEmailTemplate({
    title,
    headerGradient: "linear-gradient(135deg,#1e40af,#3b82f6)",
    subtitle: "AssetFlow Asset Management Platform",
    subtitleColor: "#bfdbfe",
    contentHtml: `<div style="color:#475569;font-size:14px;line-height:1.7;">${body}</div>${btn}`,
  });
}

// =============================================
// HELPERS
// =============================================

function formatInDate(dateValue?: string | Date | null): string {
  if (!dateValue) return "—";
  return new Date(dateValue).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function countAssets(records: any[], opts: { bulkFlagField?: string; unitCountField?: string } = {}): number {
  const { bulkFlagField = "isBulkGroupRecord", unitCountField = "childUnitCount" } = opts;
  return records.reduce((acc, r) => r[bulkFlagField] ? acc + (Number(r[unitCountField]) || 0) : acc + 1, 0);
}

interface TableColumn<T> {
  header: string;
  style?: string | ((r: T) => string);
  formatter: (r: T) => string;
}

function buildTableRows<T>(records: T[], columns: TableColumn<T>[]): string {
  return records.map((r) =>
    `<tr>${columns.map((col) => {
      const style = typeof col.style === "function" ? col.style(r) : col.style || CELL_STYLE;
      return `<td style="${style}">${col.formatter(r)}</td>`;
    }).join("")}</tr>`
  ).join("");
}

function renderTable<T>(columns: TableColumn<T>[], rowsHtml: string, headerBackground: string): string {
  const headers = columns.map((c) => `<th style="${HEADER_CELL_STYLE}">${c.header}</th>`).join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr style="background:${headerBackground};">${headers}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;
}

// =============================================
// MAINTENANCE EMAILS
// =============================================

type MaintenanceEmailType = "REMINDER" | "ACTION_TODAY" | "OVERDUE";

interface MaintenanceEmailConfig {
  title: string;
  headerGradient: string;
  subtitleColor: string;
  subtitle: (n: number) => string;
  tableHeaderBackground: string;
  footerBgColor: string;
  portalText: string;
  portalColor: string;
  portalSuffix: string;
  subject: (n: number) => string;
}

const MAINTENANCE_EMAIL_CONFIG: Record<MaintenanceEmailType, MaintenanceEmailConfig> = {
  REMINDER: {
    title: "Upcoming Maintenance Reminder",
    headerGradient: "linear-gradient(135deg,#3b82f6,#2563eb)",
    subtitleColor: "#dbeafe",
    subtitle: (n) => `The following ${n} asset(s) have maintenance scheduled for <strong>tomorrow</strong>.`,
    tableHeaderBackground: "#f1f5f9",
    footerBgColor: "#f8fafc",
    portalText: "Please ensure the required preparations are in place. Log in to the",
    portalColor: "#3b82f6",
    portalSuffix: "for details.",
    subject: (n) => `Maintenance Reminder: ${n} asset(s) scheduled for tomorrow`,
  },
  ACTION_TODAY: {
    title: "Action Required: Maintenance Today",
    headerGradient: "linear-gradient(135deg,#f59e0b,#d97706)",
    subtitleColor: "#fef3c7",
    subtitle: (n) => `The following ${n} asset(s) have maintenance scheduled for <strong>TODAY</strong>.`,
    tableHeaderBackground: "#fffbeb",
    footerBgColor: "#fffbeb",
    portalText: "Please begin the scheduled maintenance. Log in to the",
    portalColor: "#d97706",
    portalSuffix: "to update the status.",
    subject: (n) => `Action Required: ${n} asset(s) scheduled for maintenance today`,
  },
  OVERDUE: {
    title: "Overdue Maintenance Alert",
    headerGradient: "linear-gradient(135deg,#ef4444,#dc2626)",
    subtitleColor: "#fecaca",
    subtitle: (n) => `The following ${n} asset(s) have <strong>missed their scheduled maintenance date</strong>.`,
    tableHeaderBackground: "#fef2f2",
    footerBgColor: "#fef2f2",
    portalText: "Immediate action is recommended. Log in to the",
    portalColor: "#ef4444",
    portalSuffix: "to update the maintenance status.",
    subject: (n) => `Overdue Alert: ${n} asset(s) missed maintenance schedule`,
  },
};

interface MaintenanceRecord {
  assetCode: string;
  assetName: string;
  scheduledDate?: string | Date;
  description?: string;
  technician?: string;
  daysOverdue?: number;
  isBulkGroupRecord?: boolean;
  childUnitCount?: number;
}

function getMaintenanceColumns(type: MaintenanceEmailType): TableColumn<MaintenanceRecord>[] {
  const dateStyle: string | ((r: MaintenanceRecord) => string) =
    type === "ACTION_TODAY" ? `${CELL_STYLE}font-weight:600;color:#f59e0b;`
    : type === "OVERDUE" ? `${CELL_STYLE}color:#dc2626;font-weight:600;`
    : CELL_STYLE;

  const cols: TableColumn<MaintenanceRecord>[] = [
    { header: "Asset Code", style: CELL_STYLE, formatter: (r) => r.assetCode },
    { header: "Asset Name", style: CELL_STYLE, formatter: (r) => r.assetName },
    { header: "Scheduled Date", style: dateStyle, formatter: (r) => formatInDate(r.scheduledDate) },
  ];

  if (type === "OVERDUE") {
    cols.push({ header: "Days Overdue", style: CELL_STYLE, formatter: (r) => `${r.daysOverdue ?? "—"} day(s)` });
  }

  cols.push(
    { header: "Description", style: CELL_STYLE, formatter: (r) => r.description || "—" },
    { header: "Technician", style: CELL_STYLE, formatter: (r) => r.technician || "—" },
  );
  return cols;
}

export interface EmailPayload { to: string; subject: string; html: string; cc?: string | null }

function buildMaintenanceEmailPayload(
  type: MaintenanceEmailType,
  records: MaintenanceRecord[],
  recipient: string,
  ccAdmin?: string | null,
): EmailPayload | null {
  const config = MAINTENANCE_EMAIL_CONFIG[type];
  if (!Array.isArray(records) || records.length === 0) { warnSkip(`Skipped ${type} email — no records.`); return null; }
  if (!recipient) { warnSkip(`Skipped ${type} email — no recipient.`); return null; }

  const totalAssets = countAssets(records);
  const cols = getMaintenanceColumns(type);
  const rows = buildTableRows(records, cols);
  const table = renderTable(cols, rows, config.tableHeaderBackground);

  const contentHtml = `${table}
    <p style="margin-top:20px;font-size:13px;color:#64748b;">
      ${config.portalText}
      <a href="${PORTAL_LINK}" style="color:${config.portalColor};">Asset Management Portal</a>
      ${config.portalSuffix}
    </p>`;

  return {
    to: recipient,
    cc: ccAdmin ?? null,
    subject: config.subject(totalAssets),
    html: renderEmailTemplate({ title: config.title, headerGradient: config.headerGradient, subtitle: config.subtitle(totalAssets), subtitleColor: config.subtitleColor, contentHtml, footerBgColor: config.footerBgColor }),
  };
}

export const buildMaintenanceReminderPayload = (r: MaintenanceRecord[], to: string, cc?: string | null) => buildMaintenanceEmailPayload("REMINDER", r, to, cc);
export const buildMaintenanceActionTodayPayload = (r: MaintenanceRecord[], to: string, cc?: string | null) => buildMaintenanceEmailPayload("ACTION_TODAY", r, to, cc);
export const buildMaintenanceOverduePayload = (r: MaintenanceRecord[], to: string, cc?: string | null) => buildMaintenanceEmailPayload("OVERDUE", r, to, cc);

// =============================================
// LICENSE EXPIRY EMAILS
// =============================================

interface LicenseRecord {
  assetCode: string;
  assetName: string;
  licenseType?: string;
  licenseExpiryDate?: string | Date;
  daysUntilExpiry: number;
  isBulkGroup?: boolean;
  unitCount?: number;
}

export function buildLicenseExpiryReminderPayload(
  records: LicenseRecord[],
  recipient: string,
  category: "WEEKLY" | "1D" | "EXPIRED" = "WEEKLY",
  cc?: string | null,
): EmailPayload | null {
  if (!records?.length) { warnSkip("Skipped license expiry email — no records."); return null; }
  if (!recipient) { warnSkip("Skipped license expiry email — no recipient."); return null; }

  const isWeekly = category === "WEEKLY";
  const is1Day = category === "1D";
  const isExpired = category === "EXPIRED";

  const headerColor = isWeekly ? "linear-gradient(135deg,#7c3aed,#6d28d9)" : "linear-gradient(135deg,#dc2626,#b91c1c)";
  const footerBg = isWeekly ? "#f5f3ff" : "#fef2f2";
  const tableHeaderBg = isWeekly ? "#f5f3ff" : "#fef2f2";

  const cols: TableColumn<LicenseRecord>[] = [
    { header: "Asset Code", style: CELL_STYLE, formatter: (r) => r.assetCode },
    { header: "Asset Name", style: CELL_STYLE, formatter: (r) => r.assetName },
    { header: "License Type", style: CELL_STYLE, formatter: (r) => r.licenseType || "—" },
    { header: "Expiry Date", style: `${CELL_STYLE}color:#7c3aed;font-weight:600;`, formatter: (r) => formatInDate(r.licenseExpiryDate) },
    {
      header: isExpired ? "Days Expired" : "Days Left",
      style: (r) => r.daysUntilExpiry < 0 ? `${CELL_STYLE}font-weight:600;color:#dc2626;` : `${CELL_STYLE}font-weight:600;color:${r.daysUntilExpiry <= 7 ? "#dc2626" : "#d97706"};`,
      formatter: (r) => isExpired ? `${Math.abs(r.daysUntilExpiry)} day(s) ago` : `${r.daysUntilExpiry} day(s)`,
    },
  ];

  const totalAssets = countAssets(records, { bulkFlagField: "isBulkGroup", unitCountField: "unitCount" });
  const rows = buildTableRows(records, cols);
  const table = renderTable(cols, rows, tableHeaderBg);
  const subtitleLabel = isWeekly ? "will expire soon" : is1Day ? "will expire in exactly <strong>1 day</strong>" : "have <strong>expired</strong>";

  const title = isWeekly ? "License Expiry — Weekly Reminder" : is1Day ? "License Expiry — Final 24 Hour Alert" : "License Expiry — Action Required (Expired)";
  const subject = isWeekly ? `License Expiry Reminder: ${totalAssets} license(s) expiring soon` : is1Day ? `Critical: ${totalAssets} license(s) expiring in 24 hours` : `Urgent Action Required: ${totalAssets} license(s) have expired`;

  return {
    to: recipient,
    cc: cc ?? null,
    subject,
    html: renderEmailTemplate({
      title,
      headerGradient: headerColor,
      subtitle: `The following ${totalAssets} software license(s) ${subtitleLabel}. ${isExpired ? "Please arrange renewal immediately." : "Please arrange renewal."}`,
      subtitleColor: isWeekly ? "#ede9fe" : "#fecaca",
      contentHtml: `${table}<p style="margin-top:20px;font-size:13px;color:#64748b;">Please review these licenses. Log in to the <a href="${PORTAL_LINK}" style="color:#7c3aed;">Asset Management Portal</a> for details.</p>`,
      footerBgColor: footerBg,
    }),
  };
}

// =============================================
// ANOMALY EMAILS
// =============================================

function renderAnomalyEnvelope(title: string, headerColor: string, bodyHtml: string): string {
  return renderEmailTemplate({
    title,
    headerGradient: `linear-gradient(135deg,${headerColor},#991b1b)`,
    subtitle: `${EMAIL_SYSTEM_NAME} — Automated Anomaly Detection`,
    subtitleColor: "#fecaca",
    contentHtml: bodyHtml,
    footerBgColor: "#fef2f2",
    footerText: `${EMAIL_SYSTEM_NAME} — Automated Anomaly Alert`,
  });
}

function renderHoarderAlert(payload: { userName: string; assetType: string; activeCount: number }): { subject: string; html: string } {
  const { userName, assetType, activeCount } = payload;
  return {
    subject: `Anomaly Detected: ${userName} currently possesses ${activeCount} Active ${assetType}(s)`,
    html: renderAnomalyEnvelope("Allocation Anomaly - Excessive Asset Possession", "#dc2626", `
      <p style="font-size:15px;color:#1e293b;margin:0 0 16px;"><strong>Anomaly Detected</strong></p>
      <p style="font-size:14px;color:#334155;margin:0 0 12px;">Employee <strong>${userName}</strong> currently has <strong style="color:#dc2626;">${activeCount} active ${assetType}(s)</strong> allocated simultaneously, which exceeds the normal threshold of 2.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        <tr style="background:#fef2f2;"><th style="${HEADER_CELL_STYLE}">Field</th><th style="${HEADER_CELL_STYLE}">Value</th></tr>
        <tr><td style="${CELL_STYLE}">Employee</td><td style="${CELL_STYLE}font-weight:600;">${userName}</td></tr>
        <tr><td style="${CELL_STYLE}">Asset Type</td><td style="${CELL_STYLE}">${assetType}</td></tr>
        <tr><td style="${CELL_STYLE}">Active Allocations</td><td style="${CELL_STYLE}color:#dc2626;font-weight:700;">${activeCount}</td></tr>
      </table>
      <p style="font-size:13px;color:#64748b;"><strong>Recommended action:</strong> Review this employee's active allocations and revoke any unnecessary assets. Log in to the <a href="${PORTAL_LINK}" style="color:#dc2626;">Asset Management Portal</a> to inspect and manage allocations.</p>`),
  };
}

function renderLemonAlert(payload: { assetCode: string; assetName: string; daysSinceLast: number; lastMaintenanceDate?: string | Date }): { subject: string; html: string } {
  const { assetCode, assetName, daysSinceLast, lastMaintenanceDate } = payload;
  return {
    subject: `Warning: Asset ${assetCode} is experiencing rapid consecutive failures. Recommend Disposal instead of repair.`,
    html: renderAnomalyEnvelope("Maintenance Anomaly - Rapid Re-Failure", "#dc2626", `
      <p style="font-size:15px;color:#1e293b;margin:0 0 16px;"><strong>Lemon Hardware Warning</strong></p>
      <p style="font-size:14px;color:#334155;margin:0 0 12px;">Asset <strong>${assetName}</strong> (<code>${assetCode}</code>) has been sent for maintenance only <strong style="color:#dc2626;">${daysSinceLast} day(s)</strong> after its previous repair was completed. This pattern suggests a fundamentally defective unit.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        <tr style="background:#fef2f2;"><th style="${HEADER_CELL_STYLE}">Field</th><th style="${HEADER_CELL_STYLE}">Value</th></tr>
        <tr><td style="${CELL_STYLE}">Asset Code</td><td style="${CELL_STYLE}font-weight:600;">${assetCode}</td></tr>
        <tr><td style="${CELL_STYLE}">Asset Name</td><td style="${CELL_STYLE}">${assetName}</td></tr>
        <tr><td style="${CELL_STYLE}">Last Repair Completed</td><td style="${CELL_STYLE}">${formatInDate(lastMaintenanceDate)}</td></tr>
        <tr><td style="${CELL_STYLE}">Days Since Last Repair</td><td style="${CELL_STYLE}color:#dc2626;font-weight:700;">${daysSinceLast} day(s)</td></tr>
      </table>
      <p style="font-size:13px;color:#64748b;"><strong>Recommended action:</strong> Consider disposing of this asset instead of repairing it again. Log in to the <a href="${PORTAL_LINK}" style="color:#dc2626;">Asset Management Portal</a> to review the maintenance history and initiate disposal if appropriate.</p>`),
  };
}

interface GhostAsset { assetCode: string; assetName: string; assetKind?: string; lastUpdated?: string | Date; daysDormant: number }

function renderGhostAssetAlert(payload: { assets?: GhostAsset[] }): { subject: string; html: string } {
  const assets = payload.assets ?? [];
  const rows = assets.map((a) => {
    const kindColor = a.assetKind?.startsWith("Child") ? "#7c3aed" : a.assetKind?.startsWith("Bulk") ? "#d97706" : "#475569";
    return `<tr><td style="${CELL_STYLE}">${a.assetCode}</td><td style="${CELL_STYLE}">${a.assetName}</td><td style="${CELL_STYLE}font-size:12px;color:${kindColor};font-weight:600;">${a.assetKind || "Standalone"}</td><td style="${CELL_STYLE}">${formatInDate(a.lastUpdated)}</td><td style="${CELL_STYLE}color:#dc2626;font-weight:700;">${a.daysDormant} days</td></tr>`;
  }).join("");
  return {
    subject: `Audit Anomaly: ${assets.length} Asset(s) have been dormant for over 1 year. Physical verification recommended.`,
    html: renderAnomalyEnvelope("Audit Anomaly - Ghost Assets Detected", "#dc2626", `
      <p style="font-size:15px;color:#1e293b;margin:0 0 16px;"><strong>Ghost Asset Warning</strong></p>
      <p style="font-size:14px;color:#334155;margin:0 0 12px;">The following <strong style="color:#dc2626;">${assets.length} asset(s)</strong> have been in <em>Available</em> status with zero activity for <strong>over 1 year</strong>.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        <thead><tr style="background:#fef2f2;"><th style="${HEADER_CELL_STYLE}">Asset Code</th><th style="${HEADER_CELL_STYLE}">Asset Name</th><th style="${HEADER_CELL_STYLE}">Type</th><th style="${HEADER_CELL_STYLE}">Last Activity</th><th style="${HEADER_CELL_STYLE}">Dormant Days</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:13px;color:#64748b;"><strong>Recommended action:</strong> Conduct a physical verification. If confirmed missing, update or dispose in the <a href="${PORTAL_LINK}" style="color:#dc2626;">Asset Management Portal</a>.</p>`),
  };
}

function renderSoftwareDuplicateAlert(payload: { userName: string; softwareType: string; softwareName: string; duplicateCount: number }): { subject: string; html: string } {
  const { userName, softwareType, softwareName, duplicateCount } = payload;
  return {
    subject: `Duplicate Software Alert: ${userName} has ${duplicateCount} active "${softwareType}" license(s)`,
    html: renderAnomalyEnvelope("Allocation Anomaly - Duplicate Software License", "#d97706", `
      <p style="font-size:15px;color:#1e293b;margin:0 0 16px;"><strong>Duplicate Software Detected</strong></p>
      <p style="font-size:14px;color:#334155;margin:0 0 12px;">Employee <strong>${userName}</strong> now holds <strong style="color:#d97706;">${duplicateCount} active "${softwareType}" license(s)</strong>.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        <tr style="background:#fffbeb;"><th style="${HEADER_CELL_STYLE}">Field</th><th style="${HEADER_CELL_STYLE}">Value</th></tr>
        <tr><td style="${CELL_STYLE}">Employee</td><td style="${CELL_STYLE}font-weight:600;">${userName}</td></tr>
        <tr><td style="${CELL_STYLE}">Software Type</td><td style="${CELL_STYLE}">${softwareType}</td></tr>
        <tr><td style="${CELL_STYLE}">Latest License</td><td style="${CELL_STYLE}">${softwareName}</td></tr>
        <tr><td style="${CELL_STYLE}">Active Allocations</td><td style="${CELL_STYLE}color:#d97706;font-weight:700;">${duplicateCount}</td></tr>
      </table>
      <p style="font-size:13px;color:#64748b;"><strong>Recommended action:</strong> Verify whether the employee genuinely needs multiple licenses of this type. If not, revoke the duplicate in the <a href="${PORTAL_LINK}" style="color:#d97706;">Asset Management Portal</a>.</p>`),
  };
}

export type AnomalyType = "HOARDER" | "LEMON" | "GHOST_ASSET" | "SOFTWARE_DUPLICATE";

const anomalyRenderers: Record<AnomalyType, (payload: Record<string, unknown>) => { subject: string; html: string }> = {
  HOARDER: (p) => renderHoarderAlert(p as Parameters<typeof renderHoarderAlert>[0]),
  LEMON: (p) => renderLemonAlert(p as Parameters<typeof renderLemonAlert>[0]),
  GHOST_ASSET: (p) => renderGhostAssetAlert(p as Parameters<typeof renderGhostAssetAlert>[0]),
  SOFTWARE_DUPLICATE: (p) => renderSoftwareDuplicateAlert(p as Parameters<typeof renderSoftwareDuplicateAlert>[0]),
};

export function buildAnomalyEmail(type: string, payload: Record<string, unknown>): { subject: string; html: string } | null {
  const renderer = anomalyRenderers[type as AnomalyType];
  return renderer ? renderer(payload ?? {}) : null;
}

export async function sendAnomalyAlert(type: AnomalyType, payload: Record<string, unknown>, adminEmail: string): Promise<void> {
  const built = buildAnomalyEmail(type, payload);
  if (!built) { warnSkip(`Skipped anomaly alert — type '${type}' unsupported.`); return; }
  if (!adminEmail) { warnSkip(`Skipped anomaly alert '${type}' — recipient missing.`); return; }
  await sendEmail({ to: adminEmail, subject: built.subject, html: built.html });
}

// =============================================
// ANOMALY DIGEST
// =============================================

interface AnomalyFindings {
  hoarders?: Array<{ userName: string; assetType: string; activeCount: number }>;
  lemons?: Array<{ assetCode: string; assetName: string; lastMaintenanceDate?: string | Date; daysSinceLast: number }>;
  ghostAssets?: GhostAsset[];
}

export function buildAnomalyDigestPayload(findings: AnomalyFindings, adminEmail: string): EmailPayload | null {
  if (!adminEmail) { warnSkip("Skipped anomaly digest — recipient missing."); return null; }
  const { hoarders = [], lemons = [], ghostAssets = [] } = findings;
  const totalIssues = hoarders.length + lemons.length + ghostAssets.length;
  if (totalIssues === 0) return null;

  // Hoarder section
  const hoarderSection = hoarders.length > 0 ? `
    <div style="margin-bottom:32px;">
      <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:4px;margin-bottom:12px;">
        <h3 style="margin:0;font-size:15px;color:#991b1b;">Rule 1 - Allocation Anomaly (The Hoarder)</h3>
        <p style="margin:4px 0 0;font-size:13px;color:#64748b;">${hoarders.length} employee(s) currently possess 3 or more active assets of the same type.</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#fef2f2;"><th style="${HEADER_CELL_STYLE}">Employee</th><th style="${HEADER_CELL_STYLE}">Asset Type</th><th style="${HEADER_CELL_STYLE}">Active Count</th></tr></thead>
        <tbody>${hoarders.map((h) => `<tr><td style="${CELL_STYLE}">${h.userName}</td><td style="${CELL_STYLE}">${h.assetType}</td><td style="${CELL_STYLE}color:#dc2626;font-weight:700;">${h.activeCount}</td></tr>`).join("")}</tbody>
      </table>
    </div>` : "";

  const lemonSection = lemons.length > 0 ? `
    <div style="margin-bottom:32px;">
      <div style="background:#fff7ed;border-left:4px solid #f97316;padding:12px 16px;border-radius:4px;margin-bottom:12px;">
        <h3 style="margin:0;font-size:15px;color:#9a3412;">🔧 Rule 2 - Maintenance Anomaly (Lemon Hardware)</h3>
        <p style="margin:4px 0 0;font-size:13px;color:#64748b;">${lemons.length} asset(s) were sent for maintenance within 14 days of their last completed repair.</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#fff7ed;"><th style="${HEADER_CELL_STYLE}">Asset Code</th><th style="${HEADER_CELL_STYLE}">Asset Name</th><th style="${HEADER_CELL_STYLE}">Last Repair</th><th style="${HEADER_CELL_STYLE}">Days Since Repair</th></tr></thead>
        <tbody>${lemons.map((l) => `<tr><td style="${CELL_STYLE}font-weight:600;">${l.assetCode}</td><td style="${CELL_STYLE}">${l.assetName}</td><td style="${CELL_STYLE}">${formatInDate(l.lastMaintenanceDate)}</td><td style="${CELL_STYLE}color:#dc2626;font-weight:700;">${l.daysSinceLast} day(s)</td></tr>`).join("")}</tbody>
      </table>
    </div>` : "";

  const ghostSection = ghostAssets.length > 0 ? `
    <div style="margin-bottom:24px;">
      <div style="background:#f5f3ff;border-left:4px solid #7c3aed;padding:12px 16px;border-radius:4px;margin-bottom:12px;">
        <h3 style="margin:0;font-size:15px;color:#4c1d95;">👻 Rule 3 - Audit Anomaly (Ghost Assets)</h3>
        <p style="margin:4px 0 0;font-size:13px;color:#64748b;">${ghostAssets.length} asset(s) have been in Available status with zero activity for over 1 year.</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#f5f3ff;"><th style="${HEADER_CELL_STYLE}">Asset Code</th><th style="${HEADER_CELL_STYLE}">Asset Name</th><th style="${HEADER_CELL_STYLE}">Type</th><th style="${HEADER_CELL_STYLE}">Last Activity</th><th style="${HEADER_CELL_STYLE}">Dormant Days</th></tr></thead>
        <tbody>${ghostAssets.map((a) => {
          const kc = a.assetKind?.startsWith("Child") ? "#7c3aed" : a.assetKind?.startsWith("Bulk") ? "#d97706" : "#475569";
          return `<tr><td style="${CELL_STYLE}font-weight:600;">${a.assetCode}</td><td style="${CELL_STYLE}">${a.assetName}</td><td style="${CELL_STYLE}font-size:12px;color:${kc};font-weight:600;">${a.assetKind || "Standalone"}</td><td style="${CELL_STYLE}">${formatInDate(a.lastUpdated)}</td><td style="${CELL_STYLE}color:#dc2626;font-weight:700;">${a.daysDormant} days</td></tr>`;
        }).join("")}</tbody>
      </table>
    </div>` : "";

  const badges = [
    hoarders.length > 0 ? `<span style="display:inline-block;background:#dc2626;color:#fff;border-radius:4px;padding:2px 10px;font-size:12px;margin-right:6px;">Hoarder: ${hoarders.length}</span>` : "",
    lemons.length > 0 ? `<span style="display:inline-block;background:#f97316;color:#fff;border-radius:4px;padding:2px 10px;font-size:12px;margin-right:6px;">Lemon: ${lemons.length}</span>` : "",
    ghostAssets.length > 0 ? `<span style="display:inline-block;background:#7c3aed;color:#fff;border-radius:4px;padding:2px 10px;font-size:12px;">Ghost Assets: ${ghostAssets.length}</span>` : "",
  ].filter(Boolean).join("");

  const rulesTriggered = [hoarders.length > 0 && "Hoarder", lemons.length > 0 && "Lemon", ghostAssets.length > 0 && "Ghost Asset"].filter(Boolean).join(", ");

  return {
    to: adminEmail,
    subject: `Anomaly Digest: ${totalIssues} Issue(s) Detected — ${rulesTriggered}`,
    html: `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:750px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
      <div style="background:linear-gradient(135deg,#1e293b,#0f172a);padding:24px 32px;">
        <h2 style="color:#ffffff;margin:0;font-size:22px;">Asset Anomaly Digest</h2>
        <p style="color:#94a3b8;margin:6px 0 0;font-size:14px;">Automated anomaly detection found <strong style="color:#f87171;">${totalIssues} issue(s)</strong> requiring your attention.</p>
        <div style="margin-top:12px;">${badges}</div>
      </div>
      <div style="padding:28px 32px;">
        <p style="font-size:13px;color:#64748b;margin:0 0 24px;padding-bottom:16px;border-bottom:1px solid #e2e8f0;">The following anomalies were detected by the ${EMAIL_SYSTEM_NAME}'s automated rules engine.</p>
        ${hoarderSection}${lemonSection}${ghostSection}
      </div>
      <div style="background:#f8fafc;padding:14px 32px;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-size:12px;color:#94a3b8;">${EMAIL_SYSTEM_NAME} — Automated Anomaly Digest | Do not reply to this email.</p>
      </div>
    </div>`,
  };
}

// =============================================
// PASSWORD RESET & WELCOME EMAILS
// =============================================

export async function sendPasswordResetEmail(to: string, fullName: string, resetLink: string): Promise<void> {
  if (!to) { warnSkip("Skipped password reset email — recipient missing."); return; }
  await sendEmail({
    to,
    subject: "Password Reset Request",
    html: renderEmailTemplate({
      title: "Password Reset Request",
      headerGradient: "linear-gradient(135deg,#3b82f6,#1d4ed8)",
      subtitle: "Someone requested a password reset for your account.",
      subtitleColor: "#dbeafe",
      contentHtml: `
        <p style="font-size:15px;color:#1e293b;margin:0 0 12px;">Hi <strong>${fullName || "there"}</strong>,</p>
        <p style="font-size:14px;color:#334155;margin:0 0 20px;">We received a request to reset your <strong>${EMAIL_SYSTEM_NAME}</strong> password. This link is valid for <strong>1 hour</strong>.</p>
        <div style="text-align:center;margin:28px 0;"><a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">Reset My Password</a></div>
        <p style="font-size:13px;color:#64748b;margin:0 0 8px;">Or copy and paste this link:</p>
        <p style="font-size:12px;color:#3b82f6;word-break:break-all;">${resetLink}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
        <p style="font-size:12px;color:#94a3b8;margin:0;">If you did not request a password reset, you can safely ignore this email.</p>`,
      footerBgColor: "#f8fafc",
      footerText: `${EMAIL_SYSTEM_NAME} — Security Notification`,
    }),
  });
}

export async function sendWelcomeEmail(to: string, opts: { fullName: string; employeeId: string; password: string; role: string; resetLink?: string }): Promise<void> {
  const { fullName, employeeId, password, role, resetLink } = opts;
  if (!to) { warnSkip("Skipped welcome email — recipient missing."); return; }
  const roleColor = role === "Admin" ? "#dc2626" : role === "Manager" ? "#2563eb" : "#475569";
  await sendEmail({
    to,
    subject: `Your account is ready — ${employeeId}`,
    html: renderEmailTemplate({
      title: "Welcome to the Asset Management System",
      headerGradient: "linear-gradient(135deg,#1d4ed8,#3b82f6)",
      subtitle: "Your account has been created. Here are your login details.",
      subtitleColor: "#dbeafe",
      contentHtml: `
        <p style="font-size:15px;color:#1e293b;margin:0 0 16px;">Hi <strong>${fullName}</strong>, welcome aboard! 🎉</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          <tr style="background:#f1f5f9;"><th style="${HEADER_CELL_STYLE}width:140px;">Field</th><th style="${HEADER_CELL_STYLE}">Value</th></tr>
          <tr><td style="${CELL_STYLE}font-weight:600;color:#64748b;">Employee ID</td><td style="${CELL_STYLE}font-family:monospace;font-weight:700;">${employeeId}</td></tr>
          <tr><td style="${CELL_STYLE}font-weight:600;color:#64748b;">Password</td><td style="${CELL_STYLE}font-family:monospace;font-weight:700;">${password}</td></tr>
          <tr><td style="${CELL_STYLE}font-weight:600;color:#64748b;">Role</td><td style="${CELL_STYLE}font-weight:600;color:${roleColor};">${role}</td></tr>
        </table>
        <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
          <p style="margin:0;font-size:13px;color:#854d0e;"><strong>Action required:</strong> Please change your password immediately after your first login.</p>
        </div>
        ${resetLink ? `<div style="text-align:center;margin:24px 0;"><a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#3b82f6);color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:8px;font-size:14px;font-weight:600;">Set New Password</a></div><p style="font-size:12px;color:#3b82f6;word-break:break-all;margin:0 0 20px;">${resetLink}</p>` : ""}
        <p style="font-size:12px;color:#94a3b8;margin:0;">If you did not expect this email, please contact your system administrator.</p>`,
      footerBgColor: "#f8fafc",
      footerText: `${EMAIL_SYSTEM_NAME} — Account Notification`,
    }),
  });
}

// =============================================
// TROUBLESHOOT ALERT
// =============================================

interface TroubleshootOpts {
  assetCode?: string;
  assetName?: string;
  userName?: string;
  reason?: string;
  reportDate?: string | Date;
  isBulkOrder?: boolean;
  totalQuantity?: number;
  allocatedQuantity?: number;
}

export function buildTroubleshootEmail(opts: TroubleshootOpts): { subject: string; html: string } {
  const { assetCode = "", assetName = "Asset", userName = "Unknown", reason = "", reportDate = new Date(), isBulkOrder = false, totalQuantity = 0, allocatedQuantity = 0 } = opts;
  return {
    subject: `[Issue Reported] ${assetName} (${assetCode})`,
    html: renderEmailTemplate({
      title: "Asset Issue Reported",
      headerGradient: "linear-gradient(135deg,#eab308,#ca8a04)",
      subtitle: `An issue was reported by ${userName}.`,
      subtitleColor: "#fef08a",
      contentHtml: `
        <p style="font-size:15px;color:#1e293b;margin:0 0 16px;"><strong>New Troubleshooting Request</strong></p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          <tr style="background:#fefce8;"><th style="${HEADER_CELL_STYLE}width:140px;">Field</th><th style="${HEADER_CELL_STYLE}">Details</th></tr>
          <tr><td style="${CELL_STYLE}font-weight:600;color:#64748b;">Asset Name</td><td style="${CELL_STYLE}font-weight:600;color:#1e293b;">${assetName}</td></tr>
          <tr><td style="${CELL_STYLE}font-weight:600;color:#64748b;">Asset Code</td><td style="${CELL_STYLE}font-family:monospace;">${assetCode}</td></tr>
          ${isBulkOrder ? `<tr><td style="${CELL_STYLE}font-weight:600;color:#64748b;">Bulk Information</td><td style="${CELL_STYLE}">Total: ${totalQuantity} | Allocated: ${allocatedQuantity}</td></tr>` : ""}
          <tr><td style="${CELL_STYLE}font-weight:600;color:#64748b;">Reported Date</td><td style="${CELL_STYLE}">${formatInDate(reportDate)}</td></tr>
          <tr><td style="${CELL_STYLE}font-weight:600;color:#64748b;">Reported Issue</td><td style="${CELL_STYLE}color:#b45309;font-weight:600;white-space:pre-wrap;">${reason}</td></tr>
        </table>
        <p style="font-size:13px;color:#64748b;margin-bottom:20px;"><strong>Action required:</strong> Please log in to review this report and schedule maintenance if necessary.</p>
        <div style="text-align:center;margin:24px 0;"><a href="${PORTAL_LINK}/maintenance" style="display:inline-block;background:linear-gradient(135deg,#ca8a04,#a16207);color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:8px;font-size:14px;font-weight:600;">View Reported Issues</a></div>`,
      footerBgColor: "#fefce8",
      footerText: `${EMAIL_SYSTEM_NAME} — Troubleshooting Alert`,
    }),
  };
}

export async function sendTroubleshootAlert(opts: TroubleshootOpts, to: string, cc?: string | null): Promise<void> {
  if (!to) { warnSkip("Skipped troubleshoot alert — recipient missing."); return; }
  const { subject, html } = buildTroubleshootEmail(opts);
  await sendEmail({ to, cc, subject, html });
}

// =============================================
// VERIFY CONNECTION
// =============================================

export async function verifyEmailConnection(): Promise<boolean> {
  const t = await getTransporter();
  if (!t) { console.warn("Email service not configured. Missing EMAIL_USER or EMAIL_APP_PASSWORD."); return false; }
  try {
    await t.verify();
    console.log("✅ Email service connected successfully!");
    return true;
  } catch (err: unknown) {
    console.error("❌ Email service connection failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
