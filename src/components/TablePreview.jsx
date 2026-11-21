import React from 'react';
import {
  CHALLAN_COLUMNS,
  FUEL_COLUMNS,
  TABLE_STYLE,
} from '../constants';
import {
  buildTableHeading,
  computeChallanSummary,
  computeCustomSummary,
  computeFuelSummary,
  shouldCombineOnSinglePage,
} from '../utils/format';

function PreviewTable({
  kind,
  heading,
  columns,
  rows,
  totalQuantity,
  totalAmount,
  customTotalCells,
}) {
  return (
    <table className="ref-table">
      <colgroup>
        {columns.map((col) => (
          <col key={col.key} style={{ width: `${col.widthPct}%` }} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th
            colSpan={columns.length}
            className="ref-title-cell"
            style={{ backgroundColor: TABLE_STYLE.headerBgHex }}
          >
            {heading}
          </th>
        </tr>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className="ref-header-cell"
              style={{ backgroundColor: TABLE_STYLE.headerBgHex }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx}>
            {columns.map((col) => (
              <td
                key={col.key}
                className={`ref-data-cell ${col.nowrap ? 'ref-cell-nowrap' : ''}`}
              >
                {row[col.key]}
              </td>
            ))}
          </tr>
        ))}
        {kind === 'fuel' && (
          <tr>
            <td className="ref-data-cell" />
            <td className="ref-data-cell" />
            <td className="ref-data-cell" />
            <td className="ref-total-cell">TOTAL</td>
            <td className="ref-total-cell">{totalQuantity}</td>
            <td className="ref-total-cell">{totalAmount}</td>
          </tr>
        )}
        {kind === 'challan' && (
          <tr>
            <td className="ref-data-cell" />
            <td className="ref-data-cell" />
            <td className="ref-data-cell" />
            <td className="ref-total-cell">TOTAL</td>
            <td className="ref-total-cell">{totalAmount}</td>
          </tr>
        )}
        {kind === 'custom' && customTotalCells && (
          <tr>
            {customTotalCells.map((cell, idx) => (
              <td key={idx} className={cell.bold ? 'ref-total-cell' : 'ref-data-cell'}>
                {cell.text}
              </td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default function TablePreview({
  mode,
  wingName,
  date,
  dieselRate,
  fuelRows,
  challanRows,
  customTable,
}) {
  if (mode === 'custom' && customTable) {
    const customSummary = computeCustomSummary(customTable);
    return (
      <div className="preview-wrapper">
        <div className="preview-meta">
          <span className="preview-title">A4 PDF Preview</span>
          <span className="preview-badge">
            1 A4 Page — Custom ({customSummary.columns.length}{' '}
            {customSummary.columns.length === 1 ? 'column' : 'columns'})
          </span>
        </div>
        <div className="pages-stack">
          <div className="a4-sheet a4-sheet-single">
            <PreviewTable
              kind="custom"
              heading={buildTableHeading(wingName, customTable.label, date)}
              columns={customSummary.columns}
              rows={customSummary.rows}
              customTotalCells={customSummary.totalCells}
            />
          </div>
        </div>
      </div>
    );
  }

  const includeFuel = mode === 'fuel' || mode === 'both';
  const includeChallan = mode === 'challan' || mode === 'both';

  const fuelSummary = includeFuel ? computeFuelSummary(fuelRows, dieselRate) : null;
  const challanSummary = includeChallan ? computeChallanSummary(challanRows) : null;

  const combined = shouldCombineOnSinglePage(mode, fuelRows.length, challanRows.length);

  const fuelElement = includeFuel ? (
    <PreviewTable
      kind="fuel"
      heading={buildTableHeading(wingName, 'FUEL', date)}
      columns={FUEL_COLUMNS}
      rows={fuelSummary.rows}
      totalQuantity={fuelSummary.totalQuantity}
      totalAmount={fuelSummary.totalAmount}
    />
  ) : null;

  const challanElement = includeChallan ? (
    <PreviewTable
      kind="challan"
      heading={buildTableHeading(wingName, 'CHALLAN', date)}
      columns={CHALLAN_COLUMNS}
      rows={challanSummary.rows}
      totalAmount={challanSummary.totalAmount}
    />
  ) : null;

  let layoutNote = '1 A4 Page';
  if (includeFuel && includeChallan) {
    layoutNote = combined
      ? '1 A4 Page — Both tables combined (< 4 vehicles each)'
      : '2 A4 Pages — Separate pages (4 or more vehicles)';
  }

  return (
    <div className="preview-wrapper">
      <div className="preview-meta">
        <span className="preview-title">A4 PDF Preview</span>
        <span className="preview-badge">{layoutNote}</span>
      </div>

      <div className="pages-stack">
        {includeFuel && includeChallan && combined ? (
          <div className="a4-sheet a4-sheet-combined">
            <div className="a4-half">{fuelElement}</div>
            <div className="a4-half">{challanElement}</div>
          </div>
        ) : (
          <>
            {includeFuel && (
              <div className="a4-sheet a4-sheet-single">
                {fuelElement}
              </div>
            )}
            {includeChallan && (
              <div className="a4-sheet a4-sheet-single">
                {challanElement}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
