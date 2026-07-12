import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { ok, created, serverError, badRequest, conflict } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

const signUpSchema = z.object({
  employeeId: z.string().min(3).max(20).regex(/^[a-zA-Z0-9]+$/, "Employee ID must be alphanumeric"),
  fullName: z.string().min(2).max(100),
  email: z.string().email().max(255),
  password: z.string().min(6).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = signUpSchema.safeParse(body);
    
    if (!result.success) {
      return badRequest(result.error.issues.map(e => e.message).join(", "));
    }

    const { employeeId, fullName, email, password } = result.data;

    // Check if user already exists (by employeeId or email)
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { id: employeeId },
          { email },
        ],
      },
    });

    if (existingUser) {
      return conflict("User with this Employee ID or Email already exists.");
    }

    // Hash the password
    const hashedPassword = await hash(password, 12);

    // Create the user
    const newUser = await prisma.user.create({
      data: {
        id: employeeId,
        fullName,
        email,
        password: hashedPassword,
        role: "Viewer", // Default role Viewer
        isBlocked: false,
        isDeleted: false,
      },
    });

    // Write Audit Log
    await writeAuditLog({
      tableName: "users",
      recordId: newUser.id,
      action: "CREATION",
      changedBy: newUser.id,
      newValues: {
        id: newUser.id,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role,
      },
    });

    return created({
      employeeId: newUser.id,
      fullName: newUser.fullName,
      email: newUser.email,
      role: newUser.role,
    });
  } catch (err) {
    return serverError(err);
  }
}
