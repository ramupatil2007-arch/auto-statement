const STATUS_KEYWORDS = new Set([
  'RUNNING',
  'IDLE',
  'BREAKDOWN',
  'SPARE',
  'STOPPED',
  'OFFROAD',
  'OFF-ROAD',
  'STANDBY',
  'REPAIR',
  'GARAGE',
  'WORKING',
]);

// Matches common Indian vehicle registration numbers with or without spaces/hyphens:
// e.g. AP39AB1234, TS 09 UB 4567, KA-01-MJ-2020, KA51-C-4461, NL01-B-3526, 22 BH 1234 AA
const INDIAN_PLATE_REGEX =
  /\b(?:[A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{1,3}[\s-]?\d{3,4}|\d{2}[\s-]?BH[\s-]?\d{4}[\s-]?[A-Z]{1,2})\b/i;

function isHeaderOrTotalLine(line) {
  const upper = line.toUpperCase();
  if (/\bTOTAL\b/.test(upper)) return true;
  if (/\bSL\.?\s*NO\b/.test(upper) && /\bVEHICLE\b/.test(upper)) return true;
  if (/\bD\/?RATE\b/.test(upper) && /\bQUANTITY\b/.test(upper)) return true;
  if (/\bDESCRIPTION\b/.test(upper) && /\bAMOUNT\b/.test(upper)) return true;
  if (/\((FUEL|CHALLAN)\)/.test(upper)) return true;
  return false;
}

function cleanAmountToken(token) {
  const cleaned = token
    .replace(/[₹]/g, '')
    .replace(/^rs\.?/i, '')
    .replace(/\/-$/, '')
    .replace(/,/g, '')
    .trim();
  if (/^\d+(?:\.\d{1,2})?$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

function normalizeVehicleNo(raw) {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s-]/g, '')
    .replace(/\s+/g, ' ');
}

function stripLeadingSerial(line) {
  // Remove leading serial numbers like "1.", "1)", "01 ", "1 -"
  return line.replace(/^\s*\d{1,3}\s*[.):-]?\s+(?=[A-Z0-9])/i, '').trim();
}

function looksLikeVehicleOnlyToken(token) {
  const cleaned = stripLeadingSerial(token);
  if (!cleaned) return false;
  if (INDIAN_PLATE_REGEX.test(cleaned)) return true;
  // Generic vehicle ID containing both letters and digits without pure amount
  return /[A-Z]/i.test(cleaned) && /\d/.test(cleaned) && cleaned.length >= 4 && cleaned.length <= 20;
}

function isRateToken(amt, rateStr) {
  if (!amt) return false;
  if (amt === '98.80' || amt === '98.8' || amt === '98.79') return true;
  if (rateStr && (amt === rateStr || Number(amt) === Number(rateStr))) return true;
  return false;
}

function parseFuelLine(rawLine, rateStr) {
  const trimmed = rawLine.trim();
  if (!trimmed || isHeaderOrTotalLine(trimmed)) return [];

  // Check if the line is a comma/semicolon-separated list of multiple vehicle numbers (e.g. "KA51-C-4461, KA51-C-4682")
  if (trimmed.includes(',') || trimmed.includes(';')) {
    const commaParts = trimmed
      .split(/[,;]/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (
      commaParts.length >= 2 &&
      commaParts.every((p) => looksLikeVehicleOnlyToken(p) && cleanAmountToken(p) === null)
    ) {
      return commaParts.map((p) => ({
        vehicleNo: normalizeVehicleNo(stripLeadingSerial(p)),
        status: '',
        amount: '',
      }));
    }
  }

  // 1) Try tab, pipe, or comma separated columns (Excel / CSV paste)
  const delimiter = trimmed.includes('\t')
    ? '\t'
    : trimmed.includes('|')
      ? '|'
      : trimmed.includes(',')
        ? ','
        : null;

  if (delimiter) {
    let parts = trimmed
      .split(delimiter)
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length === 0) return [];
    if (parts.length >= 2 && /^\d{1,3}\.?$/.test(parts[0])) {
      parts = parts.slice(1);
    }

    if (parts.length >= 2) {
      const vehicleNo = normalizeVehicleNo(parts[0]);
      let status = '';
      let amount = '';

      for (let i = parts.length - 1; i >= 1; i--) {
        const p = parts[i];
        if (/\d\s*L$/i.test(p)) continue;
        const amt = cleanAmountToken(p);
        if (amt !== null && !isRateToken(amt, rateStr)) {
          amount = amt;
          break;
        }
      }

      for (let i = 1; i < parts.length; i++) {
        const u = parts[i].toUpperCase();
        if (STATUS_KEYWORDS.has(u)) {
          status = u;
          break;
        }
      }

      if (vehicleNo || amount) {
        return [{ vehicleNo, status, amount }];
      }
    }
  }

  // 2) Free-text / OCR / vehicle-only line parsing
  const line = stripLeadingSerial(trimmed);
  let working = line;
  let vehicleNo = '';
  let status = '';
  let amount = '';

  const plateMatch = working.match(INDIAN_PLATE_REGEX);
  if (plateMatch) {
    vehicleNo = normalizeVehicleNo(plateMatch[0]);
    working = working.replace(plateMatch[0], ' ').trim();
  }

  const tokens = working.split(/\s+/).filter(Boolean);
  const remainingTokens = [];
  for (const tok of tokens) {
    const upper = tok.toUpperCase().replace(/[^A-Z-]/g, '');
    if (STATUS_KEYWORDS.has(upper) && !status) {
      status = upper;
    } else {
      remainingTokens.push(tok);
    }
  }

  for (let i = remainingTokens.length - 1; i >= 0; i--) {
    const tok = remainingTokens[i];
    if (/\d\s*L$/i.test(tok)) continue;
    const amt = cleanAmountToken(tok);
    if (amt !== null && !isRateToken(amt, rateStr)) {
      amount = amt;
      remainingTokens.splice(i, 1);
      break;
    }
  }

  if (!vehicleNo && remainingTokens.length > 0) {
    const candidateIdx = remainingTokens.findIndex((t) => /[A-Z]/i.test(t) && /\d/.test(t));
    if (candidateIdx !== -1) {
      vehicleNo = normalizeVehicleNo(remainingTokens[candidateIdx]);
    } else {
      vehicleNo = normalizeVehicleNo(remainingTokens.join(' '));
    }
  }

  if (!vehicleNo && !amount) return [];
  return [{ vehicleNo, status, amount }];
}

