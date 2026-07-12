import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "connected",
      uptime: process.uptime(),
    });
  } catch {
    return NextResponse.json(
      { status: "error", database: "disconnected" },
      { status: 503 }
    );
  }
}

export const HEAD = GET;
