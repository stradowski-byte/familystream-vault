/**
 * 100% Client-Side ISO/IEC 18004 QR Code Matrix Generator (Byte mode, Error Correction Level L).
 * Zero external network calls — ensures Wi-Fi passwords and credentials never leave the device RAM
 * and strictly complies with Content-Security-Policy (CSP).
 */

interface VersionSpec {
  version: number;
  totalDataCodewords: number;
  ecCodewordsPerBlock: number;
  numBlocksGroup1: number;
  dataCodewordsGroup1: number;
  numBlocksGroup2: number;
  dataCodewordsGroup2: number;
  alignmentCenters: number[];
}

const VERSION_SPECS_L: VersionSpec[] = [
  { version: 1, totalDataCodewords: 19, ecCodewordsPerBlock: 7, numBlocksGroup1: 1, dataCodewordsGroup1: 19, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [] },
  { version: 2, totalDataCodewords: 34, ecCodewordsPerBlock: 10, numBlocksGroup1: 1, dataCodewordsGroup1: 34, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 18] },
  { version: 3, totalDataCodewords: 55, ecCodewordsPerBlock: 15, numBlocksGroup1: 1, dataCodewordsGroup1: 55, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 22] },
  { version: 4, totalDataCodewords: 80, ecCodewordsPerBlock: 20, numBlocksGroup1: 1, dataCodewordsGroup1: 80, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 26] },
  { version: 5, totalDataCodewords: 108, ecCodewordsPerBlock: 26, numBlocksGroup1: 1, dataCodewordsGroup1: 108, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 30] },
  { version: 6, totalDataCodewords: 136, ecCodewordsPerBlock: 18, numBlocksGroup1: 2, dataCodewordsGroup1: 68, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 34] },
  { version: 7, totalDataCodewords: 156, ecCodewordsPerBlock: 20, numBlocksGroup1: 2, dataCodewordsGroup1: 78, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 22, 38] },
  { version: 8, totalDataCodewords: 194, ecCodewordsPerBlock: 24, numBlocksGroup1: 2, dataCodewordsGroup1: 97, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 24, 42] },
  { version: 9, totalDataCodewords: 232, ecCodewordsPerBlock: 30, numBlocksGroup1: 2, dataCodewordsGroup1: 116, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentCenters: [6, 26, 46] },
  { version: 10, totalDataCodewords: 274, ecCodewordsPerBlock: 18, numBlocksGroup1: 2, dataCodewordsGroup1: 68, numBlocksGroup2: 2, dataCodewordsGroup2: 69, alignmentCenters: [6, 28, 50] },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function getReedSolomonGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function computeReedSolomonRemainder(
  data: Uint8Array,
  degree: number
): Uint8Array {
  const gen = getReedSolomonGeneratorPoly(degree);
  const result = new Uint8Array(degree);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ result[0];
    result.copyWithin(0, 1);
    result[degree - 1] = 0;
    for (let j = 0; j < degree; j++) {
      result[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return result;
}

function getBchFormatInfo(ecLevelBits: number, maskPattern: number): number {
  const data = (ecLevelBits << 3) | maskPattern;
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >> i) & 1) {
      rem ^= 0x537 << (i - 10);
    }
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function getBchVersionInfo(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) {
    if ((rem >> i) & 1) {
      rem ^= 0x1f25 << (i - 12);
    }
  }
  return (version << 12) | rem;
}

