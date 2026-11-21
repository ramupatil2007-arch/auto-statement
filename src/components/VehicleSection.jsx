import React, { useRef, useState } from 'react';
import { DEFAULT_STATUS, DIESEL_RATE_DISPLAY } from '../constants';
import {
  calculateFuelQuantity,
  formatQuantityValue,
  parseNumericAmount,
  resolveDieselRate,
} from '../utils/format';
import { extractTextFromImage } from '../utils/ocr';
import { parseVehicleText } from '../utils/parser';

function createRowWithDefaults(kind, defaults) {
  const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const status = defaults?.status?.trim() || DEFAULT_STATUS;
  const amount = defaults?.amount ?? '';
  if (kind === 'challan') {
    return {
      id,
      vehicleNo: '',
      status,
      description: defaults?.description ?? '',
      amount,
    };
  }
  return { id, vehicleNo: '', status, amount };
}

function isRowBlank(row, kind) {
  if (kind === 'challan') {
    return !row.vehicleNo.trim() && !row.description.trim() && !String(row.amount).trim();
  }
  return !row.vehicleNo.trim() && !String(row.amount).trim();
}

export default function VehicleSection({
  kind,
  title,
  rows,
  onChangeRows,
  dieselRate,
  onChangeDieselRate,
}) {
  const isFuel = kind === 'fuel';

  // Common values for all non-vehicle columns (auto-applied to rest of table)
  const [autoFillAll, setAutoFillAll] = useState(true);
  const [commonStatus, setCommonStatus] = useState(DEFAULT_STATUS);
  const [commonDescription, setCommonDescription] = useState('');
  const [commonAmount, setCommonAmount] = useState('');

  // Quick paste box for vehicle numbers
  const [pasteText, setPasteText] = useState('');
  const [pasteFeedback, setPasteFeedback] = useState('');

  // OCR state
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrError, setOcrError] = useState('');
  const [ocrRawText, setOcrRawText] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef(null);

  const currentDefaults = {
    status: commonStatus || DEFAULT_STATUS,
    description: commonDescription,
    amount: commonAmount,
  };

  const applyCommonFieldToRows = (field, value) => {
    const next = rows.map((row) => ({ ...row, [field]: value }));
    onChangeRows(next);
  };

  const handleCommonStatusChange = (val) => {
    setCommonStatus(val);
    if (autoFillAll) {
      applyCommonFieldToRows('status', val);
    }
  };

  const handleCommonDescriptionChange = (val) => {
    setCommonDescription(val);
    if (autoFillAll) {
      applyCommonFieldToRows('description', val);
    }
  };

  const handleCommonAmountChange = (val) => {
    setCommonAmount(val);
    if (autoFillAll) {
      applyCommonFieldToRows('amount', val);
    }
  };

  const handleApplyAllNow = () => {
    const next = rows.map((row) => ({
      ...row,
      status: commonStatus || DEFAULT_STATUS,
      ...(isFuel ? {} : { description: commonDescription }),
      amount: commonAmount,
    }));
    onChangeRows(next);
  };

  const handleToggleAutoFill = (checked) => {
    setAutoFillAll(checked);
    if (checked) {
      const next = rows.map((row) => ({
        ...row,
        status: commonStatus || row.status || DEFAULT_STATUS,
        ...(isFuel
          ? {}
          : { description: commonDescription !== '' ? commonDescription : row.description }),
        amount: commonAmount !== '' ? commonAmount : row.amount,
      }));
      onChangeRows(next);
    }
  };

  const updateRowField = (index, field, value) => {
    const next = rows.map((row, idx) =>
      idx === index ? { ...row, [field]: value } : row
    );
    onChangeRows(next);
  };

  const addRow = () => {
    onChangeRows([
      ...rows,
      createRowWithDefaults(kind, autoFillAll ? currentDefaults : { status: DEFAULT_STATUS }),
    ]);
  };

  const removeRow = (index) => {
    if (rows.length <= 1) {
      onChangeRows([
        createRowWithDefaults(kind, autoFillAll ? currentDefaults : { status: DEFAULT_STATUS }),
      ]);
      return;
    }
    onChangeRows(rows.filter((_, idx) => idx !== index));
  };

  const clearRows = () => {
    onChangeRows([
      createRowWithDefaults(kind, autoFillAll ? currentDefaults : { status: DEFAULT_STATUS }),
    ]);
    setOcrRawText('');
    setOcrError('');
    setOcrStatus('');
    setPasteFeedback('');
  };

  const mergeParsedRows = (parsedItems) => {
    if (!parsedItems.length) return 0;
    const mapped = parsedItems.map((item) => {
      const base = createRowWithDefaults(
        kind,
        autoFillAll ? currentDefaults : { status: DEFAULT_STATUS }
      );
      return {
        ...base,
        vehicleNo: item.vehicleNo || '',
        status: item.status || base.status,
        ...(isFuel
          ? {}
          : { description: item.description || base.description }),
        amount: item.amount !== '' && item.amount !== undefined ? item.amount : base.amount,
      };
    });
    const existingNonBlank = rows.filter((r) => !isRowBlank(r, kind));
    onChangeRows([...existingNonBlank, ...mapped]);
    return mapped.length;
  };

  const handleAddPastedVehicles = (rawTextOverride) => {
    const sourceText = typeof rawTextOverride === 'string' ? rawTextOverride : pasteText;
    const parsed = parseVehicleText(sourceText, kind, { dieselRate });
    if (parsed.length === 0) {
      setOcrError('No vehicle numbers found. Paste one vehicle per line (e.g., KA51-C-4461).');
      setPasteFeedback('');
      return;
    }
    setOcrError('');
    const count = mergeParsedRows(parsed);
    setPasteText('');
    setPasteFeedback(`Added ${count} vehicle${count === 1 ? '' : 's'}.`);
    window.setTimeout(() => setPasteFeedback(''), 3000);
  };

  const handlePasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setOcrError('Clipboard button is unavailable in this browser. Click inside the box and press Ctrl+V.');
        return;
      }
      const clipText = await navigator.clipboard.readText();
      if (!clipText || !clipText.trim()) {
        setOcrError('Clipboard is empty. Copy vehicle numbers first, then click Paste.');
        return;
      }
      setOcrError('');
      setPasteText(clipText);
      handleAddPastedVehicles(clipText);
    } catch {
      setOcrError('Browser blocked clipboard access. Click inside the paste box and press Ctrl+V.');
    }
  };

  // Allow pasting a multi-line list of vehicle numbers directly into any Vehicle No cell
  const handleVehicleCellPaste = (event, rowIndex) => {
    const pasted = event.clipboardData?.getData('text') || '';
    if (!pasted.includes('\n') && !pasted.includes('\r') && !pasted.includes(',')) {
      return; // Let normal single-value paste work
    }
    const parsed = parseVehicleText(pasted, kind, { dieselRate });
    if (parsed.length <= 1) return;

    event.preventDefault();
    const mapped = parsed.map((item) => {
      const base = createRowWithDefaults(
        kind,
        autoFillAll ? currentDefaults : { status: DEFAULT_STATUS }
      );
      return {
        ...base,
        vehicleNo: item.vehicleNo || '',
        status: item.status || base.status,
        ...(isFuel ? {} : { description: item.description || base.description }),
        amount: item.amount !== '' && item.amount !== undefined ? item.amount : base.amount,
      };
    });

    const before = rows.slice(0, rowIndex);
    const after = rows.slice(rowIndex + 1);
    onChangeRows([...before, ...mapped, ...after]);
    setPasteFeedback(`Pasted ${mapped.length} vehicles.`);
    window.setTimeout(() => setPasteFeedback(''), 3000);
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
        const label = status.replace(/_/g, ' ');
        setOcrStatus(pct !== null ? `${label} (${pct}%)` : label);
      });

      setOcrRawText(text.trim());
      const parsed = parseVehicleText(text, kind, { dieselRate });

      if (parsed.length > 0) {
        const count = mergeParsedRows(parsed);
        setOcrStatus(`Extracted ${count} row${count === 1 ? '' : 's'}. Review and edit below before generating PDF.`);
      } else {
        setOcrStatus('');
        setOcrError('OCR finished, but no vehicle lines were auto-matched. Edit the extracted text below and click "Parse Extracted Text".');
      }
    } catch (err) {
      setOcrStatus('');
      setOcrError(`OCR failed: ${err?.message || 'Could not read image.'}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleReparseOcrText = () => {
    const parsed = parseVehicleText(ocrRawText, kind, { dieselRate });
    if (parsed.length === 0) {
      setOcrError('No entries matched. Ensure each line has a vehicle number.');
      return;
    }
    setOcrError('');
    const count = mergeParsedRows(parsed);
    setOcrStatus(`Added ${count} row${count === 1 ? '' : 's'} from extracted text.`);
  };

  const activeRateDisplay = resolveDieselRate(dieselRate).toFixed(2);

  return (
    <section className="card">
      <div className="section-header">
        <div>
          <h2 className="section-title">{title}</h2>
          <p className="section-subtitle">
            {rows.length} {rows.length === 1 ? 'vehicle' : 'vehicles'}
            {isFuel ? ` • D/Rate: ${activeRateDisplay}` : ''}
          </p>
        </div>
        <div className="section-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
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

      {/* Same value for all non-vehicle columns + Editable Diesel Rate */}
      <div className="autofill-box">
        <div className="autofill-header">
          <label className="checkbox-label autofill-toggle">
            <input
              type="checkbox"
              checked={autoFillAll}
              onChange={(e) => handleToggleAutoFill(e.target.checked)}
            />
            <strong>Same value for all rows</strong>
            <span className="muted-hint">(auto-fills all columns except Vehicle No)</span>
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleApplyAllNow}
          >
            Apply to All
          </button>
        </div>

        <div className={`autofill-grid ${isFuel ? 'autofill-grid-3' : 'autofill-grid-3'}`}>
          <div className="mini-field">
            <label className="mini-label">Status (All)</label>
            <input
              type="text"
              className="cell-input"
              value={commonStatus}
              placeholder="RUNNING"
              onChange={(e) => handleCommonStatusChange(e.target.value)}
            />
          </div>

          {isFuel ? (
            <div className="mini-field">
              <label className="mini-label">D/Rate (Default {DIESEL_RATE_DISPLAY})</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="cell-input"
                value={dieselRate}
                placeholder={DIESEL_RATE_DISPLAY}
                onChange={(e) => onChangeDieselRate(e.target.value)}
              />
            </div>
          ) : (
            <div className="mini-field">
              <label className="mini-label">Description (All)</label>
              <input
                type="text"
                className="cell-input"
                value={commonDescription}
                placeholder="e.g. SCHOOL WING CHALLAN"
                onChange={(e) => handleCommonDescriptionChange(e.target.value)}
              />
            </div>
          )}

          <div className="mini-field">
            <label className="mini-label">Amount (All)</label>
            <input
              type="number"
              step="any"
              min="0"
              className="cell-input"
              value={commonAmount}
              placeholder={isFuel ? 'e.g. 4500' : 'e.g. 1150'}
              onChange={(e) => handleCommonAmountChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Always-visible Paste Box for Vehicle Numbers */}
      <div className="paste-vehicles-box">
        <div className="paste-vehicles-header">
          <label className="tool-label" style={{ marginBottom: 0 }}>
            Paste Vehicle Numbers (copy &amp; paste from WhatsApp / Excel / Notes)
          </label>
          <div className="paste-header-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handlePasteFromClipboard}
            >
              Paste from Clipboard
            </button>
          </div>
        </div>
        <textarea
          className="textarea"
          rows={3}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={'KA51-C-4461\nKA51-C-4682\nKA51-D-3465'}
        />
        <div className="tool-box-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!pasteText.trim()}
            onClick={() => handleAddPastedVehicles()}
          >
            Add Pasted Vehicles
          </button>
          {pasteText && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPasteText('')}
            >
              Clear Box
            </button>
          )}
          {pasteFeedback && <span className="inline-success">{pasteFeedback}</span>}
        </div>
      </div>

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
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleReparseOcrText}>
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
              <th style={{ width: '40px' }}>SL</th>
              <th>Vehicle No</th>
              <th style={{ width: '105px' }}>Status</th>
              {!isFuel && <th>Description</th>}
              <th style={{ width: '100px' }}>Amount</th>
              {isFuel && <th style={{ width: '94px' }}>Qty (Auto)</th>}
              <th style={{ width: '34px' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const amountNum = parseNumericAmount(row.amount);
              const qtyText =
                amountNum !== null
                  ? formatQuantityValue(calculateFuelQuantity(amountNum, dieselRate))
                  : '—';

              return (
                <tr key={row.id}>
                  <td className="sl-cell">{idx + 1}</td>
                  <td>
                    <input
                      type="text"
                      className="cell-input"
                      value={row.vehicleNo}
                      placeholder="e.g. KA51-C-4461"
                      onPaste={(e) => handleVehicleCellPaste(e, idx)}
                      onChange={(e) => updateRowField(idx, 'vehicleNo', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="cell-input"
                      value={row.status}
                      placeholder="RUNNING"
                      onChange={(e) => updateRowField(idx, 'status', e.target.value)}
                    />
                  </td>
                  {!isFuel && (
                    <td>
                      <input
                        type="text"
                        className="cell-input"
                        value={row.description}
                        placeholder="e.g. DSA CASE"
                        onChange={(e) => updateRowField(idx, 'description', e.target.value)}
                      />
                    </td>
                  )}
                  <td>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      className="cell-input"
                      value={row.amount}
                      placeholder="0"
                      onChange={(e) => updateRowField(idx, 'amount', e.target.value)}
                    />
                  </td>
                  {isFuel && <td className="auto-cell">{qtyText}</td>}
                  <td>
                    <button
                      type="button"
                      className="btn-icon"
                      title="Remove row"
                      aria-label="Remove row"
                      onClick={() => removeRow(idx)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="section-footer">
        <button type="button" className="btn btn-secondary btn-sm" onClick={addRow}>
          + Add Vehicle
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clearRows}>
          Clear Table
        </button>
      </div>
    </section>
  );
}
