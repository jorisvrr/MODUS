export type DiagnosticAnswers = {
  companyName: string;
  website: string;
  industry: string;
  industryOther: string;
  employees: string;
  locations: string;

  reachChannels: string[];
  enquiryHandling: string[];
  adminHours: string;
  /*
   * The two operations answers, rewritten October 2026 into plain
   * categorical choices. They are the source of truth for new
   * submissions; the legacy numeric/level fields are derived from them
   * on the server by an explicit mapping, and are left unset where the
   * visitor said they do not know.
   */
  taskConsistency: string;
  absenceCoverage: string;

  systems: string[];
  specificTools: string;
  connectionLevel: string;
  spreadsheetDependency: string;
  automationUsage: string[];

  friction: string[];
  primaryPain: string;
  problemDescription: string;
  frequency: string;
  impact: string[];

  primaryInterest: string;
  priorities: string[];
  timing: string;
  decisionContext: string;

  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  roleOther: string;
};

export const emptyAnswers: DiagnosticAnswers = {
  companyName: "",
  website: "",
  industry: "",
  industryOther: "",
  employees: "",
  locations: "",

  reachChannels: [],
  enquiryHandling: [],
  adminHours: "",
  taskConsistency: "",
  absenceCoverage: "",

  systems: [],
  specificTools: "",
  connectionLevel: "",
  spreadsheetDependency: "",
  automationUsage: [],

  friction: [],
  primaryPain: "",
  problemDescription: "",
  frequency: "",
  impact: [],

  primaryInterest: "",
  priorities: [],
  timing: "",
  decisionContext: "",

  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "",
  roleOther: "",
};

export type Signal = {
  id: string;
  headline: string;
  body: string;
  why: string;
  inspect: string[];
  intervention: string;
};

export type ProfileIndicator = {
  label: string;
  value: string;
  tone: "low" | "moderate" | "high" | "early";
};
