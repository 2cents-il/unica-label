import React, { useState, useEffect } from "react";
import jsPDF from "jspdf";
import Logo from "./unica-logo.png"; // place your logo in src folder

export default function App() {
  const [rows, setRows] = useState(11);
  const [cols, setCols] = useState(3);

  const [grid, setGrid] = useState(
    Array(rows).fill(Array(cols).fill(null))
  );

  const [settings, setSettings] = useState({
    pageWidth: 210,
    pageHeight: 297,
    offsetX: 10,
    offsetY: 10,
    rowSpacing: 2,
    colSpacing: 2,
    cellWidth: 51,
    cellHeight: 21,
  });

  const [profiles, setProfiles] = useState({});
  const [selectedProfile, setSelectedProfile] = useState("");

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("labelProfiles") || "{}");
    setProfiles(saved);
  }, []);

  useEffect(() => {
    const newGrid = Array(rows)
      .fill(0)
      .map((_, r) =>
        Array(cols)
          .fill(0)
          .map((_, c) => (grid[r] && grid[r][c] ? grid[r][c] : null))
      );
    setGrid(newGrid);
  }, [rows, cols]);

  const handleFileChange = (row, col, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const newGrid = grid.map((r, ri) =>
        r.map((c, ci) => (ri === row && ci === col ? reader.result : c))
      );
      setGrid(newGrid);
    };
    reader.readAsDataURL(file);
  };

  const generatePDF = () => {
    const doc = new jsPDF("p", "mm", "a4");
    const cellW = settings.cellWidth;
    const cellH = settings.cellHeight;

    grid.forEach((row, r) => {
      row.forEach((img, c) => {
        if (img) {
          let format = "PNG";
          if (img.toLowerCase().includes("jpeg") || img.toLowerCase().includes("jpg")) {
            format = "JPEG";
          }
          doc.addImage(
            img,
            format,
            settings.offsetX + c * (cellW + settings.colSpacing),
            settings.offsetY + r * (cellH + settings.rowSpacing),
            cellW,
            cellH
          );
        }
      });
    });
    return doc;
  };

  const handleDownloadPDF = () => {
    const doc = generatePDF();
    doc.save("labels.pdf");
  };

  const handlePrintPDF = () => {
    const doc = generatePDF();
    const pdfBlob = doc.output("bloburl");
    const printWindow = window.open(pdfBlob);
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  const saveProfile = () => {
    const name = prompt("Enter profile name:");
    if (!name) return;
    const newProfiles = {
      ...profiles,
      [name]: { settings, rows, cols },
    };
    setProfiles(newProfiles);
    localStorage.setItem("labelProfiles", JSON.stringify(newProfiles));
    setSelectedProfile(name);
  };

  const loadProfile = (name) => {
    const profile = profiles[name];
    if (!profile) return;
    setSettings(profile.settings);
    setRows(profile.rows);
    setCols(profile.cols);
    setSelectedProfile(name);
  };

  const previewWidthPx = 600;
  const scale = previewWidthPx / settings.pageWidth;

  return (
    <div className="min-h-screen p-6 bg-gray-100">
      {/* Header with logo and title */}
      <div className="flex items-center justify-center relative mb-6">
        <img src={Logo} alt="Unica Logo" className="absolute left-0 h-12" />
        <h1 className="text-3xl font-bold text-center">Unica Label Generator</h1>
      </div>

      {/* Profile Controls centered */}
      <div className="flex justify-center gap-4 mb-6">
        <select
          value={selectedProfile}
          onChange={(e) => loadProfile(e.target.value)}
          className="border p-1 rounded"
        >
          <option value="">Select profile...</option>
          {Object.keys(profiles).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          onClick={saveProfile}
          className="px-3 py-1 bg-blue-600 text-white rounded"
        >
          Save Profile
        </button>
      </div>

      {/* Settings */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          ["Page Width", "pageWidth"],
          ["Page Height", "pageHeight"],
          ["Offset X", "offsetX"],
          ["Offset Y", "offsetY"],
          ["Row Spacing", "rowSpacing"],
          ["Col Spacing", "colSpacing"],
          ["Cell Width", "cellWidth"],
          ["Cell Height", "cellHeight"],
          ["Rows", "rows"],
          ["Columns", "cols"],
        ].map(([label, key]) => (
          <div key={key}>
            <label className="block text-sm">{label}</label>
            <input
              type="number"
              value={key === "rows" ? rows : key === "cols" ? cols : settings[key]}
              onChange={(e) => {
                const val = Number(e.target.value);
                if (key === "rows") setRows(val);
                else if (key === "cols") setCols(val);
                else setSettings({ ...settings, [key]: val });
              }}
              className="w-full border p-1 rounded"
            />
          </div>
        ))}
      </div>

      {/* Preview */}
      <div
        className="relative border bg-gray-200 mx-auto"
        style={{
          width: `${settings.pageWidth * scale}px`,
          height: `${settings.pageHeight * scale}px`,
        }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => (
            <div
              key={`${r}-${c}`}
              onClick={() =>
                document.getElementById(`file-${r}-${c}`).click()
              }
              className="absolute border border-gray-400 flex items-center justify-center cursor-pointer bg-white overflow-hidden"
              style={{
                width: `${settings.cellWidth * scale}px`,
                height: `${settings.cellHeight * scale}px`,
                left: `${(settings.offsetX + c * (settings.cellWidth + settings.colSpacing)) * scale}px`,
                top: `${(settings.offsetY + r * (settings.cellHeight + settings.rowSpacing)) * scale}px`,
              }}
            >
              {cell ? (
                <img
                  src={cell}
                  alt="preview"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                <span className="text-xs text-gray-500">Click to add</span>
              )}
              <input
                type="file"
                id={`file-${r}-${c}`}
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(r, c, e)}
              />
            </div>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex gap-4 justify-center">
        <button
          onClick={handleDownloadPDF}
          className="px-4 py-2 bg-blue-600 text-white rounded shadow"
        >
          Download PDF
        </button>
        <button
          onClick={handlePrintPDF}
          className="px-4 py-2 bg-green-600 text-white rounded shadow"
        >
          Print
        </button>
      </div>
    </div>
  );
}
