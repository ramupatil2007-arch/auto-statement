import React, { useRef, useState } from 'react';
import { extractTextFromImage } from '../utils/ocr';

const MIN_COLS = 1;
const MAX_COLS = 10;

function createEmptyCustomRow(colCount) {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    cells: Array.from({ length: colCount }, () => ''),
  };
}

function isCustomRowBlank(row, autoSlNo) {
  return row.cells.every((val, idx) => {
    if (autoSlNo && idx === 0) return true;
    return !String(val || '').trim();
  });
}

function parseCustomLines(text, colCount, autoSlNo) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const editableStart = autoSlNo ? 1 : 0;
  const editableCount = Math.max(1, colCount - editableStart);
  const parsed = [];

  for (const line of lines) {
    if (/^\s*TOTAL\b/i.test(line)) continue;

    let parts;
    if (line.includes('\t')) {
      parts = line.split('\t').map((p) => p.trim());
    } else if (line.includes('|')) {
      parts = line.split('|').map((p) => p.trim()).filter((_, i, arr) => !(i === 0 && !arr[0]));
    } else if (line.includes(',')) {
      parts = line.split(',').map((p) => p.trim());
    } else {
      parts = line.split(/\s+/);
    }

    parts = parts.filter((p) => p !== '');
    if (parts.length === 0) continue;

    // Strip leading serial number if autoSlNo is on and user pasted a serial column too
    if (autoSlNo && parts.length > editableCount && /^\d{1,3}\.?$/.test(parts[0])) {
      parts = parts.slice(1);
    }

    const cells = Array.from({ length: colCount }, () => '');
    for (let i = 0; i < editableCount; i++) {
      if (i === editableCount - 1 && parts.length > editableCount) {
        cells[editableStart + i] = parts.slice(i).join(' ');
      } else {
        cells[editableStart + i] = parts[i] ?? '';
      }
    }
    parsed.push({
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      cells,
    });
  }

  return parsed;
}

