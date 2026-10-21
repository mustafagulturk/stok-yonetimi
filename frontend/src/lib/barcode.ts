/**
 * Etiket yazdırmak için barkodu çubuk genişlikleri dizisine çevirir.
 * 13 haneli ve kontrol hanesi doğru kodlar EAN-13, diğerleri Code 128 (B) olarak çizilir.
 */

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = L.map((c) => [...c].reverse().map((b) => (b === "0" ? "1" : "0")).join(""));
const R = L.map((c) => [...c].map((b) => (b === "0" ? "1" : "0")).join(""));
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function isEan13(code: string) {
  if (!/^\d{13}$/.test(code)) return false;
  const d = [...code].map(Number);
  const sum = d.slice(0, 12).reduce((s, n, i) => s + n * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === d[12];
}

function ean13Bits(code: string) {
  const d = [...code].map(Number);
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (PARITY[d[0]][i - 1] === "L" ? L : G)[d[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return bits + "101";
}

// Code 128 desenleri (değer 0..106), her biri çubuk/boşluk genişlikleri.
const C128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232",
  "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122",
  "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311",
  "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113",
  "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422",
  "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111",
  "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121",
  "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];

function code128Bits(text: string) {
  const values = [104, ...[...text].map((ch) => {
    const v = ch.charCodeAt(0) - 32;
    return v >= 0 && v < 95 ? v : 0;
  })];
  const check = values.reduce((s, v, i) => s + v * (i || 1), 0) % 103;
  let bits = "";
  for (const v of [...values, check, 106]) {
    [...C128[v]].forEach((w, i) => (bits += (i % 2 ? "0" : "1").repeat(Number(w))));
  }
  return bits;
}

export interface BarcodeShape { bits: string; type: "EAN-13" | "Code 128" }

export function encode(code: string): BarcodeShape {
  return isEan13(code) ? { bits: ean13Bits(code), type: "EAN-13" } : { bits: code128Bits(code), type: "Code 128" };
}

/** 1'lerin ardışık gruplarını [x, genişlik] dikdörtgenlerine çevirir. */
export function bars(bits: string) {
  const out: [number, number][] = [];
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== "1") continue;
    let j = i;
    while (bits[j + 1] === "1") j++;
    out.push([i, j - i + 1]);
    i = j;
  }
  return out;
}
