/**
 * POST /api/audit-logs/test-smtp
 * Tests SMTP connectivity with the provided credentials (Admin only).
 */
import { NextRequest } from "next/server";
import {
  requireAuth,
  isAuthError,
  ok,
  badRequest,
  serverError,
} from "@/lib/api-helpers";
import { PERMISSIONS } from "@/lib/permissions";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.AUDIT_VIEW);
  if (isAuthError(authResult)) return authResult;

  try {
    const body = await req.json();
    const { host, port, user, pass } = body as {
      host?: string;
      port?: string;
      user?: string;
      pass?: string;
    };

    if (!host || !port) {
      return badRequest("host and port are required.");
    }

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port, 10),
      secure: parseInt(port, 10) === 465,
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });

    await transporter.verify();

    return ok({ message: "SMTP connection successful." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return serverError(new Error(`SMTP test failed: ${message}`));
  }
}
