export const DIESEL_RATE = 98.80;
export const DIESEL_RATE_DISPLAY = '98.80';
export const DEFAULT_STATUS = 'RUNNING';
export const QUANTITY_SUFFIX = ' L';
export const COMBINED_PAGE_MAX_ROWS = 3; // Fewer than 4 vehicles => combined on one A4 page

// Single source of truth for table visual styling (matched directly from uploaded reference tables)
export const TABLE_STYLE = {
  headerBgHex: '#D3DDE6',
  headerBgRgb: [211, 221, 230],
  cellBgHex: '#FFFFFF',
  cellBgRgb: [255, 255, 255],
  borderHex: '#000000',
  borderRgb: [0, 0, 0],
  textHex: '#000000',
  textRgb: [0, 0, 0],
  borderWidthMm: 0.25,
  fontFamilyCss: 'Arial, Helvetica, sans-serif',
  pdfFontFamily: 'helvetica',
  titleFontPt: 11,
  headerFontPt: 9.5,
  bodyFontPt: 9.5,
  totalFontPt: 9.5,
  titleRowHeightMm: 9,
  headerRowHeightMm: 9,
  minDataRowHeightMm: 8.5,
  totalRowHeightMm: 9,
  cellPaddingXMm: 2,
  cellPaddingYMm: 1.8,
  lineHeightMm: 4.2,
};

// A4 dimensions in millimeters (classic Word/print margins matching reference screenshots)
export const A4 = {
  widthMm: 210,
  heightMm: 297,
  marginXMm: 21,
  marginTopMm: 24,
  marginBottomMm: 20,
  tableWidthMm: 168, // 210 - 2 * 21
};

// Column proportions matched to the uploaded reference tables (summing to 100%)
export const FUEL_COLUMNS = [
  { key: 'slNo', label: 'SL NO', widthPct: 9, align: 'center', nowrap: true },
  { key: 'vehicleNo', label: 'VEHICLE NO', widthPct: 22, align: 'center', nowrap: true },
  { key: 'status', label: 'STATUS', widthPct: 18, align: 'center', nowrap: true },
  { key: 'rate', label: 'D/RATE', widthPct: 13, align: 'center', nowrap: true },
  { key: 'quantity', label: 'QUANTITY', widthPct: 19, align: 'center', nowrap: true },
  { key: 'amount', label: 'AMOUNT', widthPct: 19, align: 'center', nowrap: true },
];

export const CHALLAN_COLUMNS = [
  { key: 'slNo', label: 'SL NO', widthPct: 9, align: 'center', nowrap: true },
  { key: 'vehicleNo', label: 'VEHICLE NO', widthPct: 22, align: 'center', nowrap: true },
  { key: 'status', label: 'STATUS', widthPct: 18, align: 'center', nowrap: true },
  { key: 'description', label: 'DESCRIPTION', widthPct: 33, align: 'center', nowrap: false },
  { key: 'amount', label: 'AMOUNT', widthPct: 18, align: 'center', nowrap: true },
];
