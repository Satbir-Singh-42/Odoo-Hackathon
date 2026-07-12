/**
 * NextAuth Route Handler
 * Exports GET and POST handlers for /api/auth/*
 * All Auth.js endpoints (sign-in, sign-out, session, csrf, etc.) are handled here.
 */

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
export const runtime = "nodejs";
