// Game codes (R34): 6 characters from an alphabet without look-alikes
// (no I, L, O, 0 or 1).
import { randomInt } from "node:crypto";

export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
export const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export function generateCode(isTaken: (code: string) => boolean): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!isTaken(code)) return code;
  }
}