export function generateQrCodeMatrix(text: string): boolean[][] {
  const utf8Bytes = new TextEncoder().encode(text);
  const chosenSpec =
    VERSION_SPECS_L.find((spec) => {
      const headerBits = spec.version <= 9 ? 12 : 20;
      const availableBytes = Math.floor(
        (spec.totalDataCodewords * 8 - headerBits) / 8
      );
      return utf8Bytes.length <= availableBytes;
    }) || VERSION_SPECS_L[VERSION_SPECS_L.length - 1];

  const maxLen =
    chosenSpec.totalDataCodewords - (chosenSpec.version <= 9 ? 2 : 3);
  const payload =
    utf8Bytes.length > maxLen ? utf8Bytes.slice(0, maxLen) : utf8Bytes;

  // Build bit stream: 0100 (Byte mode) + length (8 or 16 bits) + payload + terminator + padding
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  pushBits(0b0100, 4);
  pushBits(payload.length, chosenSpec.version <= 9 ? 8 : 16);
  for (let i = 0; i < payload.length; i++) {
    pushBits(payload[i], 8);
  }

  const maxDataBits = chosenSpec.totalDataCodewords * 8;
  const terminatorLen = Math.min(4, maxDataBits - bits.length);
  pushBits(0, terminatorLen);

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const dataCodewords = new Uint8Array(chosenSpec.totalDataCodewords);
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      byte = (byte << 1) | bits[i * 8 + b];
    }
    dataCodewords[i] = byte;
  }

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  for (let i = bits.length / 8; i < chosenSpec.totalDataCodewords; i++) {
    dataCodewords[i] = padBytes[padIdx % 2];
    padIdx++;
  }

  // Split into blocks and compute Reed-Solomon EC codewords
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;

  for (let i = 0; i < chosenSpec.numBlocksGroup1; i++) {
    const block = dataCodewords.slice(
      offset,
      offset + chosenSpec.dataCodewordsGroup1
    );
    offset += chosenSpec.dataCodewordsGroup1;
    dataBlocks.push(block);
    ecBlocks.push(
      computeReedSolomonRemainder(block, chosenSpec.ecCodewordsPerBlock)
    );
  }

  for (let i = 0; i < chosenSpec.numBlocksGroup2; i++) {
    const block = dataCodewords.slice(
      offset,
      offset + chosenSpec.dataCodewordsGroup2
    );
    offset += chosenSpec.dataCodewordsGroup2;
    dataBlocks.push(block);
    ecBlocks.push(
      computeReedSolomonRemainder(block, chosenSpec.ecCodewordsPerBlock)
    );
  }

  // Interleave data and EC codewords
  const finalCodewords: number[] = [];
  const maxBlockDataLen = Math.max(
    chosenSpec.dataCodewordsGroup1,
    chosenSpec.dataCodewordsGroup2
  );
  for (let i = 0; i < maxBlockDataLen; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) {
        finalCodewords.push(block[i]);
      }
    }
  }
  for (let i = 0; i < chosenSpec.ecCodewordsPerBlock; i++) {
    for (const ec of ecBlocks) {
      finalCodewords.push(ec[i]);
    }
  }

  // Matrix construction
  const size = chosenSpec.version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );

  const setFunctionModule = (r: number, c: number, isDark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = isDark;
      isFunction[r][c] = true;
    }
  };

  // Finder patterns + separators
  const drawFinderPattern = (topR: number, leftC: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = topR + dr;
        const c = leftC + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter =
          dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (dr === 0 || dr === 6 || dc === 0 || dc === 6);
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunctionModule(r, c, inOuter || inInner);
      }
    }
  };

  drawFinderPattern(0, 0);
  drawFinderPattern(0, size - 7);
  drawFinderPattern(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const centers = chosenSpec.alignmentCenters;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0)
      ) {
        continue;
      }
      const cr = centers[i];
      const cc = centers[j];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isDark =
            Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunctionModule(cr + dr, cc + dc, isDark);
        }
      }
    }
  }

  // Dark module & reserve format info areas
  setFunctionModule(4 * chosenSpec.version + 9, 8, true);
  for (let i = 0; i <= 8; i++) {
    if (!isFunction[8][i]) setFunctionModule(8, i, false);
    if (!isFunction[i][8]) setFunctionModule(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunction[8][size - 1 - i]) setFunctionModule(8, size - 1 - i, false);
    if (!isFunction[size - 1 - i][8]) setFunctionModule(size - 1 - i, 8, false);
  }

  // Version info for version >= 7
  if (chosenSpec.version >= 7) {
    const vBits = getBchVersionInfo(chosenSpec.version);
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunctionModule(a, b, bit);
      setFunctionModule(b, a, bit);
    }
  }

  // Place data bits in upward/downward 2-column zig-zag
  let bitIdx = 0;
  const totalBits = finalCodewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!isFunction[r][c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            const byte = finalCodewords[bitIdx >> 3];
            dark = ((byte >> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
          // Apply mask pattern 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) {
            dark = !dark;
          }
          modules[r][c] = dark;
        }
      }
    }
  }

  // Write format info for EC level L (01) and Mask 0 (000)
  const formatBits = getBchFormatInfo(0b01, 0);
  for (let i = 0; i <= 5; i++) setFunctionModule(8, i, ((formatBits >> i) & 1) === 1);
  setFunctionModule(8, 7, ((formatBits >> 6) & 1) === 1);
  setFunctionModule(8, 8, ((formatBits >> 7) & 1) === 1);
  setFunctionModule(7, 8, ((formatBits >> 8) & 1) === 1);
  for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, ((formatBits >> i) & 1) === 1);

  for (let i = 0; i < 8; i++) {
    setFunctionModule(size - 1 - i, 8, ((formatBits >> i) & 1) === 1);
  }
  for (let i = 8; i < 15; i++) {
    setFunctionModule(8, size - 15 + i, ((formatBits >> i) & 1) === 1);
  }

  return modules;
}

function escapeWifiField(val: string): string {
  return val.replace(/([\\;,"':])/g, '\\$1');
}

export function buildWifiQrPayload(ssid: string, password: string): string {
  const cleanSsid = escapeWifiField(ssid.trim() || 'Domowe_WiFi');
  const cleanPass = escapeWifiField(password);
  return `WIFI:T:WPA;S:${cleanSsid};P:${cleanPass};;`;
}
