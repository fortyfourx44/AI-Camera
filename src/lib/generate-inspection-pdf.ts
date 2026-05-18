import { jsPDF } from "jspdf";

import type { VideoInspectionReport } from "./types";

function screenshotUrl(relative: string): string {
  const parts = relative.replace(/\\/g, "/").split("/");
  const idx = parts.findIndex((p) => p === "screenshots");
  const sub = idx >= 0 ? parts.slice(idx + 1) : parts;
  return `/api/screenshots/${sub.map(encodeURIComponent).join("/")}`;
}

async function loadImageDataUrl(
  url: string
): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 320, h: 180 });
      img.src = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxW: number, lineH: number) {
  const lines = doc.splitTextToSize(text, maxW);
  doc.text(lines, x, y);
  return y + lines.length * lineH;
}

export async function downloadInspectionPdf(
  report: VideoInspectionReport,
  labels: {
    reportTitle: string;
    question: string;
    video: string;
    analyzedAt: string;
    verdict: string;
    confidence: string;
    summary: string;
    findings: string;
    evidence: string;
    limitations: string;
    conclusion: string;
    frame: string;
  }
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const maxW = pageW - margin * 2;
  let y = margin;

  const addPageIfNeeded = (need: number) => {
    if (y + need > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(report.title || labels.reportTitle, margin, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  let meta = `${labels.video}: ${report.videoName}\n${labels.question}: ${report.userQuestion}\n${labels.analyzedAt}: ${new Date(report.analyzedAt).toLocaleString()}`;
  if (report.videos && report.videos.length > 1) {
    meta += `\n\n${report.videos.map((v, i) => `${i + 1}. ${v.name} (${Math.round(v.durationSeconds / 60)}m)`).join("\n")}`;
  }
  y = wrapText(doc, meta, margin, y, maxW, 4);
  y += 4;
  doc.setTextColor(0, 0, 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  y = wrapText(
    doc,
    `${labels.verdict}: ${report.verdictLabel} (${labels.confidence}: ${Math.round(report.confidence * 100)}%)`,
    margin,
    y,
    maxW,
    5
  );
  y += 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(labels.summary, margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y = wrapText(doc, report.summary, margin, y, maxW, 4.5);
  y += 4;

  if (report.findings.length > 0) {
    addPageIfNeeded(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(labels.findings, margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (let i = 0; i < report.findings.length; i++) {
      const f = report.findings[i];
      addPageIfNeeded(14);
      let frameNote = "";
      if (f.evidenceRefs?.length) {
        frameNote = ` [${f.evidenceRefs.map((e) => `V${e.videoIndex + 1}#${e.frameIndex}`).join(", ")}]`;
      } else if (f.frameIndices.length > 0) {
        const cites = f.frameIndices.map(
          (i) => report.frameLabels?.[i] || `${labels.frame} ${i}`
        );
        frameNote = ` [${cites.join("; ")}]`;
      }
      y = wrapText(
        doc,
        `${i + 1}. ${f.heading}: ${f.detail}${frameNote}`,
        margin,
        y,
        maxW,
        4
      );
      y += 2;
    }
    y += 2;
  }

  const evidenceIdx =
    report.evidenceFrameIndices.length > 0
      ? report.evidenceFrameIndices
      : report.framePaths.length
      ? [0]
      : [];

  if (evidenceIdx.length > 0) {
    addPageIfNeeded(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(labels.evidence, margin, y);
    y += 6;

    const colW = (maxW - 4) / 2;
    const imgH = 38;
    let col = 0;
    for (const idx of evidenceIdx) {
      const rel = report.framePaths[idx];
      if (!rel) continue;
      addPageIfNeeded(imgH + 10);
      const img = await loadImageDataUrl(screenshotUrl(rel));
      const x = margin + col * (colW + 4);
      doc.setFontSize(8);
      const cap = report.frameLabels?.[idx] || `${labels.frame} #${idx}`;
      const capLines = doc.splitTextToSize(cap, colW);
      doc.text(capLines, x, y);
      if (img) {
        const ratio = img.w / img.h;
        let w = colW;
        let h = w / ratio;
        if (h > imgH) {
          h = imgH;
          w = h * ratio;
        }
        doc.addImage(img.dataUrl, "JPEG", x, y + 2, w, h);
      } else {
        doc.rect(x, y + 2, colW, imgH);
      }
      col++;
      if (col >= 2) {
        col = 0;
        y += imgH + 10;
      }
    }
    if (col > 0) y += imgH + 10;
  }

  if (report.limitations.trim()) {
    addPageIfNeeded(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(labels.limitations, margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y = wrapText(doc, report.limitations, margin, y, maxW, 4);
    y += 4;
  }

  addPageIfNeeded(12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(labels.conclusion, margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  wrapText(doc, report.conclusion, margin, y, maxW, 4.5);

  const safeName = report.videoName.replace(/[^\w.-]+/g, "_").slice(0, 40);
  doc.save(`analysis-${safeName}-${Date.now()}.pdf`);
}
