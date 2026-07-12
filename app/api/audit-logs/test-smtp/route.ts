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
import { sendEmail, buildEmailHtml } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth(PERMISSIONS.AUDIT_VIEW);
  if (isAuthError(authResult)) return authResult;
  const { session } = authResult;

  try {
    const body = await req.json();
    const { host, port, user, pass, to } = body as {
      host?: string;
      port?: string;
      user?: string;
      pass?: string;
      to?: string;
    };

    if (!host || !port) {
      return badRequest("host and port are required.");
    }

    const recipient = to || user || session.user.employeeId;
    if (!recipient || !recipient.includes("@")) {
      return badRequest("A valid recipient email address (to or user) is required.");
    }

    await sendEmail({
      to: recipient,
      subject: "[AssetFlow] SMTP Test – Connection Successful",
      html: buildEmailHtml({
        title: "SMTP Test Email",
        body: `<p>This is a test email sent from <strong>AssetFlow</strong> to verify your SMTP configuration.</p>
               <p>If you received this email, your SMTP settings are working correctly.</p>`,
      }),
      smtp: {
        host,
        port: parseInt(port, 10),
        user: user || undefined,
        pass: pass || undefined,
      },
    });

    return ok({ message: "Test email sent successfully. Please check your inbox." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return serverError(new Error(`SMTP test failed: ${message}`));
  }
}
