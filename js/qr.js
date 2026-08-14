/* Minimal QR encoder for shared-list links: byte mode, ECC M, versions 1-10. */
(function (root) {
  "use strict";

  /* [block count, total codewords per block, data codewords per block]. */
  const RS_BLOCKS = [
    [[1, 26, 16]],
    [[1, 44, 28]],
    [[1, 70, 44]],
    [[2, 50, 32]],
    [[2, 67, 43]],
    [[4, 43, 27]],
    [[4, 49, 31]],
    [[2, 60, 38], [2, 61, 39]],
    [[3, 58, 36], [2, 59, 37]],
    [[4, 69, 43], [1, 70, 44]],
  ];

  const ALIGNMENT = [
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
  ];

  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  let gfValue = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = gfValue;
    GF_LOG[gfValue] = i;
    gfValue <<= 1;
    if (gfValue & 0x100) gfValue ^= 0x11d;
  }
  for (let i = 255; i < GF_EXP.length; i++) GF_EXP[i] = GF_EXP[i - 255];

  function gfMultiply(a, b) {
    return a && b ? GF_EXP[GF_LOG[a] + GF_LOG[b]] : 0;
  }

  function rsGenerator(degree) {
    let result = [1];
    for (let i = 0; i < degree; i++) {
      const next = new Array(result.length + 1).fill(0);
      for (let j = 0; j < result.length; j++) {
        next[j] ^= result[j];
        next[j + 1] ^= gfMultiply(result[j], GF_EXP[i]);
      }
      result = next;
    }
    return result;
  }

  function rsRemainder(data, degree) {
    const generator = rsGenerator(degree);
    const work = data.concat(new Array(degree).fill(0));
    for (let i = 0; i < data.length; i++) {
      const factor = work[i];
      if (!factor) continue;
      for (let j = 0; j < generator.length; j++) {
        work[i + j] ^= gfMultiply(generator[j], factor);
      }
    }
    return work.slice(data.length);
  }

  function appendBits(bits, value, length) {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  }

  function dataCodewords(bytes, version, count) {
    const capacity = count * 8;
    const bits = [];
    appendBits(bits, 0x4, 4); // Byte mode.
    appendBits(bits, bytes.length, version < 10 ? 8 : 16);
    for (const byte of bytes) appendBits(bits, byte, 8);
    for (let i = 0, n = Math.min(4, capacity - bits.length); i < n; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);

    const result = [];
    for (let i = 0; i < bits.length; i += 8) {
      let value = 0;
      for (let j = 0; j < 8; j++) value = (value << 1) | bits[i + j];
      result.push(value);
    }
    for (let pad = 0; result.length < count; pad++) result.push(pad % 2 ? 0x11 : 0xec);
    return result;
  }

  function interleave(data, groups) {
    const blocks = [];
    let offset = 0;
    for (const [count, totalCount, dataCount] of groups) {
      for (let i = 0; i < count; i++) {
        const blockData = data.slice(offset, offset + dataCount);
        offset += dataCount;
        blocks.push({ data: blockData, ecc: rsRemainder(blockData, totalCount - dataCount) });
      }
    }

    const result = [];
    const maxData = Math.max(...blocks.map((block) => block.data.length));
    const maxEcc = Math.max(...blocks.map((block) => block.ecc.length));
    for (let i = 0; i < maxData; i++) {
      for (const block of blocks) if (i < block.data.length) result.push(block.data[i]);
    }
    for (let i = 0; i < maxEcc; i++) {
      for (const block of blocks) if (i < block.ecc.length) result.push(block.ecc[i]);
    }
    return result;
  }

  function drawFinder(modules, top, left) {
    const size = modules.length;
    for (let row = -1; row <= 7; row++) {
      for (let col = -1; col <= 7; col++) {
        const y = top + row;
        const x = left + col;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        const inside = row >= 0 && row <= 6 && col >= 0 && col <= 6;
        modules[y][x] = inside &&
          (row === 0 || row === 6 || col === 0 || col === 6 ||
            (row >= 2 && row <= 4 && col >= 2 && col <= 4));
      }
    }
  }

  function bchRemainder(value, polynomial) {
    const divisorDegree = 31 - Math.clz32(polynomial);
    while (value && 31 - Math.clz32(value) >= divisorDegree) {
      value ^= polynomial << (31 - Math.clz32(value) - divisorDegree);
    }
    return value;
  }

  function drawFormatBits(modules, mask) {
    /* ECC M has the two-bit format value 00. */
    const bits = ((mask << 10) | bchRemainder(mask << 10, 0x537)) ^ 0x5412;
    const size = modules.length;
    for (let i = 0; i < 15; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      if (i < 6) modules[i][8] = dark;
      else if (i < 8) modules[i + 1][8] = dark;
      else modules[size - 15 + i][8] = dark;

      if (i < 8) modules[8][size - i - 1] = dark;
      else if (i === 8) modules[8][7] = dark;
      else modules[8][14 - i] = dark;
    }
    modules[size - 8][8] = true;
  }

  function drawVersionBits(modules, version) {
    if (version < 7) return;
    const raw = version << 12;
    const bits = raw | bchRemainder(raw, 0x1f25);
    const size = modules.length;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      modules[b][a] = dark;
      modules[a][b] = dark;
    }
  }

  function functionPatterns(version, mask) {
    const size = version * 4 + 17;
    const modules = Array.from({ length: size }, () => new Array(size).fill(null));
    drawFinder(modules, 0, 0);
    drawFinder(modules, 0, size - 7);
    drawFinder(modules, size - 7, 0);

    for (const y of ALIGNMENT[version - 1]) {
      for (const x of ALIGNMENT[version - 1]) {
        if (modules[y][x] !== null) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            modules[y + dy][x + dx] = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
          }
        }
      }
    }

    /* Alignment patterns can interrupt a timing line from version 7 onward. */
    for (let i = 8; i < size - 8; i++) {
      if (modules[6][i] === null) modules[6][i] = i % 2 === 0;
      if (modules[i][6] === null) modules[i][6] = i % 2 === 0;
    }

    drawFormatBits(modules, mask);
    drawVersionBits(modules, version);
    return modules;
  }

  function isMasked(mask, row, col) {
    const product = row * col;
    switch (mask) {
      case 0: return (row + col) % 2 === 0;
      case 1: return row % 2 === 0;
      case 2: return col % 3 === 0;
      case 3: return (row + col) % 3 === 0;
      case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
      case 5: return product % 2 + product % 3 === 0;
      case 6: return (product % 2 + product % 3) % 2 === 0;
      default: return ((row + col) % 2 + product % 3) % 2 === 0;
    }
  }

  function makeMatrix(version, codewords, mask) {
    const modules = functionPatterns(version, mask);
    const size = modules.length;
    let bit = 0;
    let row = size - 1;
    let direction = -1;

    for (let right = size - 1; right > 0; right -= 2) {
      if (right === 6) right--;
      for (;;) {
        for (let offset = 0; offset < 2; offset++) {
          const col = right - offset;
          if (modules[row][col] !== null) continue;
          const value = bit < codewords.length * 8 &&
            ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) !== 0;
          modules[row][col] = value !== isMasked(mask, row, col);
          bit++;
        }
        row += direction;
        if (row >= 0 && row < size) continue;
        row -= direction;
        direction = -direction;
        break;
      }
    }
    return modules;
  }

  function penalty(modules) {
    const size = modules.length;
    let score = 0;

    function scoreLine(valueAt) {
      let lineScore = 0;
      let run = 1;
      for (let i = 1; i < size; i++) {
        if (valueAt(i) === valueAt(i - 1)) run++;
        else {
          if (run >= 5) lineScore += run - 2;
          run = 1;
        }
      }
      if (run >= 5) lineScore += run - 2;

      for (let i = 0; i + 6 < size; i++) {
        const finderLike = valueAt(i) && !valueAt(i + 1) && valueAt(i + 2) &&
          valueAt(i + 3) && valueAt(i + 4) && !valueAt(i + 5) && valueAt(i + 6);
        if (!finderLike) continue;
        let beforeLight = true;
        let afterLight = true;
        for (let j = i - 4; j < i; j++) {
          if (j >= 0 && valueAt(j)) beforeLight = false;
        }
        for (let j = i + 7; j <= i + 10; j++) {
          if (j < size && valueAt(j)) afterLight = false;
        }
        if (beforeLight || afterLight) lineScore += 40;
      }
      return lineScore;
    }

    for (let row = 0; row < size; row++) score += scoreLine((col) => modules[row][col]);
    for (let col = 0; col < size; col++) score += scoreLine((row) => modules[row][col]);

    for (let row = 0; row < size - 1; row++) {
      for (let col = 0; col < size - 1; col++) {
        const value = modules[row][col];
        if (modules[row][col + 1] === value && modules[row + 1][col] === value &&
            modules[row + 1][col + 1] === value) score += 3;
      }
    }

    let dark = 0;
    for (const row of modules) for (const value of row) if (value) dark++;
    score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return score;
  }

  function toSvg(modules) {
    const quiet = 4;
    const extent = modules.length + quiet * 2;
    const path = [];
    for (let row = 0; row < modules.length; row++) {
      for (let col = 0; col < modules.length;) {
        if (!modules[row][col]) {
          col++;
          continue;
        }
        const start = col;
        while (col < modules.length && modules[row][col]) col++;
        path.push(`M${start + quiet} ${row + quiet}h${col - start}v1H${start + quiet}z`);
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" ` +
      `role="img" aria-label="${(window.GCI18N?.t || ((k) => k))("share.qrAlt")}" shape-rendering="crispEdges">` +
      `<rect width="${extent}" height="${extent}" fill="#fff"/>` +
      `<path d="${path.join("")}" fill="#000"/></svg>`;
  }

  root.qrSvg = function qrSvg(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    let version = 0;
    let dataCount = 0;
    for (let candidate = 1; candidate <= 10; candidate++) {
      const count = RS_BLOCKS[candidate - 1]
        .reduce((sum, [blocks, , dataWords]) => sum + blocks * dataWords, 0);
      const countBits = candidate < 10 ? 8 : 16;
      if (bytes.length < 2 ** countBits && 4 + countBits + bytes.length * 8 <= count * 8) {
        version = candidate;
        dataCount = count;
        break;
      }
    }
    if (!version) return null;

    const data = dataCodewords(bytes, version, dataCount);
    const codewords = interleave(data, RS_BLOCKS[version - 1]);
    let best = null;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const modules = makeMatrix(version, codewords, mask);
      const score = penalty(modules);
      if (score < bestScore) {
        best = modules;
        bestScore = score;
      }
    }
    return toSvg(best);
  };
})(typeof window === "undefined" ? globalThis : window);
