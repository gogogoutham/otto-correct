/** Splits German text into word tokens (letters, including umlauts and ß; hyphenated words kept). */
export function tokenize(text: string): string[] {
	return text.match(/[\p{L}]+(?:-[\p{L}]+)*/gu) ?? [];
}
