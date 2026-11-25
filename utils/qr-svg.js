/**
 * Pure-JavaScript ISO/IEC 18004 QR Code (Model 2, Byte Mode, ECC Level M) SVG Generator
 * Zero external dependencies — works offline, in sandboxes, and on Vercel serverless.
 * Supports Versions 1–10 (up to 213 UTF-8 bytes), ideal for verification URLs.
 */

// GF(256) with primitive polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D)
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGalois() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(ecCount) {
  let poly = [1];
  for (let i = 0; i < ecCount; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsComputeEcc(data, ecCount) {
  const gen = rsGeneratorPoly(ecCount);
  const rem = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecCount - 1] = 0;
    if (factor !== 0) {
      for (let j = 0; j < ecCount; j++) {
        rem[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return rem;
}

// Version specs for Error Correction Level M (ISO/IEC 18004 Table 9)
// [version, totalCodewords, ecPerBlock, blocksGroup1, dataPerBlockG1, blocksGroup2, dataPerBlockG2, alignmentCenters]
const VERSION_M = [
  null,
  { v: 1, total: 26, ec: 10, g1b: 1, g1d: 16, g2b: 0, g2d: 0, align: [] },
  { v: 2, total: 44, ec: 16, g1b: 1, g1d: 28, g2b: 0, g2d: 0, align: [6, 18] },
  { v: 3, total: 70, ec: 26, g1b: 1, g1d: 44, g2b: 0, g2d: 0, align: [6, 22] },
  { v: 4, total: 100, ec: 18, g1b: 2, g1d: 32, g2b: 0, g2d: 0, align: [6, 26] },
  { v: 5, total: 134, ec: 24, g1b: 2, g1d: 43, g2b: 0, g2d: 0, align: [6, 30] },
  { v: 6, total: 172, ec: 16, g1b: 4, g1d: 27, g2b: 0, g2d: 0, align: [6, 34] },
  { v: 7, total: 196, ec: 18, g1b: 4, g1d: 31, g2b: 0, g2d: 0, align: [6, 22, 38] },
  { v: 8, total: 242, ec: 22, g1b: 2, g1d: 38, g2b: 2, g2d: 39, align: [6, 24, 42] },
  { v: 9, total: 292, ec: 22, g1b: 3, g1d: 36, g2b: 2, g2d: 37, align: [6, 26, 46] },
  { v: 10, total: 346, ec: 26, g1b: 4, g1d: 43, g2b: 1, g2d: 44, align: [6, 28, 50] }
];

function chooseVersion(byteLen) {
  for (let v = 1; v < VERSION_M.length; v++) {
    const spec = VERSION_M[v];
    const dataCapacityBytes = spec.g1b * spec.g1d + spec.g2b * spec.g2d;
    const countBits = v <= 9 ? 8 : 16;
    const requiredBits = 4 + countBits + byteLen * 8;
    if (requiredBits <= dataCapacityBytes * 8) return spec;
  }
  throw new Error('QR payload exceeds supported Version 10 capacity.');
}

function buildCodewords(bytes, spec) {
  const dataCapacity = spec.g1b * spec.g1d + spec.g2b * spec.g2d;
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };

  // Byte mode indicator (0100) + character count + payload bytes
  pushBits(0b0100, 4);
  pushBits(bytes.length, spec.v <= 9 ? 8 : 16);
  for (let i = 0; i < bytes.length; i++) pushBits(bytes[i], 8);

  // Terminator (up to 4 zero bits)
  const capBits = dataCapacity * 8;
  const termLen = Math.min(4, capBits - bits.length);
  for (let i = 0; i < termLen; i++) bits.push(0);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);

  // Pack to bytes and pad alternating 0xEC, 0x11
  const dataBytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes.push(b);
  }
  const pads = [0xec, 0x11];
  let pIdx = 0;
  while (dataBytes.length < dataCapacity) {
    dataBytes.push(pads[pIdx % 2]);
    pIdx++;
  }

  // Split into RS blocks & compute ECC
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (let b = 0; b < spec.g1b; b++) {
    const blk = dataBytes.slice(offset, offset + spec.g1d);
    offset += spec.g1d;
    dataBlocks.push(blk);
    ecBlocks.push(rsComputeEcc(blk, spec.ec));
  }
  for (let b = 0; b < spec.g2b; b++) {
    const blk = dataBytes.slice(offset, offset + spec.g2d);
    offset += spec.g2d;
    dataBlocks.push(blk);
    ecBlocks.push(rsComputeEcc(blk, spec.ec));
  }

  // Interleave data codewords, then ECC codewords
  const out = [];
  const maxDataLen = Math.max(spec.g1d, spec.g2d);
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) {
      if (i < blk.length) out.push(blk[i]);
    }
  }
  for (let i = 0; i < spec.ec; i++) {
    for (const ec of ecBlocks) out.push(ec[i]);
  }
  return out;
}

// Compute 15-bit BCH format string for EC Level M (00) + mask (0..7)
function computeFormatBits(mask) {
  const data = (0b00 << 3) | (mask & 7);
  let rem = data << 10;
  const poly = 0b10100110111;
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) rem ^= poly << (i - 10);
  }
  return ((data << 10) | rem) ^ 0b101010000010010;
}

// Compute 18-bit Golay version info for Version >= 7
function computeVersionBits(version) {
  let rem = version << 12;
  const poly = 0b1111100100101;
  for (let i = 17; i >= 12; i--) {
    if ((rem >>> i) & 1) rem ^= poly << (i - 12);
  }
  return (version << 12) | rem;
}

