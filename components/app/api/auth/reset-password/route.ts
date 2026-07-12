import { NextRequest } from "next/server";
import { z } from "zod";
import { parseBody, isParseError, ok, serverError } from "@/lib/api-helpers";
import { resetPasswordWithToken } from "@/lib/services/userService";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const bodyResult = await parseBody(req, schema);
  if (isParseError(bodyResult)) return bodyResult;

  try {
    await resetPasswordWithToken(bodyResult.data.token, bodyResult.data.password);
    return ok({ status: "success", message: "Password reset successfully. Please sign in." });
  } catch (err) {
    if (err instanceof Error && (err.message.includes("Invalid") || err.message.includes("expired"))) {
      return NextResponse.json({ status: "error", message: err.message }, { status: 400 });
    }
    return serverError(err);
  }
}
