# CHALLAN GENERATOR

Simple, print-ready A4 PDF generator for Fuel (Diesel), Challan, and Custom tables.

## Features

- **Fuel (Diesel) Table:** 6 columns (`SL NO`, `VEHICLE NO`, `STATUS`, `D/RATE`, `QUANTITY`, `AMOUNT`) with editable diesel rate (default `98.80`), auto-calculated `QUANTITY` (`AMOUNT ÷ D/RATE` to 3 decimal places + ` L`), and `TOTAL` row.
- **Challan Table:** 5 columns (`SL NO`, `VEHICLE NO`, `STATUS`, `DESCRIPTION`, `AMOUNT`) with `TOTAL` row.
- **Custom Table:** Customize number of columns (1–10), column headings, auto-numbering, and summed total columns.
- **Fast Data Entry:** Manual editing, copy-paste vehicle number lists, same-value auto-fill for non-vehicle columns, and photo OCR (`tesseract.js`).
- **A4 PDF Export:** Combines Fuel + Challan on 1 balanced A4 page when each has fewer than 4 vehicles; splits onto separate A4 pages when 4 or more vehicles are entered.

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
