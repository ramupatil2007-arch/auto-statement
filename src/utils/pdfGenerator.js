import { jsPDF } from 'jspdf';
import {
  A4,
  CHALLAN_COLUMNS,
  FUEL_COLUMNS,
  TABLE_STYLE,
} from '../constants.js';
import {
  buildTableHeading,
  computeChallanSummary,
  computeCustomSummary,
  computeFuelSummary,
  formatDateDDMMYYYY,
  shouldCombineOnSinglePage,
} from './format.js';

function getColumnWidthsMm(columns) {
  const widths = columns.map((col) => (A4.tableWidthMm * col.widthPct) / 100);
  // Ensure sum matches tableWidthMm exactly to avoid 0.01mm border drift
  const sumExceptLast = widths.slice(0, -1).reduce((a, b) => a + b, 0);
  widths[widths.length - 1] = A4.tableWidthMm - sumExceptLast;
  return widths;
}

function drawCell(doc, x, y, w, h, lines, options) {
  const {
    fillRgb = TABLE_STYLE.cellBgRgb,
    fontStyle = 'normal',
    fontSize = TABLE_STYLE.bodyFontPt,
    align = 'center',
  } = options;

  doc.setFillColor(fillRgb[0], fillRgb[1], fillRgb[2]);
  doc.setDrawColor(
    TABLE_STYLE.borderRgb[0],
    TABLE_STYLE.borderRgb[1],
    TABLE_STYLE.borderRgb[2]
  );
  doc.setLineWidth(TABLE_STYLE.borderWidthMm);
  doc.rect(x, y, w, h, 'FD');

  if (!lines || lines.length === 0) return;

  doc.setFont(TABLE_STYLE.pdfFontFamily, fontStyle);
  doc.setFontSize(fontSize);
  doc.setTextColor(
    TABLE_STYLE.textRgb[0],
    TABLE_STYLE.textRgb[1],
    TABLE_STYLE.textRgb[2]
  );

  let textX = x + w / 2;
  if (align === 'left') {
    textX = x + TABLE_STYLE.cellPaddingXMm;
  } else if (align === 'right') {
    textX = x + w - TABLE_STYLE.cellPaddingXMm;
  }

  const lineStep = TABLE_STYLE.lineHeightMm;
  const totalTextSpan = (lines.length - 1) * lineStep;
  const firstLineY = y + h / 2 - totalTextSpan / 2;

  lines.forEach((line, index) => {
    doc.text(String(line), textX, firstLineY + index * lineStep, {
      align,
      baseline: 'middle',
    });
  });
}

function measureTable(doc, spec) {
  const colWidths = getColumnWidthsMm(spec.columns);

  doc.setFont(TABLE_STYLE.pdfFontFamily, 'normal');
  doc.setFontSize(TABLE_STYLE.bodyFontPt);

  const measuredRows = spec.rows.map((rowObj) => {
    const cellLines = spec.columns.map((col, colIdx) => {
      const text = rowObj[col.key] ?? '';
      const maxWidth = Math.max(4, colWidths[colIdx] - 2 * TABLE_STYLE.cellPaddingXMm);
      return text === '' ? [] : doc.splitTextToSize(String(text), maxWidth);
    });
    const maxLineCount = Math.max(1, ...cellLines.map((l) => l.length));
    const rowHeight = Math.max(
      TABLE_STYLE.minDataRowHeightMm,
      maxLineCount * TABLE_STYLE.lineHeightMm + 2 * TABLE_STYLE.cellPaddingYMm
    );
    return { cellLines, rowHeight };
  });

  const dataHeight = measuredRows.reduce((sum, r) => sum + r.rowHeight, 0);
  const totalRowHeight = spec.hasTotalRow === false ? 0 : TABLE_STYLE.totalRowHeightMm;
  const totalHeight =
    TABLE_STYLE.titleRowHeightMm +
    TABLE_STYLE.headerRowHeightMm +
    dataHeight +
    totalRowHeight;

  return { colWidths, measuredRows, totalHeight };
}