function parseChallanLine(rawLine) {
  const trimmed = rawLine.trim();
  if (!trimmed || isHeaderOrTotalLine(trimmed)) return [];

  // Handle comma/semicolon-separated list of vehicle numbers only
  if (trimmed.includes(',') || trimmed.includes(';')) {
    const commaParts = trimmed
      .split(/[,;]/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (
      commaParts.length >= 2 &&
      commaParts.every((p) => looksLikeVehicleOnlyToken(p) && cleanAmountToken(p) === null)
    ) {
      return commaParts.map((p) => ({
        vehicleNo: normalizeVehicleNo(stripLeadingSerial(p)),
        status: '',
        description: '',
        amount: '',
      }));
    }
  }

  const delimiter = trimmed.includes('\t')
    ? '\t'
    : trimmed.includes('|')
      ? '|'
      : trimmed.includes(',')
        ? ','
        : null;

  if (delimiter) {
    let parts = trimmed
      .split(delimiter)
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length === 0) return [];
    if (parts.length >= 2 && /^\d{1,3}\.?$/.test(parts[0])) {
      parts = parts.slice(1);
    }

    if (parts.length >= 2) {
      const vehicleNo = normalizeVehicleNo(parts[0]);
      let status = '';
      let amount = '';
      const descParts = [];

      let amountIdx = -1;
      for (let i = parts.length - 1; i >= 1; i--) {
        const amt = cleanAmountToken(parts[i]);
        if (amt !== null) {
          amount = amt;
          amountIdx = i;
          break;
        }
      }

      for (let i = 1; i < parts.length; i++) {
        if (i === amountIdx) continue;
        const u = parts[i].toUpperCase();
        if (STATUS_KEYWORDS.has(u) && !status) {
          status = u;
        } else {
          descParts.push(parts[i]);
        }
      }

      if (vehicleNo || amount || descParts.length > 0) {
        return [
          {
            vehicleNo,
            status,
            description: descParts.join(' ').trim(),
            amount,
          },
        ];
      }
    }
  }

  const line = stripLeadingSerial(trimmed);
  let working = line;
  let vehicleNo = '';
  let status = '';
  let amount = '';

  const plateMatch = working.match(INDIAN_PLATE_REGEX);
  if (plateMatch) {
    vehicleNo = normalizeVehicleNo(plateMatch[0]);
    working = working.replace(plateMatch[0], ' ').trim();
  }

  const tokens = working.split(/\s+/).filter(Boolean);
  const rest = [];
  for (const tok of tokens) {
    const upper = tok.toUpperCase().replace(/[^A-Z-]/g, '');
    if (STATUS_KEYWORDS.has(upper) && !status) {
      status = upper;
    } else {
      rest.push(tok);
    }
  }

  for (let i = rest.length - 1; i >= 0; i--) {
    const amt = cleanAmountToken(rest[i]);
    if (amt !== null) {
      amount = amt;
      rest.splice(i, 1);
      break;
    }
  }

  if (!vehicleNo && rest.length > 0) {
    const candidateIdx = rest.findIndex((t) => /[A-Z]/i.test(t) && /\d/.test(t));
    if (candidateIdx !== -1) {
      vehicleNo = normalizeVehicleNo(rest[candidateIdx]);
      rest.splice(candidateIdx, 1);
    }
  }

  const description = rest.join(' ').replace(/^[-–:]+\s*/, '').trim();
  if (!vehicleNo && !amount && !description) return [];

  return [
    {
      vehicleNo,
      status,
      description,
      amount,
    },
  ];
}

export function parseVehicleText(text, tableKind, options = {}) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/);
  const rateStr = options.dieselRate ? String(options.dieselRate) : '';
  const results = [];

  for (const line of lines) {
    const items =
      tableKind === 'challan' ? parseChallanLine(line) : parseFuelLine(line, rateStr);
    for (const item of items) {
      results.push(item);
    }
  }
  return results;
}
