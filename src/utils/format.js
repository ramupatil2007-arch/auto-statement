import {
  COMBINED_PAGE_MAX_ROWS,
  DIESEL_RATE,
  QUANTITY_SUFFIX,
} from '../constants.js';

export function getTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateDDMMYYYY(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

export function buildTableHeading(wingName, tableType, isoDate) {
  const wing = (wingName || '').trim().toUpperCase() || 'WING NAME';
  const dateStr = formatDateDDMMYYYY(isoDate) || 'DD-MM-YYYY';
  const typeClean = (tableType || '').trim().toUpperCase();
  if (!typeClean) {
    return `${wing} ${dateStr}`;
  }
  return `${wing} (${typeClean}) ${dateStr}`;
}

export function parseNumericAmount(raw) {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (cleaned === '') return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

export function hasFractionalAmount(rows) {
  return rows.some((row) => {
    const val = parseNumericAmount(row.amount);
    return val !== null && Math.abs(val - Math.round(val)) > 1e-6;
  });
}

export function formatAmountValue(num, forceDecimals = false) {
  if (num === null || num === undefined || !Number.isFinite(num)) return '';
  if (forceDecimals || Math.abs(num - Math.round(num)) > 1e-6) {
    return num.toFixed(2);
  }
  return String(Math.round(num));
}

export function resolveDieselRate(rawRate) {
  const parsed = parseNumericAmount(rawRate);
  if (parsed !== null && parsed > 0) return parsed;
  return DIESEL_RATE;
}

export function calculateFuelQuantity(amountNum, dieselRate = DIESEL_RATE) {
  if (amountNum === null || amountNum === undefined || !Number.isFinite(amountNum)) {
    return null;
  }
  const rate = resolveDieselRate(dieselRate);
  return amountNum / rate;
}

export function formatQuantityValue(litres) {
  if (litres === null || litres === undefined || !Number.isFinite(litres)) return '';
  return `${litres.toFixed(3)}${QUANTITY_SUFFIX}`;
}

export function computeFuelSummary(rows, dieselRate = DIESEL_RATE) {
  const rate = resolveDieselRate(dieselRate);
  const rateDisplay = rate.toFixed(2);
  const useDecimals = hasFractionalAmount(rows);
  let totalAmount = 0;
  let totalLitres = 0;

  const computedRows = rows.map((row, idx) => {
    const amountNum = parseNumericAmount(row.amount);
    const litres = amountNum !== null ? calculateFuelQuantity(amountNum, rate) : null;
    if (amountNum !== null) {
      totalAmount += amountNum;
      totalLitres += litres;
    }
    return {
      slNo: String(idx + 1),
      vehicleNo: (row.vehicleNo || '').trim().toUpperCase(),
      status: (row.status || '').trim().toUpperCase() || 'RUNNING',
      rate: rateDisplay,
      quantity: litres !== null ? formatQuantityValue(litres) : '',
      amount: amountNum !== null ? formatAmountValue(amountNum, useDecimals) : '',
    };
  });

  return {
    rows: computedRows,
    rateDisplay,
    totalQuantity: formatQuantityValue(totalLitres),
    totalAmount: formatAmountValue(totalAmount, useDecimals),
  };
}

export function computeChallanSummary(rows) {
  const useDecimals = hasFractionalAmount(rows);
  let totalAmount = 0;

  const computedRows = rows.map((row, idx) => {
    const amountNum = parseNumericAmount(row.amount);
    if (amountNum !== null) {
      totalAmount += amountNum;
    }
    return {
      slNo: String(idx + 1),
      vehicleNo: (row.vehicleNo || '').trim().toUpperCase(),
      status: (row.status || '').trim().toUpperCase() || 'RUNNING',
      description: (row.description || '').trim(),
      amount: amountNum !== null ? formatAmountValue(amountNum, useDecimals) : '',
    };
  });

  return {
    rows: computedRows,
    totalAmount: formatAmountValue(totalAmount, useDecimals),
  };
}

export function shouldCombineOnSinglePage(mode, fuelRowCount, challanRowCount) {
  if (mode !== 'both') return false;
  return fuelRowCount <= COMBINED_PAGE_MAX_ROWS && challanRowCount <= COMBINED_PAGE_MAX_ROWS;
}

export function buildCustomColumnsSpec(columns, autoSlNo) {
  const count = columns.length;
  if (count === 0) return [];

  if (autoSlNo && count > 1) {
    const slWidth = Math.min(12, Math.max(8, Math.round(100 / (count + 2))));
    const remaining = 100 - slWidth;
    const each = remaining / (count - 1);
    return columns.map((col, idx) => ({
      key: `col_${idx}`,
      label: (col.name || `COL ${idx + 1}`).trim().toUpperCase(),
      widthPct: idx === 0 ? slWidth : each,
      align: 'center',
      isSum: Boolean(col.isSum),
    }));
  }

  const each = 100 / count;
  return columns.map((col, idx) => ({
    key: `col_${idx}`,
    label: (col.name || `COL ${idx + 1}`).trim().toUpperCase(),
    widthPct: each,
    align: 'center',
    isSum: Boolean(col.isSum),
  }));
}

export function computeCustomSummary({ columns, rows, autoSlNo, showTotal }) {
  const colSpec = buildCustomColumnsSpec(columns, autoSlNo);

  const computedRows = rows.map((row, rowIdx) => {
    const obj = {};
    colSpec.forEach((col, colIdx) => {
      if (autoSlNo && colIdx === 0) {
        obj[col.key] = String(rowIdx + 1);
      } else {
        obj[col.key] = String(row.cells?.[colIdx] ?? '').trim();
      }
    });
    return obj;
  });

  let totalCells = null;
  if (showTotal && colSpec.length > 0) {
    const sums = colSpec.map((col, colIdx) => {
      if (!col.isSum || (autoSlNo && colIdx === 0)) return null;
      let sum = 0;
      let hasDecimal = false;
      rows.forEach((row) => {
        const val = parseNumericAmount(row.cells?.[colIdx]);
        if (val !== null) {
          sum += val;
          if (Math.abs(val - Math.round(val)) > 1e-6) hasDecimal = true;
        }
      });
      return formatAmountValue(sum, hasDecimal);
    });

    const firstSumIdx = sums.findIndex((s) => s !== null);
    const totalLabelIdx =
      firstSumIdx > 0
        ? firstSumIdx - 1
        : firstSumIdx === 0
          ? -1
          : colSpec.length > 1
            ? colSpec.length - 2
            : 0;

    totalCells = colSpec.map((_, idx) => {
      if (sums[idx] !== null) return { text: sums[idx], bold: true };
      if (idx === totalLabelIdx) return { text: 'TOTAL', bold: true };
      return { text: '', bold: false };
    });
  }

  return {
    columns: colSpec,
    rows: computedRows,
    totalCells,
  };
}
