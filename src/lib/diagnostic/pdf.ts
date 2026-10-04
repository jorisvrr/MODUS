import type { DiagnosticAnswers, ProfileIndicator, Signal } from "./types";

const INK = "#151716";
const MUTED = "#70756F";
const MODUS_GREEN = "#123C2D";
const LINE = "#D9DCD7";

const MARGIN = 20;
const PAGE_WIDTH = 210; // A4 mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export async function downloadDiagnosticPdf(
  answers: DiagnosticAnswers,
  indicators: ProfileIndicator[],
  signals: Signal[],
  focusAreas: { name: string; priority: string; why: string }[]
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  function pageBreakIfNeeded(nextHeight: number) {
    if (y + nextHeight > 297 - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  function label(text: string) {
    pageBreakIfNeeded(6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(text.toUpperCase(), MARGIN, y);
    y += 5;
  }

  function heading(text: string, size = 14) {
    pageBreakIfNeeded(size / 2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(INK);
    doc.text(text, MARGIN, y);
    y += size / 2 + 3;
  }

  function body(text: string, size = 10) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(INK);
    const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
    pageBreakIfNeeded(lines.length * 5);
    doc.text(lines, MARGIN, y);
    y += lines.length * 5 + 2;
  }

  function divider() {
    pageBreakIfNeeded(6);
    y += 2;
    doc.setDrawColor(LINE);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 6;
  }

  function fieldRow(fieldLabel: string, value: string) {
    if (!value) return;
    pageBreakIfNeeded(6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    doc.text(fieldLabel.toUpperCase(), MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK);
    doc.text(value, MARGIN + 55, y);
    y += 6;
  }

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(INK);
  doc.text("MODUS", MARGIN, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  doc.text("Initial Business Diagnostic Profile", MARGIN, y);
  y += 5;
  doc.setFontSize(8);
  doc.text(
    `Generated ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · Preliminary assessment, not a full MODUS diagnosis`,
    MARGIN,
    y
  );
  y += 10;
  doc.setDrawColor(MODUS_GREEN);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  doc.setLineWidth(0.2);
  y += 10;

  // Business
  label("Business");
  fieldRow("Company", answers.companyName);
  fieldRow("Website", answers.website);
  fieldRow("Industry", answers.industry === "Other" ? answers.industryOther : answers.industry);
  fieldRow("Employees", answers.employees);
  fieldRow("Locations", answers.locations);
  divider();

  // Operations
  label("How It Operates");
  fieldRow("Reach channels", answers.reachChannels.join(", "));
  fieldRow("Enquiry handling", answers.enquiryHandling.join(", "));
  fieldRow("Admin workload", answers.adminHours);
  // The visitor's own words, not a derived number. A record from before
  // October 2026 has neither field and shows the legacy values instead,
  // which is handled where historical records are rendered.
  fieldRow("Same steps for recurring tasks", answers.taskConsistency || "Not answered");
  fieldRow("A colleague can take over", answers.absenceCoverage || "Not answered");
  divider();

  // Systems
  label("Systems & Technology");
  fieldRow("Systems in use", answers.systems.join(", ") || "None specified");
  fieldRow("Connection level", answers.connectionLevel);
  fieldRow("Spreadsheet dependency", answers.spreadsheetDependency);
  fieldRow("Automation / AI usage", answers.automationUsage.join(", "));
  divider();

  // Friction
  label("Friction");
  fieldRow("Areas flagged", answers.friction.join(", "));
  fieldRow("Primary pain point", answers.primaryPain);
  fieldRow("Frequency", answers.frequency);
  fieldRow("Impact", answers.impact.join(", "));
  if (answers.problemDescription) {
    y += 1;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(MUTED);
    pageBreakIfNeeded(6);
    doc.text("IN THEIR OWN WORDS", MARGIN, y);
    y += 5;
    body(answers.problemDescription);
  }
  divider();

  // Priorities
  label("Priorities");
  fieldRow("Top priorities", answers.priorities.join(", "));
  fieldRow("Timing", answers.timing);
  divider();

  // Contact
  label("Contact");
  fieldRow("Name", `${answers.firstName} ${answers.lastName}`.trim());
  fieldRow("Email", answers.email);
  if (answers.phone) fieldRow("Phone", answers.phone);
  fieldRow("Role", answers.role === "Other" ? answers.roleOther : answers.role);
  divider();

  // Profile indicators
  heading("Initial Indication", 12);
  for (const ind of indicators) {
    fieldRow(ind.label, ind.value);
  }
  divider();

  // Focus areas
  heading("Where MODUS Would Look First", 12);
  focusAreas.forEach((area, i) => {
    body(`${i + 1}. ${area.name} (${area.priority})`, 10);
    body(area.why, 9);
  });
  divider();

  // Signals
  if (signals.length > 0) {
    heading("Preliminary Signals", 12);
    signals.forEach((s) => {
      body(s.headline, 10);
      body(s.body, 9);
      y += 2;
    });
  }

  const filename = `modus-diagnostic-${(answers.companyName || "profile").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
  doc.save(filename);
}