function drawTitleAndHeader(doc, spec, colWidths, startX, startY) {
  let y = startY;

  // Title row spanning all columns
  doc.setFont(TABLE_STYLE.pdfFontFamily, 'bold');
  doc.setFontSize(TABLE_STYLE.titleFontPt);
  const titleLines = doc.splitTextToSize(spec.heading, A4.tableWidthMm - 2 * TABLE_STYLE.cellPaddingXMm);
  const titleHeight = Math.max(
    TABLE_STYLE.titleRowHeightMm,
    titleLines.length * (TABLE_STYLE.lineHeightMm + 0.5) + 2 * TABLE_STYLE.cellPaddingYMm
  );

  drawCell(doc, startX, y, A4.tableWidthMm, titleHeight, titleLines, {
    fillRgb: TABLE_STYLE.headerBgRgb,
    fontStyle: 'bold',
    fontSize: TABLE_STYLE.titleFontPt,
    align: 'center',
  });
  y += titleHeight;

  // Column header row (supports wrapping cleanly for narrow/many custom columns)
  doc.setFont(TABLE_STYLE.pdfFontFamily, 'bold');
  doc.setFontSize(TABLE_STYLE.headerFontPt);
  const headerCellLines = spec.columns.map((col, idx) => {
    const maxW = Math.max(4, colWidths[idx] - 2 * TABLE_STYLE.cellPaddingXMm);
    return doc.splitTextToSize(String(col.label), maxW);
  });
  const maxHeaderLines = Math.max(1, ...headerCellLines.map((l) => l.length));
  const headerHeight = Math.max(
    TABLE_STYLE.headerRowHeightMm,
    maxHeaderLines * TABLE_STYLE.lineHeightMm + 2 * TABLE_STYLE.cellPaddingYMm
  );

  let x = startX;
  spec.columns.forEach((_, idx) => {
    drawCell(doc, x, y, colWidths[idx], headerHeight, headerCellLines[idx], {
      fillRgb: TABLE_STYLE.headerBgRgb,
      fontStyle: 'bold',
      fontSize: TABLE_STYLE.headerFontPt,
      align: 'center',
    });
    x += colWidths[idx];
  });
  y += headerHeight;

  return y;
}

function drawTotalRow(doc, spec, colWidths, startX, y) {
  const h = TABLE_STYLE.totalRowHeightMm;
  let x = startX;

  if (spec.kind === 'custom') {
    if (!spec.totalCells) return y;
    spec.totalCells.forEach((cell, idx) => {
      drawCell(doc, x, y, colWidths[idx], h, cell.text ? [cell.text] : [], {
        fillRgb: TABLE_STYLE.cellBgRgb,
        fontStyle: cell.bold ? 'bold' : 'normal',
        fontSize: TABLE_STYLE.totalFontPt,
        align: 'center',
      });
      x += colWidths[idx];
    });
    return y + h;
  }

  if (spec.kind === 'fuel') {
    // Preserve vertical cell gridlines for SL NO, VEHICLE NO, STATUS as in the reference table
    const cells = [
      { text: [], bold: false },
      { text: [], bold: false },
      { text: [], bold: false },
      { text: ['TOTAL'], bold: true },
      { text: [spec.totalQuantity], bold: true },
      { text: [spec.totalAmount], bold: true },
    ];
    cells.forEach((cell, idx) => {
      drawCell(doc, x, y, colWidths[idx], h, cell.text, {
        fillRgb: TABLE_STYLE.cellBgRgb,
        fontStyle: cell.bold ? 'bold' : 'normal',
        fontSize: TABLE_STYLE.totalFontPt,
        align: 'center',
      });
      x += colWidths[idx];
    });
  } else {
    // Challan: preserve vertical cell gridlines for SL NO, VEHICLE NO, STATUS; TOTAL under DESCRIPTION; sum under AMOUNT
    const cells = [
      { text: [], bold: false },
      { text: [], bold: false },
      { text: [], bold: false },
      { text: ['TOTAL'], bold: true },
      { text: [spec.totalAmount], bold: true },
    ];
    cells.forEach((cell, idx) => {
      drawCell(doc, x, y, colWidths[idx], h, cell.text, {
        fillRgb: TABLE_STYLE.cellBgRgb,
        fontStyle: cell.bold ? 'bold' : 'normal',
        fontSize: TABLE_STYLE.totalFontPt,
        align: 'center',
      });
      x += colWidths[idx];
    });
  }

  return y + h;
}

function drawTableWithPagination(doc, spec, measured, startX, startY) {
  const maxY = A4.heightMm - A4.marginBottomMm;
  let y = drawTitleAndHeader(doc, spec, measured.colWidths, startX, startY);

  measured.measuredRows.forEach((row) => {
    if (y + row.rowHeight > maxY) {
      doc.addPage('a4', 'portrait');
      y = drawTitleAndHeader(doc, spec, measured.colWidths, startX, A4.marginTopMm);
    }

    let x = startX;
    spec.columns.forEach((col, colIdx) => {
      drawCell(doc, x, y, measured.colWidths[colIdx], row.rowHeight, row.cellLines[colIdx], {
        fillRgb: TABLE_STYLE.cellBgRgb,
        fontStyle: 'normal',
        fontSize: TABLE_STYLE.bodyFontPt,
        align: col.align,
      });
      x += measured.colWidths[colIdx];
    });
    y += row.rowHeight;
  });

  if (spec.hasTotalRow !== false) {
    if (y + TABLE_STYLE.totalRowHeightMm > maxY) {
      doc.addPage('a4', 'portrait');
      y = drawTitleAndHeader(doc, spec, measured.colWidths, startX, A4.marginTopMm);
    }
    y = drawTotalRow(doc, spec, measured.colWidths, startX, y);
  }
  return y;
}

