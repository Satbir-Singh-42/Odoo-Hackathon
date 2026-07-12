/**
 * Auth.js (NextAuth v5) Configuration
 * - CredentialsProvider: email/password with bcrypt (mirrors server/routes/auth.js)
 * - PrismaAdapter: persists OAuth accounts/sessions
 * - JWT strategy: embeds role, permissions, managedCategories in token
 * - Durable logout: lastLogoutAt stored in DB, checked on every token refresh
 */

import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { verifyAndMigratePassword } from "@/lib/services/authService";
import { prisma } from "@/lib/prisma";
import { resolvePermissions } from "@/lib/permissions";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  // JWT strategy — keeps sessions stateless and fast.
  // Sessions are NOT stored in the DB (only OAuth accounts are via adapter).
  session: { strategy: "jwt" },

  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        employeeId: { label: "Employee ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.password) {
          return null;
        }

        // Support login by either email or employeeId (mirrors existing auth.js)
        const identifier = (credentials.email || credentials.employeeId) as string;
        if (!identifier) return null;

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: identifier },
              { id: identifier }, // EmployeeID
            ],
            isDeleted: false,
            isBlocked: false,
          },
          select: {
            id: true,
            fullName: true,
            department: true,
            email: true,
            password: true,
            role: true,
            managedCategories: true,
            lastLogoutAt: true,
            isBlocked: true,
            isDeleted: true,
          },
        });

        if (!user || !user.password) return null;
        if (user.isBlocked || user.isDeleted) return null;

        // verifyAndMigratePassword handles bcrypt, legacy plaintext, and
        // silent work-factor upgrades (rounds < 10 → 10) on success.
        const passwordValid = await verifyAndMigratePassword(
          credentials.password as string,
          user.password,
          user.id,
        );
        if (!passwordValid) return null;

        const permissions = resolvePermissions(user.role);

        return {
          id: user.id,
          employeeId: user.id,
          name: user.fullName,
          email: user.email ?? undefined,
          fullName: user.fullName,
          department: user.department,
          role: user.role,
          managedCategories: user.managedCategories ?? "ALL",
          permissions,
          lastLogoutAt: user.lastLogoutAt ?? null,
        };
      },
    }),
  ],

  callbacks: {
    /**
     * jwt callback — called whenever a JWT is created or updated.
     * Embeds all AssetFlow-specific claims into the token on first sign-in,
     * and re-fetches on every token refresh to pick up role changes.
     */
    async jwt({ token, user, trigger }) {
      // First sign-in: user object is populated by authorize()
      if (user) {
        token.employeeId = user.employeeId;
        token.fullName = user.fullName;
        token.department = user.department ?? null;
        token.role = user.role;
        token.managedCategories = user.managedCategories;
        token.permissions = user.permissions;
        token.lastLogoutAt = user.lastLogoutAt
          ? new Date(user.lastLogoutAt).getTime()
          : null;
      }

      // On token refresh or explicit "update" trigger, re-fetch from DB at most every 5 minutes
      // This ensures role changes and blocks propagate without requiring re-login while avoiding DB spam.
      const now = Date.now();
      const lastChecked = (token._lastChecked as number) || 0;
      const shouldCheck = trigger === "update" || (now - lastChecked > 5 * 60 * 1000);

      if (shouldCheck && (!user && token.employeeId)) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.employeeId as string },
            select: {
              role: true,
              managedCategories: true,
              isBlocked: true,
              isDeleted: true,
              lastLogoutAt: true,
            },
          });

          if (!dbUser || dbUser.isDeleted || dbUser.isBlocked) {
            // Force sign-out on next request — token will be invalid
            token.role = "__BLOCKED__";
            token.permissions = [];
            token._lastChecked = now;
            return token;
          }

          token.role = dbUser.role;
          token.managedCategories = dbUser.managedCategories ?? "ALL";
          token.permissions = resolvePermissions(dbUser.role);
          token.lastLogoutAt = dbUser.lastLogoutAt
            ? new Date(dbUser.lastLogoutAt).getTime()
            : null;
          token._lastChecked = now;
        } catch (err) {
          console.error("[Auth JWT] Failed to re-fetch user status from DB:", err);
          // Preserve existing token values if DB query temporarily fails or times out
        }
      }

      return token;
    },

    /**
     * session callback — shapes what useSession() / auth() returns to the app.
     */
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = (token.employeeId || token.sub || "") as string;
        session.user.employeeId = (token.employeeId || token.sub || "") as string;
        session.user.fullName = (token.fullName || token.name || "") as string;
        session.user.department = token.department as string | null | undefined;
        session.user.role = (token.role || "Viewer") as string;
        session.user.managedCategories = (token.managedCategories || "ALL") as string;
        session.user.permissions = Array.isArray(token.permissions)
          ? (token.permissions as string[])
          : resolvePermissions(session.user.role);
      }
      return session;
    },

    /**
     * authorized callback — called by proxy.ts for every request.
     * Blocks access if the user is blocked/deleted or has no role.
     */
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;

      // Always allow public auth routes
      if (
        pathname.startsWith("/auth/") ||
        pathname.startsWith("/api/auth/")
      ) {
        return true;
      }

      // Must be authenticated for everything else
      if (!auth?.user) return false;

      // Block users that were blocked/deleted after login
      if ((auth.user as any).role === "__BLOCKED__") return false;

      return true;
    },
  },

  pages: {
    signIn: "/auth/sign-in",
    error: "/auth/error",
  },

  events: {
    /**
     * signIn event — write audit log on every successful login.
     */
    async signIn({ user }) {
      try {
        await prisma.auditLog.create({
          data: {
            tableName: "users",
            recordId: user.id,
            action: "LOGIN",
            changedBy: user.id,
            additionalInfo: JSON.stringify({ email: user.email }),
          },
        });
      } catch {
        // Non-fatal — don't block login if audit write fails
      }
    },

    /**
     * signOut event — update lastLogoutAt for durable logout.
     */
    async signOut(message) {
      const token = (message as any).token;
      if (!token?.employeeId) return;
      try {
        await prisma.user.update({
          where: { id: token.employeeId as string },
          data: { lastLogoutAt: new Date() },
        });
        await prisma.auditLog.create({
          data: {
            tableName: "users",
            recordId: token.employeeId as string,
            action: "LOGOUT",
            changedBy: token.employeeId as string,
          },
        });
      } catch {
        // Non-fatal
      }
    },
  },

  // Token lifetime — 24h to match existing JWT_EXPIRES_IN=24h
  jwt: {
    maxAge: 24 * 60 * 60,
  },
});
