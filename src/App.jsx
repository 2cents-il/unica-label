import React, { useState } from "react";
import { PDFDocument, rgb } from "pdf-lib";

export default function App() {
  const [grid, setGrid] = useState(
    Array(11)
      .fill(null)
      .map(() => Array(3).fill(null))
  );

  const [settings, setSettings] = useState({
    pageWidth: 210,   // A4 default width (mm)
    pageHeight: 297,  // A4 default height (mm)
    offsetX: 10,
    offsetY: 10,
    spacingX: 2,
    spacingY: 2,
    cellWidth: 51,    // default label width (mm)
    cellHeight: 21,   // default label height (mm)
  });

  const handleFileChange = (row, col, file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const newGrid = [...grid];
      newGrid[row][col] = e.target.result;
      setGrid(newGrid);
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadPDF = async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([
      (settings.pageWidth / 25.4) * 72,
      (settings.pageHeight / 25.4) * 72,
    ]);

    for (let row = 0; row < 11; row++) {
      for (let col = 0; col < 3; col++) {
        if (grid[row][col]) {
          const imgBytes = await fetch(grid[row][col]).then((res) =>
            res.arrayBuffer()
          );
          const img = await pdfDoc.embedPng(imgBytes);

          const x =
            (settings.offsetX +
              col * (settings.cellWidth + settings.spacingX)) /
            25.4 *
            72;
          const y =
            (settings.pageHeight -
              settings.offsetY -
              (row + 1) * settings.cellHeight -
              row * settings.spacingY) /
            25.4 *
            72;

          const w = (settings.cellWidth / 25.4) * 72;
          const h = (settings.cellHeight / 25.4) * 72;

          page.drawImage(img, {
            x,
            y,
            width: w,
            height: h,
          });
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "labels.pdf";
    link.click();
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Unica Label Generator</h1>

      {/* Settings */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {Object.keys(settings).map((key) => (
          <div key={key}>
            <label className="block text-sm font-medium mb-1">
              {key} ({key.includes("Width") || key.includes("Height") ? "mm" : "mm"})
            </label>
            <input
              type="number"
              className="border p-2 rounded w-full"
              value={settings[key]}
              onChange={(e) =>
                setSettings({ ...settings, [key]: parseFloat(e.target.value) })
              }
            />
          </div>
        ))}
      </div>

      {/* Grid */}
      <div
        className="border inline-block"
        style={{
          width: `${settings.pageWidth * 3}px`,
          height: `${settings.pageHeight * 3}px`,
          position: "relative",
          background: "#f8f8f8",
        }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => (
            <div
              key={`${r}-${c}`}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "image/*";
                input.onchange = (e) =>
                  handleFileChange(r, c, e.target.files[0]);
                input.click();
              }}
              className="border border-gray-400 cursor-pointer flex items-center justify-center overflow-hidden"
              style={{
                width: `${settings.cellWidth * 3}px`,
                height: `${settings.cellHeight * 3}px`,
                position: "absolute",
                left: `${(settings.offsetX + c * (settings.cellWidth + settings.spacingX)) * 3}px`,
                top: `${(settings.offsetY + r * (settings.cellHeight + settings.spacingY)) * 3}px`,
                background: "#fff",
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
            </div>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex gap-4">
        <button
          onClick={handleDownloadPDF}
          className="px-4 py-2 bg-blue-500 text-white rounded shadow"
        >
          Download PDF
        </button>
      </div>
    </div>
  );
}