export default function CustomTableSection({ customTable, onChangeCustomTable }) {
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrError, setOcrError] = useState('');
  const [ocrRawText, setOcrRawText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef(null);

  const { label, autoSlNo, showTotal, columns, rows } = customTable;
  const colCount = columns.length;

  const updateField = (patch) => {
    onChangeCustomTable({ ...customTable, ...patch });
  };

  const setColumnCount = (nextCountRaw) => {
    const nextCount = Math.max(MIN_COLS, Math.min(MAX_COLS, Number(nextCountRaw) || MIN_COLS));
    if (nextCount === colCount) return;

    let nextColumns;
    if (nextCount > colCount) {
      const added = Array.from({ length: nextCount - colCount }, (_, idx) => ({
        name: `COLUMN ${colCount + idx + 1}`,
        isSum: false,
      }));
      nextColumns = [...columns, ...added];
    } else {
      nextColumns = columns.slice(0, nextCount);
    }

    const nextRows = rows.map((row) => {
      const cells = Array.from({ length: nextCount }, (_, idx) => row.cells[idx] ?? '');
      return { ...row, cells };
    });

    updateField({ columns: nextColumns, rows: nextRows });
  };

  const updateColumn = (colIdx, patch) => {
    const nextColumns = columns.map((col, idx) =>
      idx === colIdx ? { ...col, ...patch } : col
    );
    updateField({ columns: nextColumns });
  };

  const updateCell = (rowIdx, colIdx, value) => {
    const nextRows = rows.map((row, idx) => {
      if (idx !== rowIdx) return row;
      const nextCells = [...row.cells];
      nextCells[colIdx] = value;
      return { ...row, cells: nextCells };
    });
    updateField({ rows: nextRows });
  };

  const addRow = () => {
    updateField({ rows: [...rows, createEmptyCustomRow(colCount)] });
  };

  const removeRow = (rowIdx) => {
    if (rows.length <= 1) {
      updateField({ rows: [createEmptyCustomRow(colCount)] });
      return;
    }
    updateField({ rows: rows.filter((_, idx) => idx !== rowIdx) });
  };

  const clearRows = () => {
    updateField({ rows: [createEmptyCustomRow(colCount)] });
    setOcrRawText('');
    setOcrError('');
    setOcrStatus('');
  };

  const mergeParsedRows = (parsedRows) => {
    if (!parsedRows.length) return 0;
    const existingNonBlank = rows.filter((r) => !isCustomRowBlank(r, autoSlNo));
    updateField({ rows: [...existingNonBlank, ...parsedRows] });
    return parsedRows.length;
  };

  const handleApplyPaste = () => {
    const parsed = parseCustomLines(pasteText, colCount, autoSlNo);
    if (!parsed.length) {
      setOcrError('No lines found. Separate column values using tabs, commas, or spaces.');
      return;
    }
    setOcrError('');
    mergeParsedRows(parsed);
    setPasteText('');
    setShowPaste(false);
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIsScanning(true);
    setOcrError('');
    setOcrStatus('Preparing image...');

    try {
      const text = await extractTextFromImage(file, (status, pct) => {
        const cleanStatus = status.replace(/_/g, ' ');
        setOcrStatus(pct !== null ? `${cleanStatus} (${pct}%)` : cleanStatus);
      });
      setOcrRawText(text.trim());
      const parsed = parseCustomLines(text, colCount, autoSlNo);
      if (parsed.length > 0) {
        const count = mergeParsedRows(parsed);
        setOcrStatus(`Extracted ${count} row${count === 1 ? '' : 's'}. Review and edit below before generating PDF.`);
      } else {
        setOcrStatus('');
        setOcrError('OCR finished, but no rows were matched. Edit the extracted text below and click "Parse Extracted Text".');
      }
    } catch (err) {
      setOcrStatus('');
      setOcrError(`OCR failed: ${err?.message || 'Could not read image.'}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleReparseOcr = () => {
    const parsed = parseCustomLines(ocrRawText, colCount, autoSlNo);
    if (!parsed.length) {
      setOcrError('No rows could be parsed from the text.');
      return;
    }
    setOcrError('');
    const count = mergeParsedRows(parsed);
    setOcrStatus(`Added ${count} row${count === 1 ? '' : 's'} from extracted text.`);
  };

  return (
    <section className="card">
      <div className="section-header">
        <div>
          <h2 className="section-title">Custom Table</h2>
          <p className="section-subtitle">
            {colCount} {colCount === 1 ? 'column' : 'columns'} • {rows.length}{' '}
            {rows.length === 1 ? 'row' : 'rows'}
          </p>
        </div>
        <div className="section-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowPaste((prev) => !prev)}
          >
            {showPaste ? 'Close Paste' : 'Paste List'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={isScanning}
            onClick={() => fileInputRef.current?.click()}
          >
            {isScanning ? 'Scanning...' : 'Upload Photo (OCR)'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden-input"
            onChange={handleImageUpload}
          />
        </div>
      </div>

      {/* Custom Table Configuration */}
      <div className="custom-config-bar">
        <div className="field-group" style={{ marginTop: 0 }}>
          <label className="field-label" htmlFor="custom-table-label">
            Table Label (in heading)
          </label>
          <input
            id="custom-table-label"
            type="text"
            className="text-input"
            value={label}
            placeholder="e.g. CHALLAN / TOLL / MAINTENANCE"
            onChange={(e) => updateField({ label: e.target.value })}
          />
        </div>

        <div className="field-group" style={{ marginTop: 0 }}>
          <span className="field-label">Number of Columns ({MIN_COLS}–{MAX_COLS})</span>
          <div className="stepper">
            <button
              type="button"
              className="btn btn-secondary stepper-btn"
              disabled={colCount <= MIN_COLS}
              onClick={() => setColumnCount(colCount - 1)}
              aria-label="Decrease columns"
            >
              −
            </button>
            <input
              type="number"
              min={MIN_COLS}
              max={MAX_COLS}
              className="text-input stepper-input"
              value={colCount}
              onChange={(e) => setColumnCount(e.target.value)}
              aria-label="Number of columns"
            />
            <button
              type="button"
              className="btn btn-secondary stepper-btn"
              disabled={colCount >= MAX_COLS}
              onClick={() => setColumnCount(colCount + 1)}
              aria-label="Increase columns"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="checkbox-row">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={autoSlNo}
            onChange={(e) => updateField({ autoSlNo: e.target.checked })}
          />
          Auto-number Column 1 (SL NO)
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showTotal}
            onChange={(e) => updateField({ showTotal: e.target.checked })}
          />
          Include TOTAL Row
        </label>
      </div>

      {/* Editable Column Names */}
      <div className="custom-cols-box">
        <span className="field-label">Column Headings</span>
        <div className="custom-cols-grid">
          {columns.map((col, idx) => (
            <div key={idx} className="custom-col-item">
              <input
                type="text"
                className="cell-input"
                value={col.name}
                placeholder={`COL ${idx + 1}`}
                onChange={(e) => updateColumn(idx, { name: e.target.value })}
              />
              {showTotal && !(autoSlNo && idx === 0) && (
                <label className="sum-toggle" title="Sum numeric values in this column in the TOTAL row">
                  <input
                    type="checkbox"
                    checked={Boolean(col.isSum)}
                    onChange={(e) => updateColumn(idx, { isSum: e.target.checked })}
                  />
                  Sum
                </label>
              )}
            </div>
          ))}
        </div>
      </div>

      {showPaste && (
        <div className="tool-box">
          <label className="tool-label">
            Paste rows (separate columns by Tab, Comma, or Space — one row per line)
          </label>
          <textarea
            className="textarea"
            rows={4}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="KA51-C-4461, RUNNING, TOLL, 500"
          />
          <div className="tool-box-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={handleApplyPaste}>
              Add Pasted Rows
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setPasteText('');
                setShowPaste(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {ocrStatus && <div className="notice notice-info">{ocrStatus}</div>}
      {ocrError && <div className="notice notice-error">{ocrError}</div>}

      {ocrRawText && (
        <details className="ocr-review" open={Boolean(ocrError)}>
          <summary>Review / Edit OCR Extracted Text</summary>
          <textarea
            className="textarea"
            rows={4}
            value={ocrRawText}
            onChange={(e) => setOcrRawText(e.target.value)}
          />
          <div className="tool-box-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleReparseOcr}>
              Parse Extracted Text
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setOcrRawText('')}
            >
              Dismiss
            </button>
          </div>
        </details>
      )}

      <div className="editor-table-wrap">
        <table className="editor-table">
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th key={idx} style={autoSlNo && idx === 0 ? { width: '48px' } : undefined}>
                  {(col.name || `COL ${idx + 1}`).toUpperCase()}
                </th>
              ))}
              <th style={{ width: '36px' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={row.id}>
                {columns.map((col, colIdx) =>
                  autoSlNo && colIdx === 0 ? (
                    <td key={colIdx} className="sl-cell">
                      {rowIdx + 1}
                    </td>
                  ) : (
                    <td key={colIdx}>
                      <input
                        type="text"
                        className="cell-input"
                        value={row.cells[colIdx] ?? ''}
                        placeholder={col.name || `Col ${colIdx + 1}`}
                        onChange={(e) => updateCell(rowIdx, colIdx, e.target.value)}
                      />
                    </td>
                  )
                )}
                <td>
                  <button
                    type="button"
                    className="btn-icon"
                    title="Remove row"
                    aria-label="Remove row"
                    onClick={() => removeRow(rowIdx)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-footer">
        <button type="button" className="btn btn-secondary btn-sm" onClick={addRow}>
          + Add Row
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clearRows}>
          Clear Table
        </button>
      </div>
    </section>
  );
}
