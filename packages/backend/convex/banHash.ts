// Einweg-Hashing für gesperrte E-Mail-Adressen (DSGVO-Pseudonymisierung).
//
// Nach Ablauf der 6-Monats-Aufbewahrungsfrist wird die Klartext-E-Mail einer Sperre
// durch diesen Hash ersetzt (siehe retention.ts). Der Bann bleibt damit wirksam
// (bei Registrierung/Login wird die eingegebene E-Mail gehasht und abgeglichen),
// aber das Personendatum "E-Mail" ist nicht mehr im Klartext gespeichert.
//
// Der Hash wird mit dem Prefix "sha256:" im bestehenden `email`-Feld abgelegt –
// dadurch ist KEINE Schema-Migration nötig und der `by_email`-Index funktioniert
// weiterhin für Klartext- wie für gehashte Einträge.
//
// Optional kann über die Convex-Umgebungsvariable BAN_HASH_PEPPER ein geheimer
// "Pepper" gesetzt werden (empfohlen). WICHTIG: Wird der Pepper nachträglich
// geändert, matchen bereits gehashte Alt-Sperren nicht mehr.

export const BAN_HASH_PREFIX = "sha256:";

export function isHashedBanEmail(value: string): boolean {
  return value.startsWith(BAN_HASH_PREFIX);
}

/**
 * Normalisiert eine E-Mail (lowercase + trim) und gibt ihren gepepperten
 * SHA-256-Hash mit "sha256:"-Prefix zurück. Deterministisch.
 */
export async function hashBanEmail(rawEmail: string): Promise<string> {
  const email = rawEmail.toLowerCase().trim();
  const pepper = process.env.BAN_HASH_PEPPER ?? "";
  const bytes = new TextEncoder().encode(`${pepper}:${email}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${BAN_HASH_PREFIX}${hex}`;
}
