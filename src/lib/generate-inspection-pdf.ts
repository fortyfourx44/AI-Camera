import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

import type { VideoInspectionReport } from "./types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function screenshotUrl(relative: string): string {
  const parts = relative.replace(/\\/g, "/").split("/");
  const idx = parts.findIndex((p) => p === "screenshots");
  const sub = idx >= 0 ? parts.slice(idx + 1) : parts;
  return `/api/screenshots/${sub.map(encodeURIComponent).join("/")}`;
}

function frameImageSrc(report: VideoInspectionReport, flatIndex: number): string {
  const embedded = report.frameDataUrls?.[String(flatIndex)];
  if (embedded) return embedded;
  const rel = report.framePaths[flatIndex];
  return rel ? screenshotUrl(rel) : "";
}

function buildReportHtml(
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
  },
  rtl: boolean
): string {
  const evidenceIdx =
    report.evidenceFrameIndices.length > 0
      ? report.evidenceFrameIndices
      : report.framePaths.length
      ? [Math.floor(report.framePaths.length / 2)]
      : [];

  const findingsHtml = report.findings
    .map((f, i) => {
      let cite = "";
      if (f.evidenceRefs?.length) {
        cite = f.evidenceRefs
          .map((e) => {
            const v = report.videos?.[e.videoIndex];
            return v ? `${escapeHtml(v.name)} · frame ${e.frameIndex}` : `V${e.videoIndex + 1}`;
          })
          .join("; ");
      } else if (f.frameIndices.length > 0) {
        cite = f.frameIndices
          .map((idx) => escapeHtml(report.frameLabels?.[idx] || `${labels.frame} ${idx}`))
          .join("; ");
      }
      return `<li style="margin-bottom:10px">
        <strong>${escapeHtml(f.heading)}</strong>
        <p style="margin:4px 0 0;color:#444">${escapeHtml(f.detail)}</p>
        ${cite ? `<p style="margin:4px 0 0;font-size:11px;color:#666">${cite}</p>` : ""}
      </li>`;
    })
    .join("");

  const videosHtml =
    report.videos && report.videos.length > 1
      ? `<ul style="margin:8px 0 0;padding-${rtl ? "right" : "left"}:18px;font-size:12px;color:#555">
          ${report.videos
            .map(
              (v, i) =>
                `<li>${i + 1}. ${escapeHtml(v.name)} (${Math.round(v.durationSeconds / 60)}m, ${v.frameCount} frames)</li>`
            )
            .join("")}
        </ul>`
      : "";

  const framesHtml = evidenceIdx
    .map((idx) => {
      const src = frameImageSrc(report, idx);
      if (!src) return "";
      const cap = escapeHtml(report.frameLabels?.[idx] || `${labels.frame} ${idx}`);
      return `<figure style="margin:0;break-inside:avoid">
        <figcaption style="font-size:10px;color:#333;margin-bottom:4px;line-height:1.3">${cap}</figcaption>
        <img src="${src}" alt="" style="width:100%;height:auto;border-radius:6px;border:1px solid #ddd;display:block" crossorigin="anonymous" />
      </figure>`;
    })
    .join("");

  return `
    <article style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans Arabic',Arial,sans-serif;line-height:1.45;color:#111">
      <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(report.title || labels.reportTitle)}</h1>
      <p style="font-size:12px;color:#555;margin:0 0 4px"><strong>${escapeHtml(labels.video)}:</strong> ${escapeHtml(report.videoName)}</p>
      <p style="font-size:12px;color:#555;margin:0 0 4px"><strong>${escapeHtml(labels.question)}:</strong> ${escapeHtml(report.userQuestion)}</p>
      <p style="font-size:12px;color:#555;margin:0 0 12px"><strong>${escapeHtml(labels.analyzedAt)}:</strong> ${escapeHtml(new Date(report.analyzedAt).toLocaleString())}</p>
      ${videosHtml}
      <p style="font-size:13px;margin:16px 0 8px"><strong>${escapeHtml(labels.verdict)}:</strong> ${escapeHtml(report.verdictLabel)} (${escapeHtml(labels.confidence)}: ${Math.round(report.confidence * 100)}%)</p>
      <section style="margin-bottom:16px">
        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#666;margin:0 0 6px">${escapeHtml(labels.summary)}</h2>
        <p style="margin:0;font-size:14px">${escapeHtml(report.summary)}</p>
      </section>
      ${
        report.findings.length > 0
          ? `<section style="margin-bottom:16px">
        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#666;margin:0 0 8px">${escapeHtml(labels.findings)}</h2>
        <ol style="margin:0;padding-${rtl ? "right" : "left"}:20px">${findingsHtml}</ol>
      </section>`
          : ""
      }
      ${
        framesHtml
          ? `<section style="margin-bottom:16px">
        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#666;margin:0 0 10px">${escapeHtml(labels.evidence)}</h2>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">${framesHtml}</div>
      </section>`
          : ""
      }
      ${
        report.limitations.trim()
          ? `<section style="margin-bottom:16px">
        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#666;margin:0 0 6px">${escapeHtml(labels.limitations)}</h2>
        <p style="margin:0;font-size:12px;color:#555">${escapeHtml(report.limitations)}</p>
      </section>`
          : ""
      }
      <section>
        <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#666;margin:0 0 6px">${escapeHtml(labels.conclusion)}</h2>
        <p style="margin:0;font-size:14px;font-weight:600">${escapeHtml(report.conclusion)}</p>
      </section>
    </article>
  `;
}

/** Render report via browser layout (Arabic-safe) then export to PDF. */
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
  },
  options?: { rtl?: boolean }
): Promise<void> {
  const rtl = options?.rtl ?? /[\u0600-\u06FF]/.test(
    [
      report.title,
      report.summary,
      report.conclusion,
      report.userQuestion,
      report.verdictLabel,
      ...report.findings.map((f) => f.heading + f.detail),
    ].join(" ")
  );

  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;max-width:794px;background:#fff;z-index:-1";
  const sheet = document.createElement("div");
  sheet.dir = rtl ? "rtl" : "ltr";
  sheet.lang = rtl ? "ar" : "en";
  sheet.style.cssText = "padding:40px;box-sizing:border-box";
  sheet.innerHTML = buildReportHtml(report, labels, rtl);
  host.appendChild(sheet);
  document.body.appendChild(host);

  try {
    await Promise.all(
      Array.from(sheet.querySelectorAll("img")).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
      )
    );

    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 0;
    const printableW = pageW - margin * 2;

    const imgW = printableW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    let offsetY = 0;
    let page = 0;
    while (offsetY < imgH) {
      if (page > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", margin, -offsetY, imgW, imgH);
      offsetY += pageH;
      page++;
    }

    const safeName = report.videoName.replace(/[^\w.-]+/g, "_").slice(0, 40);
    pdf.save(`analysis-${safeName}-${Date.now()}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}
