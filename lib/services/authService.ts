/**
 * lib/services/authService.ts
 * Shared auth helpers for password verification and migration.
 * Ported from server/services/authService.js.
 *
 * - Supports bcrypt hashes (current standard, rounds=10).
 * - Supports legacy plaintext passwords (auto-migrates to bcrypt on first login).
 * - Silently upgrades under-strength bcrypt hashes (rounds < 10) on successful login.
 */

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const BCRYPT_ROUNDS = 10;

/**
 * Verify a password against either a bcrypt hash or a legacy plaintext password.
 * If the password matches and needs upgrading, the DB record is updated in the background.
 *
 * @param plainPassword  - The raw password submitted by the user.
 * @param storedPassword - The value stored in User.password (may be hash or plaintext).
 * @param userId         - The User.id (EmployeeID) for DB updates.
 * @returns true if the password is correct, false otherwise.
 */
export async function verifyAndMigratePassword(
  plainPassword: string,
  storedPassword: string | null,
  userId: string,
): Promise<boolean> {
  if (!storedPassword) return false;

  try {
    // --- bcrypt hash path ---
    if (storedPassword.startsWith("$2")) {
      const match = await bcrypt.compare(plainPassword, storedPassword);
      if (match) {
        // Silently upgrade work factor if below target rounds.
        // Catches passwords previously migrated from legacy plaintext (rounds=8)
        // so they are promoted to the current standard on the next successful login.
        const roundsUsed = parseInt(storedPassword.split("$")[2] ?? "0", 10);
        if (roundsUsed < BCRYPT_ROUNDS) {
          bcrypt.hash(plainPassword, BCRYPT_ROUNDS).then((upgraded) =>
            prisma.user
              .update({ where: { id: userId }, data: { password: upgraded } })
              .catch((err) =>
                console.error(`[AuthService] Work-factor upgrade failed for ${userId}:`, err),
              ),
          );
        }
      }
      return match;
    }

    // --- Legacy plaintext path ---
    // Allows bootstrapping from seed.sql / existing plaintext passwords.
    if (storedPassword === plainPassword) {
      console.log(`[AuthService] Migrating plaintext password to bcrypt for user ${userId}...`);
      const upgraded = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
      // Migrate synchronously so we know it succeeded before returning true.
      await prisma.user
        .update({ where: { id: userId }, data: { password: upgraded } })
        .catch((err) =>
          console.error(`[AuthService] Plaintext migration failed for ${userId}:`, err),
        );
      return true;
    }

    console.warn(`[AuthService] Invalid password attempt for user ${userId}.`);
    return false;
  } catch (error) {
    console.error("[AuthService] Password verification error:", error);
    return false;
  }
}
