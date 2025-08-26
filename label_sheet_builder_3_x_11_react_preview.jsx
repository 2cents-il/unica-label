import React, { useMemo, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";

// Helper conversions
const MM_TO_PT = 2.8346456693; // 1 mm = 2.8346 pt

function mmToPt(mm) {
  return mm * MM_TO_PT;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Common page sizes in mm
const PAGE_PRESETS = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
};

const defaultSettings = {
  cols: 3,
  rows: 11,
  pagePreset: "A4",
  pageWidthMm: PAGE_PRESETS.A4.width,
  pageHeightMm: PAGE_PRESETS.A4.height,
  offsetXmm: 8, // whole-grid X offset (left margin)
  offsetYmm: 12, // whole-grid Y offset (top margin)
  gutterXmm: 3, // spacing between columns
  gutterYmm: 3, // spacing between rows
};

export default function App() {
  const [settings, setSettings] = useState(defaultSettings);
  const [driveFolderUrl, setDriveFolderUrl] = useState("");
  const [useDrivePicker, setUseDrivePicker] = useState(false);
  const [cellImages, setCellImages] = useState(() => Array(settings.rows * settings.cols).fill(null));
  const fileInputRef = useRef(null);
  const targetIndexRef = useRef(null);

  const { cols, rows, pagePreset, pageWidthMm, pageHeightMm, offsetXmm, offsetYmm, gutterXmm, gutterYmm } = settings;

  // Recompute array if rows/cols ever change (they're fixed by spec 3x11, but keep robust)
  const totalCells = rows * cols;
  React.useEffect(() => {
    setCellImages((prev) => {
      const next = Array(totalCells).fill(null);
      for (let i = 0; i < Math.min(prev.length, next.length); i++) next[i] = prev[i];
      return next;
    });
  }, [totalCells]);

  const geometry = useMemo(() => {
    const w = pageWidthMm;
    const h = pageHeightMm;
    const gridWidth = w - 2 * offsetXmm - (cols - 1) * gutterXmm;
    const gridHeight = h - 2 * offsetYmm - (rows - 1) * gutterYmm;
    const cellWidth = gridWidth / cols;
    const cellHeight = gridHeight / rows;
    return { pageMm: { w, h }, cellMm: { w: cellWidth, h: cellHeight } };
  }, [pageWidthMm, pageHeightMm, offsetXmm, offsetYmm, gutterXmm, gutterYmm, cols, rows]);

  const pickLocalFileForCell = (index) => {
    targetIndexRef.current = index;
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const onLocalFileChosen = (e) => {
    const file = e.target.files?.[0];
    if (!file || targetIndexRef.current == null) return;
    const index = targetIndexRef.current;
    const objectUrl = URL.createObjectURL(file);
    setCellImages((prev) => {
      const next = [...prev];
      next[index] = { file, url: objectUrl, name: file.name, type: file.type };
      return next;
    });
    // reset so same file can be re-picked
    e.target.value = "";
  };

  const clearCell = (index) => {
    setCellImages((prev) => {
      const next = [...prev];
      const item = next[index];
      if (item?.url) URL.revokeObjectURL(item.url);
      next[index] = null;
      return next;
    });
  };

  const handleSettingNumber = (key, step = 1) => (e) => {
    const val = Number(e.target.value);
    setSettings((s) => ({ ...s, [key]: isNaN(val) ? s[key] : val }));
  };

  const handlePresetChange = (e) => {
    const preset = e.target.value;
    if (preset === "Custom") {
      setSettings((s) => ({ ...s, pagePreset: preset }));
    } else {
      const p = PAGE_PRESETS[preset];
      setSettings((s) => ({ ...s, pagePreset: preset, pageWidthMm: p.width, pageHeightMm: p.height }));
    }
  };

  const allCellsFilled = cellImages.every((c) => c);

  const downloadPdf = async () => {
    // Build a 1-page PDF with images placed by exact mm coordinates
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([mmToPt(settings.pageWidthMm), mmToPt(settings.pageHeightMm)]);

    const embedCache = new Map();

    const getEmbed = async (file) => {
      const buf = await file.arrayBuffer();
      if (file.type?.includes("png")) {
        return pdfDoc.embedPng(buf);
      }
      // default to jpg, pdf-lib also supports some other formats but jpg/png are safest
      return pdfDoc.embedJpg(buf);
    };

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const item = cellImages[idx];
        const xMm = offsetXmm + c * (geometry.cellMm.w + gutterXmm);
        const yMmTop = offsetYmm + r * (geometry.cellMm.h + gutterYmm);
        const yMmFromBottom = settings.pageHeightMm - yMmTop - geometry.cellMm.h; // PDF origin is bottom-left

        // draw a light border even if empty
        const rectX = mmToPt(xMm);
        const rectY = mmToPt(yMmFromBottom);
        const rectW = mmToPt(geometry.cellMm.w);
        const rectH = mmToPt(geometry.cellMm.h);
        page.drawRectangle({ x: rectX, y: rectY, width: rectW, height: rectH, borderWidth: 0.5, color: undefined, borderColor: undefined });

        if (item?.file) {
          let img = embedCache.get(item.file);
          if (!img) {
            img = await getEmbed(item.file);
            embedCache.set(item.file, img);
          }
          // Fit image into cell while maintaining aspect ratio
          const imgWpt = img.width;
          const imgHpt = img.height;
          const maxW = rectW;
          const maxH = rectH;
          const scale = Math.min(maxW / imgWpt, maxH / imgHpt);
          const drawW = imgWpt * scale;
          const drawH = imgHpt * scale;
          const dx = rectX + (rectW - drawW) / 2;
          const dy = rectY + (rectH - drawH) / 2;
          page.drawImage(img, { x: dx, y: dy, width: drawW, height: drawH });
        }
      }
    }

    const bytes = await pdfDoc.save();
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `labels_${settings.pagePreset || 'custom'}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const printPage = () => {
    // Open a new tab with a print-optimized HTML using mm units
    const w = window.open("", "_blank");
    const { w: pageW, h: pageH } = { w: settings.pageWidthMm, h: settings.pageHeightMm };
    const style = `
      <style>
        @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
        * { box-sizing: border-box; }
        body { margin: 0; }
        .page { width: ${pageW}mm; height: ${pageH}mm; position: relative; }
        .cell {
          position: absolute; overflow: hidden; border: 0.3mm solid #999;
          display: flex; align-items: center; justify-content: center;
        }
        img { max-width: 100%; max-height: 100%; display: block; }
      </style>
    `;

    const cellsHtml = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const item = cellImages[idx];
        const x = settings.offsetXmm + c * (geometry.cellMm.w + settings.gutterXmm);
        const y = settings.offsetYmm + r * (geometry.cellMm.h + settings.gutterYmm);
        const styleCell = `left:${x}mm; top:${y}mm; width:${geometry.cellMm.w}mm; height:${geometry.cellMm.h}mm;`;
        const imgHtml = item?.url ? `<img src="${item.url}" alt="cell" />` : "";
        cellsHtml.push(`<div class="cell" style="${styleCell}">${imgHtml}</div>`);
      }
    }

    const html = `<!doctype html><html><head><meta charset='utf-8'/>${style}</head><body><div class='page'>${cellsHtml.join("")}</div><script>window.onload=()=>window.print();</script></body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const Cell = ({ index, preview }) => {
    const item = cellImages[index];
    return (
      <div
        onClick={() => pickLocalFileForCell(index)}
        className="relative group cursor-pointer bg-white/80 border border-gray-300 hover:border-blue-500 rounded-xl overflow-hidden flex items-center justify-center"
        title={item?.name || "Click to choose image"}
      >
        {item?.url ? (
          <img src={item.url} alt="label" className="max-w-full max-h-full" />
        ) : (
          <span className="text-xs text-gray-400">Click to add</span>
        )}
        {item && (
          <button
            onClick={(e) => { e.stopPropagation(); clearCell(index); }}
            className="absolute top-1 right-1 bg-white/90 border border-gray-300 rounded-md px-1.5 py-0.5 text-xs shadow-sm hover:bg-red-50"
          >
            ✕
          </button>
        )}
      </div>
    );
  };

  const GridPreview = () => {
    const cells = [];
    const { w: cellW, h: cellH } = geometry.cellMm;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        cells.push(
          <div key={idx} style={{ width: `${cellW}mm`, height: `${cellH}mm`, marginRight: c < cols - 1 ? `${gutterXmm}mm` : 0, marginBottom: r < rows - 1 ? `${gutterYmm}mm` : 0 }}>
            <Cell index={idx} />
          </div>
        );
      }
    }

    return (
      <div className="w-full">
        <div
          className="mx-auto bg-[conic-gradient(at_top_left,_#fafafa,_#f1f5f9)] shadow-xl rounded-2xl p-6"
          style={{ width: `${pageWidthMm}mm` }}
        >
          <div
            className="mx-auto bg-white rounded-xl border border-gray-300 p-0"
            style={{ width: `${pageWidthMm - offsetXmm * 2}mm`, padding: 0 }}
          >
            {/* Use padding boxes to create the outer margins visually */}
            <div style={{ paddingLeft: `${offsetXmm}mm`, paddingRight: `${offsetXmm}mm`, paddingTop: `${offsetYmm}mm`, paddingBottom: `${offsetYmm}mm` }}>
              <div className="flex flex-wrap">
                {cells}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onLocalFileChosen} />

      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Label Sheet Builder (3 × 11)</h1>
          <div className="flex gap-2">
            <button onClick={printPage} className="px-3 py-2 rounded-xl border border-slate-300 shadow-sm hover:shadow bg-white">Print</button>
            <button onClick={downloadPdf} className="px-3 py-2 rounded-xl border border-blue-600 bg-blue-600 text-white shadow hover:opacity-95">Download PDF</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-[360px,1fr] gap-6">
        {/* Settings Panel */}
        <section className="bg-white rounded-2xl shadow p-4 border border-slate-200">
          <h2 className="text-lg font-semibold mb-3">Settings</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium">Page preset</label>
              <select value={pagePreset} onChange={handlePresetChange} className="mt-1 w-full border rounded-xl p-2">
                {Object.keys(PAGE_PRESETS).map((k) => (
                  <option key={k} value={k}>{k} ({PAGE_PRESETS[k].width} × {PAGE_PRESETS[k].height} mm)</option>
                ))}
                <option value="Custom">Custom</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm">Page width (mm)</label>
                <input type="number" step="0.1" value={pageWidthMm} onChange={handleSettingNumber("pageWidthMm")} disabled={pagePreset!=="Custom"} className="mt-1 w-full border rounded-xl p-2" />
              </div>
              <div>
                <label className="block text-sm">Page height (mm)</label>
                <input type="number" step="0.1" value={pageHeightMm} onChange={handleSettingNumber("pageHeightMm")} disabled={pagePreset!=="Custom"} className="mt-1 w-full border rounded-xl p-2" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm">Grid offset X (mm)</label>
                <input type="number" step="0.1" value={offsetXmm} onChange={handleSettingNumber("offsetXmm")} className="mt-1 w-full border rounded-xl p-2" />
              </div>
              <div>
                <label className="block text-sm">Grid offset Y (mm)</label>
                <input type="number" step="0.1" value={offsetYmm} onChange={handleSettingNumber("offsetYmm")} className="mt-1 w-full border rounded-xl p-2" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm">Column spacing (mm)</label>
                <input type="number" step="0.1" value={gutterXmm} onChange={handleSettingNumber("gutterXmm")} className="mt-1 w-full border rounded-xl p-2" />
              </div>
              <div>
                <label className="block text-sm">Row spacing (mm)</label>
                <input type="number" step="0.1" value={gutterYmm} onChange={handleSettingNumber("gutterYmm")} className="mt-1 w-full border rounded-xl p-2" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm">Columns</label>
                <input type="number" value={cols} min={1} max={6} onChange={handleSettingNumber("cols")} className="mt-1 w-full border rounded-xl p-2" />
              </div>
              <div>
                <label className="block text-sm">Rows</label>
                <input type="number" value={rows} min={1} max={50} onChange={handleSettingNumber("rows")} className="mt-1 w-full border rounded-xl p-2" />
              </div>
            </div>

            <div className="pt-2 border-t">
              <label className="block text-sm font-medium">Linked Google Drive folder (optional)</label>
              <input type="url" placeholder="https://drive.google.com/drive/folders/..." value={driveFolderUrl} onChange={(e)=>setDriveFolderUrl(e.target.value)} className="mt-1 w-full border rounded-xl p-2" />
              <div className="mt-2 flex items-center gap-2">
                <input id="usePicker" type="checkbox" checked={useDrivePicker} onChange={(e)=>setUseDrivePicker(e.target.checked)} />
                <label htmlFor="usePicker" className="text-sm">Enable Google Drive Picker (requires API key & client ID)</label>
              </div>
              {useDrivePicker && (
                <button
                  onClick={() => alert("Google Picker not configured in this preview. In your deployment, load gapi + picker APIs and call picker to insert into a selected cell.")}
                  className="mt-2 px-3 py-2 rounded-xl border border-slate-300 bg-white shadow hover:shadow-sm"
                >
                  Pick from Drive
                </button>
              )}
              <p className="text-xs text-slate-500 mt-2">Tip: Start by clicking any cell to choose a local image. Drive integration can be added by wiring the Google Picker API to the currently selected cell index.</p>
            </div>
          </div>
        </section>

        {/* Preview Panel */}
        <section className="bg-white rounded-2xl shadow p-4 border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Live preview</h2>
            <div className="text-sm text-slate-500">Cell size: {geometry.cellMm.w.toFixed(2)} × {geometry.cellMm.h.toFixed(2)} mm</div>
          </div>
          <GridPreview />
          <div className="mt-4 text-xs text-slate-500">Click a cell to add an image. Use the settings to match your label sheet. Borders are for guidance only and won’t print as thick lines.</div>
        </section>
      </main>

      <footer className="max-w-7xl mx-auto px-4 py-6 text-center text-xs text-slate-500">
        Built with React + pdf-lib. Images are fit within each cell preserving aspect ratio.
      </footer>
    </div>
  );
}