function maskBit(mask, r, c) {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return false;
  }
}

function createMatrix(spec, codewords) {
  const size = spec.v * 4 + 17;
  const modules = Array.from({ length: size }, () => new Uint8Array(size));
  const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

  const setFunc = (r, c, val) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = val ? 1 : 0;
      isFunc[r][c] = 1;
    }
  };

  // Finder patterns + separators
  const drawFinder = (top, left) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const dark = inOuter && (
          dr === 0 || dr === 6 || dc === 0 || dc === 6 ||
          (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)
        );
        setFunc(r, c, dark);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const centers = spec.align;
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      const cr = centers[i];
      const cc = centers[j];
      if ((i === 0 && j === 0) || (i === 0 && j === centers.length - 1) || (i === centers.length - 1 && j === 0)) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunc(cr + dr, cc + dc, dark);
        }
      }
    }
  }

  // Reserve format info areas & dark module
  for (let i = 0; i <= 8; i++) {
    if (!isFunc[8][i]) setFunc(8, i, 0);
    if (!isFunc[i][8]) setFunc(i, 8, 0);
  }
  for (let i = size - 8; i < size; i++) {
    setFunc(8, i, 0);
    setFunc(i, 8, 0);
  }
  setFunc(size - 8, 8, 1); // Dark module

  // Version info (Version >= 7)
  if (spec.v >= 7) {
    const vBits = computeVersionBits(spec.v);
    for (let i = 0; i < 18; i++) {
      const bit = (vBits >>> i) & 1;
      const a = Math.floor(i / 3);
      const b = size - 11 + (i % 3);
      setFunc(a, b, bit);
      setFunc(b, a, bit);
    }
  }

  // Place data bits in upward/downward 2-column zigzags
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < size; step++) {
      const r = upward ? (size - 1 - step) : step;
      for (let dx = 0; dx < 2; dx++) {
        const c = right - dx;
        if (!isFunc[r][c]) {
          let bit = 0;
          if (bitIdx < totalBits) {
            bit = (codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1;
          }
          modules[r][c] = bit;
          bitIdx++;
        }
      }
    }
  }

  // Evaluate all 8 mask patterns and pick lowest penalty score
  function applyMaskAndFormat(mask) {
    const grid = modules.map(row => new Uint8Array(row));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!isFunc[r][c] && maskBit(mask, r, c)) {
          grid[r][c] ^= 1;
        }
      }
    }
    const fBits = computeFormatBits(mask);
    // Top-left around finder
    const coords1 = [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
      [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
    ];
    for (let i = 0; i < 15; i++) {
      const bit = (fBits >>> (14 - i)) & 1;
      grid[coords1[i][0]][coords1[i][1]] = bit;
    }
    // Bottom-left & top-right
    for (let i = 0; i < 7; i++) {
      grid[size - 1 - i][8] = (fBits >>> (14 - i)) & 1;
    }
    for (let i = 7; i < 15; i++) {
      grid[8][size - 15 + i] = (fBits >>> (14 - i)) & 1;
    }
    return grid;
  }

  function penaltyScore(grid) {
    let score = 0;
    // Rule 1: Runs of >= 5 same-colored modules in rows & cols
    for (let r = 0; r < size; r++) {
      let runColor = grid[r][0], runLen = 1;
      for (let c = 1; c < size; c++) {
        if (grid[r][c] === runColor) runLen++;
        else {
          if (runLen >= 5) score += 3 + (runLen - 5);
          runColor = grid[r][c];
          runLen = 1;
        }
      }
      if (runLen >= 5) score += 3 + (runLen - 5);
    }
    for (let c = 0; c < size; c++) {
      let runColor = grid[0][c], runLen = 1;
      for (let r = 1; r < size; r++) {
        if (grid[r][c] === runColor) runLen++;
        else {
          if (runLen >= 5) score += 3 + (runLen - 5);
          runColor = grid[r][c];
          runLen = 1;
        }
      }
      if (runLen >= 5) score += 3 + (runLen - 5);
    }
    // Rule 2: 2x2 blocks of same color
    for (let r = 0; r < size - 1; r++) {
      for (let c = 0; c < size - 1; c++) {
        const v = grid[r][c];
        if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) {
          score += 3;
        }
      }
    }
    // Rule 4: Dark balance
    let dark = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) if (grid[r][c]) dark++;
    }
    const pct = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  let bestGrid = null;
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const g = applyMaskAndFormat(m);
    const s = penaltyScore(g);
    if (s < bestScore) {
      bestScore = s;
      bestGrid = g;
    }
  }
  return bestGrid;
}

/**
 * Render a scannable vector SVG QR code string for any UTF-8 URL or text.
 */
function generateQrSvg(text, { sizePx = 156, darkColor = '#0B192C', lightColor = '#FFFFFF', margin = 4 } = {}) {
  const bytes = Buffer.from(String(text || ''), 'utf8');
  const spec = chooseVersion(bytes.length);
  const codewords = buildCodewords(bytes, spec);
  const grid = createMatrix(spec, codewords);
  const n = grid.length;
  const total = n + margin * 2;

  let pathD = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c]) {
        pathD += `M${c + margin},${r + margin}h1v1h-1z`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizePx}" height="${sizePx}" role="img" aria-label="Official Transcript Verification QR Code" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${lightColor}"/><path d="${pathD}" fill="${darkColor}"/></svg>`;
}

module.exports = { generateQrSvg };
