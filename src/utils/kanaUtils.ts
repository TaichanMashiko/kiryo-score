/**
 * Utility functions for Japanese character conversion and sanitization.
 * Used to ensure students' inputs (names, class numbers, attendance numbers)
 * perfectly match the CSV files without errors.
 */

// Mapping of Full-width Katakana to Half-width Katakana (including voiced marks)
const FULL_TO_HALF_KATA: { [key: string]: string } = {
  'ガ': 'ｶﾞ', 'ギ': 'ｷﾞ', 'グ': 'ｸﾞ', 'ゲ': 'ｹﾞ', 'ゴ': 'ｺﾞ',
  'ザ': 'ｻﾞ', 'ジ': 'ｼﾞ', 'ズ': 'ｽﾞ', 'ゼ': 'ｾﾞ', 'ゾ': 'ｿﾞ',
  'ダ': 'ﾀﾞ', 'ヂ': 'ﾁﾞ', 'ヅ': 'ﾂﾞ', 'デ': 'ﾃﾞ', 'ド': 'ﾄﾞ',
  'バ': 'ﾊﾞ', 'ビ': 'ﾋﾞ', 'ブ': 'ﾌﾞ', 'ベ': 'ﾍﾞ', 'ボ': 'ﾎﾞ',
  'パ': 'ﾊﾟ', 'ピ': 'ﾋﾟ', 'プ': 'ﾌﾟ', 'ペ': 'ﾍﾟ', 'ポ': 'ﾎﾟ',
  'ヴ': 'ｳﾞ', 'ヷ': 'ﾜﾞ', 'ヺ': 'ｦﾞ',
  'ア': 'ｱ', 'イ': 'ｲ', 'ウ': 'ｳ', 'エ': 'ｴ', 'オ': 'ｵ',
  'カ': 'ｶ', 'キ': 'ｷ', 'ク': 'ｸ', 'ケ': 'ｹ', 'コ': 'ｺ',
  'サ': 'ｻ', 'シ': 'ｼ', 'ス': 'ｽ', 'セ': 'ｾ', 'ソ': 'ｿ',
  'タ': 'ﾀ', 'チ': 'ﾁ', 'ツ': 'ﾂ', 'テ': 'ﾃ', 'ト': 'ﾄ',
  'ナ': 'ﾅ', 'ニ': 'ﾆ', 'ヌ': 'ﾇ', 'ネ': 'ﾈ', 'ノ': 'ﾉ',
  'ハ': 'ﾊ', 'ヒ': 'ﾋ', 'フ': 'ﾌ', 'ヘ': 'ﾍ', 'ホ': 'ﾎ',
  'マ': 'ﾏ', 'ミ': 'ﾐ', 'ム': 'ﾑ', 'メ': 'ﾒ', 'モ': 'ﾓ',
  'ヤ': 'ﾔ', 'ユ': 'ﾕ', 'ヨ': 'ﾖ',
  'ラ': 'ﾗ', 'リ': 'ﾘ', 'ル': 'ﾙ', 'レ': 'ﾚ', 'ロ': 'ﾛ',
  'ワ': 'ﾜ', 'ヲ': 'ｦ', 'ン': 'ﾝ',
  'ァ': 'ｧ', 'ィ': 'ｨ', 'ゥ': 'ｩ', 'ェ': 'ｪ', 'ォ': 'ｫ',
  'ャ': 'ｬ', 'ュ': 'ｭ', 'ョ': 'ｮ',
  'ッ': 'ｯ', 'ー': 'ｰ', '・': '･', '。': '｡', '、': '､',
  '「': '｢', '」': '｣'
};

/**
 * Converts any Hiragana characters in a string to Full-width Katakana.
 */
export function hiraganaToKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, (match) => {
    const chr = match.charCodeAt(0) + 0x60;
    return String.fromCharCode(chr);
  });
}

/**
 * Normalizes user input Japanese name to Half-width Katakana with a single half-width space.
 * Handles Hiragana -> Katakana conversion and removes duplicate spaces.
 */
export function normalizeToHalfWidthKana(nameStr: string): string {
  if (!nameStr) return '';

  // 1. Convert all full-width spaces to half-width spaces
  let result = nameStr.replace(/　/g, ' ');

  // 2. Convert Hiragana to Full-width Katakana
  result = hiraganaToKatakana(result);

  // 3. Convert Full-width Katakana to Half-width Katakana
  // We use key replacement with multiple-character keys (voiced letters like ガ, ギ) first
  const keys = Object.keys(FULL_TO_HALF_KATA).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    result = result.split(key).join(FULL_TO_HALF_KATA[key]);
  }

  // 4. Force any remaining full-width alphabet/numbers to half-width if present
  result = result.replace(/[！-～]/g, (match) => {
    return String.fromCharCode(match.charCodeAt(0) - 0xFEE0);
  });

  // 5. Trim starting/ending spaces and collapse multiple spaces inside to a single half-width space
  result = result.trim().replace(/\s+/g, ' ');

  return result;
}

/**
 * Normalizes input numbers to zeros-padded Strings of specified length.
 * Useful for normalizing class (2-digits) and attendance (4-digits).
 */
export function padLeftWithZeros(numStr: string, size: number): string {
  // Extract digits only
  const digits = numStr.replace(/\D/g, '');
  if (!digits) return '';
  return digits.padStart(size, '0');
}
