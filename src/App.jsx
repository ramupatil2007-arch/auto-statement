import React, { useState } from 'react';
import { DEFAULT_STATUS, DIESEL_RATE_DISPLAY } from './constants';
import { getTodayIso } from './utils/format';
import { generateReportPdf } from './utils/pdfGenerator';
import VehicleSection from './components/VehicleSection';
import CustomTableSection from './components/CustomTableSection';
import TablePreview from './components/TablePreview';

const INITIAL_FUEL_ROWS = [
  { id: 'fuel-1', vehicleNo: '', status: DEFAULT_STATUS, amount: '' },
];

const INITIAL_CHALLAN_ROWS = [
  { id: 'challan-1', vehicleNo: '', status: DEFAULT_STATUS, description: '', amount: '' },
];

const INITIAL_CUSTOM_TABLE = {
  label: 'CUSTOM',
  autoSlNo: true,
  showTotal: true,
  columns: [
    { name: 'SL NO', isSum: false },
    { name: 'VEHICLE NO', isSum: false },
    { name: 'DETAILS', isSum: false },
    { name: 'AMOUNT', isSum: true },
  ],
  rows: [{ id: 'custom-1', cells: ['', '', '', ''] }],
};

export default function App() {
  const [mode, setMode] = useState('both');
  const [wingName, setWingName] = useState('');
  const [date, setDate] = useState(getTodayIso);
  const [dieselRate, setDieselRate] = useState(DIESEL_RATE_DISPLAY);
  const [fuelRows, setFuelRows] = useState(INITIAL_FUEL_ROWS);
  const [challanRows, setChallanRows] = useState(INITIAL_CHALLAN_ROWS);
  const [customTable, setCustomTable] = useState(INITIAL_CUSTOM_TABLE);
  const [downloadMessage, setDownloadMessage] = useState('');

  const showFuel = mode === 'fuel' || mode === 'both';
  const showChallan = mode === 'challan' || mode === 'both';
  const showCustom = mode === 'custom';

  const handleDownloadPdf = () => {
    const filename = generateReportPdf({
      mode,
      wingName,
      date,
      dieselRate,
      fuelRows,
      challanRows,
      customTable,
    });
    setDownloadMessage(`Downloaded ${filename}`);
    window.setTimeout(() => setDownloadMessage(''), 3500);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <h1 className="app-title">CHALLAN GENERATOR</h1>
        </div>
        <div className="topbar-right">
          {downloadMessage && <span className="download-feedback">{downloadMessage}</span>}
          <button
            type="button"
            className="btn btn-download"
            onClick={handleDownloadPdf}
          >
            <svg
              className="download-icon"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M10 3a.75.75 0 01.75.75v7.69l2.47-2.47a.75.75 0 111.06 1.06l-3.75 3.75a.75.75 0 01-1.06 0L5.72 10.03a.75.75 0 111.06-1.06l2.47 2.47V3.75A.75.75 0 0110 3z" />
              <path d="M3.5 14.75a.75.75 0 01.75.75v.75c0 .414.336.75.75.75h10a.75.75 0 00.75-.75v-.75a.75.75 0 011.5 0v.75A2.25 2.25 0 0115 17.75H5a2.25 2.25 0 01-2.25-2.25v-.75a.75.75 0 01.75-.75z" />
            </svg>
            Download PDF
          </button>
        </div>
      </header>

      <main className="main-grid">
        <div className="input-column">
          <section className="card">
            <h2 className="section-title">Report Details</h2>

            <div className="field-group">
              <span className="field-label">Table Selection</span>
              <div className="segmented-control segmented-4" role="radiogroup" aria-label="Table Selection">
                {[
                  { value: 'fuel', label: 'Fuel Only' },
                  { value: 'challan', label: 'Challan Only' },
                  { value: 'both', label: 'Both' },
                  { value: 'custom', label: 'Custom Table' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={mode === opt.value}
                    className={`segment-btn ${mode === opt.value ? 'active' : ''}`}
                    onClick={() => setMode(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="two-col-fields">
              <div className="field-group">
                <label className="field-label" htmlFor="wing-name">
                  Wing Name
                </label>
                <input
                  id="wing-name"
                  type="text"
                  className="text-input"
                  value={wingName}
                  placeholder="e.g. SCHOOL WING"
                  onChange={(e) => setWingName(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="report-date">
                  Date
                </label>
                <input
                  id="report-date"
                  type="date"
                  className="text-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
          </section>

          {showFuel && (
            <VehicleSection
              kind="fuel"
              title="Fuel (Diesel) Table"
              rows={fuelRows}
              onChangeRows={setFuelRows}
              dieselRate={dieselRate}
              onChangeDieselRate={setDieselRate}
            />
          )}

          {showChallan && (
            <VehicleSection
              kind="challan"
              title="Challan Table"
              rows={challanRows}
              onChangeRows={setChallanRows}
            />
          )}

          {showCustom && (
            <CustomTableSection
              customTable={customTable}
              onChangeCustomTable={setCustomTable}
            />
          )}
        </div>

        <aside className="preview-column">
          <TablePreview
            mode={mode}
            wingName={wingName}
            date={date}
            dieselRate={dieselRate}
            fuelRows={fuelRows}
            challanRows={challanRows}
            customTable={customTable}
          />
        </aside>
      </main>
    </div>
  );
}
