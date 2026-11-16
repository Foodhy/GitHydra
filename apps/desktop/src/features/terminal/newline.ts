export function withCarriageReturn(
  data: string,
  precededByCr: boolean,
): { text: string; precededByCr: boolean } {
  let text = "";
  let carriage = precededByCr;
  for (const char of data) {
    if (char === "\n" && !carriage) {
      text += "\r";
    }
    text += char;
    carriage = char === "\r";
  }
  return { text, precededByCr: carriage };
}
