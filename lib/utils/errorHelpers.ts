/**
 * Extracts a human-readable message from an unknown error.
 * Use in catch blocks: `catch (err: unknown) { getErrorMessage(err) }`
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  )
    return (err as { message: string }).message;
  return "Unknown error";
}