function buildFileName(wingName, mode, isoDate, customLabel) {
  const cleanWing = (wingName || 'REPORT')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'REPORT';
  let modeLabel = mode === 'both' ? 'FUEL_CHALLAN' : mode.toUpperCase();
  if (mode === 'custom' && customLabel && customLabel.trim()) {
    modeLabel = customLabel
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'CUSTOM';
  }
  const datePart = formatDateDDMMYYYY(isoDate) || 'DATE';
  return `${cleanWing}_${modeLabel}_${datePart}.pdf`;
}

export function buildReportPdfDoc({
  mode,
  wingName,
  date,
  dieselRate,
  fuelRows,
  challanRows,
  customTable,
}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const startX = (A4.widthMm - A4.tableWidthMm) / 2;

  if (mode === 'custom' && customTable) {
    const customSummary = computeCustomSummary(customTable);
    const customSpec = {
      kind: 'custom',
      heading: buildTableHeading(wingName, customTable.label, date),
      columns: customSummary.columns,
      rows: customSummary.rows,
      totalCells: customSummary.totalCells,
      hasTotalRow: Boolean(customSummary.totalCells),
    };
    const customMeasured = measureTable(doc, customSpec);
    drawTableWithPagination(doc, customSpec, customMeasured, startX, A4.marginTopMm);

    const filename = buildFileName(wingName, mode, date, customTable.label);
    return { doc, filename };
  }

  const includeFuel = mode === 'fuel' || mode === 'both';
  const includeChallan = mode === 'challan' || mode === 'both';

  const fuelSummary = includeFuel ? computeFuelSummary(fuelRows, dieselRate) : null;
  const challanSummary = includeChallan ? computeChallanSummary(challanRows) : null;

  const fuelSpec = includeFuel
    ? {
        kind: 'fuel',
        heading: buildTableHeading(wingName, 'FUEL', date),
        columns: FUEL_COLUMNS,
        rows: fuelSummary.rows,
        totalQuantity: fuelSummary.totalQuantity,
        totalAmount: fuelSummary.totalAmount,
      }
    : null;

  const challanSpec = includeChallan
    ? {
        kind: 'challan',
        heading: buildTableHeading(wingName, 'CHALLAN', date),
        columns: CHALLAN_COLUMNS,
        rows: challanSummary.rows,
        totalAmount: challanSummary.totalAmount,
      }
    : null;

  if (includeFuel && includeChallan) {
    const fuelMeasured = measureTable(doc, fuelSpec);
    const challanMeasured = measureTable(doc, challanSpec);
    const wantCombined = shouldCombineOnSinglePage(mode, fuelRows.length, challanRows.length);

    const halfPage = A4.heightMm / 2; // 148.5mm
    const fitsHalves =
      fuelMeasured.totalHeight <= halfPage - 20 &&
      challanMeasured.totalHeight <= halfPage - 20;
    const fitsBalanced =
      fuelMeasured.totalHeight + challanMeasured.totalHeight + 24 <= A4.heightMm - 28;

    if (wantCombined && (fitsHalves || fitsBalanced)) {
      let y1;
      let y2;
      if (fitsHalves) {
        // Center Fuel in upper half and Challan in lower half so the A4 sheet is balanced even if cut in two
        y1 = (halfPage - fuelMeasured.totalHeight) / 2;
        y2 = halfPage + (halfPage - challanMeasured.totalHeight) / 2;
      } else {
        const gap = (A4.heightMm - fuelMeasured.totalHeight - challanMeasured.totalHeight) / 3;
        y1 = gap;
        y2 = gap + fuelMeasured.totalHeight + gap;
      }

      drawTableWithPagination(doc, fuelSpec, fuelMeasured, startX, y1);
      drawTableWithPagination(doc, challanSpec, challanMeasured, startX, y2);
    } else {
      // 4 or more vehicles (or wrapped text too tall): separate A4 pages
      drawTableWithPagination(doc, fuelSpec, fuelMeasured, startX, A4.marginTopMm);
      doc.addPage('a4', 'portrait');
      drawTableWithPagination(doc, challanSpec, challanMeasured, startX, A4.marginTopMm);
    }
  } else if (includeFuel) {
    const fuelMeasured = measureTable(doc, fuelSpec);
    drawTableWithPagination(doc, fuelSpec, fuelMeasured, startX, A4.marginTopMm);
  } else if (includeChallan) {
    const challanMeasured = measureTable(doc, challanSpec);
    drawTableWithPagination(doc, challanSpec, challanMeasured, startX, A4.marginTopMm);
  }

  const filename = buildFileName(wingName, mode, date);
  return { doc, filename };
}

export function generateReportPdf(params) {
  const { doc, filename } = buildReportPdfDoc(params);
  const pdfName = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;

  if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
    const pdfBlob = new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = pdfName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  } else {
    doc.save(pdfName);
  }

  return pdfName;
}
