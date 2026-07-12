import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseBody, isParseError, ok, serverError } from "@/lib/api-helpers";
import { createPasswordResetToken } from "@/lib/services/userService";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const bodyResult = await parseBody(req, schema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    const result = await createPasswordResetToken(bodyResult.data.email);
    // Always return success to avoid email enumeration
    if (result) {
      // TODO: Send email with reset link using emailService
      // await sendPasswordResetEmail(result.user.email, result.token);
      console.log(`[ForgotPassword] Reset token for ${bodyResult.data.email}: ${result.token}`);
    }
    return ok({ status: "success", message: "If that email is registered, a reset link has been sent." });
  } catch (err) {
    return serverError(err);
  }
}
