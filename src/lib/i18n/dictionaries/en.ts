import type { ChatRule } from "@/lib/chatbot";
import {
  TASK_CONSISTENCY_OPTIONS,
  ABSENCE_COVERAGE_OPTIONS,
} from "@/lib/diagnostic/operationsOptions";

export const en = {
  common: {
    close: "Close",
    dismiss: "Dismiss",
    cancel: "Cancel",
    save: "Save",
    continue: "Continue",
    required: "Required",
    optional: "Optional",
    maximumReached: "Maximum reached",
  },

  phoneInput: {
    label: "Phone number",
    validPrefix: "NL / Valid",
    invalidMessage: "Enter a valid phone number.",
  },

  signalCard: {
    preliminary: "Signal / Preliminary",
  },

  nav: {
    online: "MODUS / Online",
    howItWorks: "How It Works",
    platform: "Platform",
    capabilities: "Capabilities",
    results: "Results",
    company: "Company",
    pricing: "Pricing",
    runDiagnostic: "Run a Diagnostic",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    theme: "Theme",
  },

  // Mocked client account flow (nav sign-in -> OTP -> "logged in" state).
  // No real backend, no real email sent — see WHY comment in
  // src/lib/clientAuth/session.ts. Copy still reads like a real product
  // flow; the "Demo" labelling is what makes the mock honest, not vaguer UI.
  clientAuth: {
    signIn: "Sign In",
    accountMenu: "Account menu",
    title: "Client Access",
    subtitle: "Sign in to your MODUS platform.",
    emailLabel: "Work email",
    emailPlaceholder: "you@company.nl",
    emailError: "Enter a valid email address.",
    continueButton: "Continue",
    otpTitle: "Check your email",
    otpSubtitle: (email: string) => `We've sent a 6-digit code to ${email}.`,
    demoBadge: "Demo",
    otpDemoNote: (code: string) => `No email was actually sent. Use ${code} to continue.`,
    otpLabel: "Verification code",
    otpError: "Enter the 6-digit code.",
    otpWrongCode: "That code isn't right. Check the demo code above.",
    verifyButton: "Verify",
    changeEmail: "Use a different email",
    resend: "Resend code",
    resendIn: (seconds: number) => `Resend in ${seconds}s`,
    successTitle: "You're in.",
    successSubtitle: "Setting up your session…",
    signedInAs: "Signed in as",
    signOut: "Sign Out",
    close: "Close",
  },

  // Reflects back what a visitor already told MODUS via the Diagnostic —
  // never invents anything, never says "recommended for you." See
  // src/lib/customerContext/ for the model this reads from.
  customerContext: {
    diagnosticInProgress: {
      label: "Diagnostic / In Progress",
      body: "Continue where you left off.",
      cta: "Continue Diagnostic",
    },
    profileReady: {
      label: "Profile Ready",
      cta: "View Your Profile",
    },
    proposalReady: {
      label: "Proposal Ready",
      cta: "View Your Proposal",
    },
    pricing: {
      label: "Initial Estimate",
      whyRange: "Based on the information you provided, your initial MODUS engagement falls within this range.",
      cta: "Review This Estimate With MODUS",
    },
  },

  // The real next step after a Diagnostic estimate: a Calendly embed to
  // book a time, plus a callback-request form either alongside it or on
  // its own if NEXT_PUBLIC_CALENDLY_URL isn't configured. Replaces the old
  // chatbot-only dead end.
  reviewScheduling: {
    bookTime: "Book a Time",
    orRequestCallback: "Or Request a Callback",
    requestCallback: "Request a Callback",
    noteLabel: "Anything MODUS should know before calling",
    notePlaceholder: "Best time to reach you, or anything MODUS should know before calling. Optional.",
    submit: "Request a Callback",
    submitting: "Sending…",
    successTitle: "Request received.",
    successBody: "MODUS will reach out to schedule your review.",
    errorMessage: "Something went wrong. Try again, or use the email link below.",
  },

  footer: {
    tagline: "A better way to operate.",
    modusLabel: "MODUS",
    modusBlurb: "Improvement infrastructure for growing businesses.",
    navigateLabel: "Navigate",
    getStartedLabel: "Get Started",
    runDiagnostic: "Run a Diagnostic",
    talkToModus: "Talk to MODUS",
    statusLine: "MODUS / Online. Systems improve. The loop continues.",
    copyright: "© 2026 MODUS. Improvement Infrastructure.",
    privacy: "Privacy",
    privacyPreferences: "Privacy Preferences",
    legal: "Legal",
    linkedin: "MODUS on LinkedIn",
  },

  language: {
    switchLabel: "Language",
  },

  privacy: {
    bannerLabel: "Privacy / Preferences",
    bannerBody:
      "MODUS uses necessary technologies to operate this website. Optional analytics help us understand how the site is used, and only run once you allow them.",
    acceptAll: "Accept All",
    rejectOptional: "Reject Optional",
    manage: "Manage",
    preferencesTitle: "Privacy / Preferences",
    preferencesIntro:
      "Choose which technologies MODUS may use on this website. You can change this at any time from the footer.",
    necessaryLabel: "Necessary",
    necessaryDescription:
      "Required for the website and diagnostic to function. Always active.",
    necessaryStatus: "Always Active",
    analyticsLabel: "Analytics",
    analyticsDescription:
      "Helps MODUS understand how the site is used, so it can keep improving. Off until you turn it on.",
    marketingLabel: "Marketing",
    marketingDescription:
      "Would support future MODUS marketing measurement. Not in use yet.",
    on: "On",
    off: "Off",
    privacyPolicyLink: "Privacy",
    cookiePolicyLink: "Cookie Policy",
    savedNotification: "Preferences saved.",
  },

  diagnosticRecovery: {
    label: "Diagnostic / Saved",
    body: "You have an unfinished business diagnostic.",
    continueDiagnostic: "Continue Diagnostic",
    startAgain: "Start Again",
    dismiss: "Dismiss",
    confirmTitle: "Start again?",
    confirmBody:
      "This clears your saved answers. There is no way to recover them afterward.",
    confirmAction: "Clear and Start Again",
    confirmCancel: "Keep My Answers",
    resumedBadge: "Diagnostic / Resumed",
  },

  notification: {
    languageUpdated: "Language updated.",
  },

  diagnosticShell: {
    label: "MODUS / Business Diagnostic",
    hintPrefix: "Continuing from",
    introTitle: "Let's understand how your business works.",
    introBody:
      "Answer a few questions about your company, systems and current friction. MODUS will use your answers to build an initial business profile and identify where deeper analysis may be valuable.",
    microTime: "~4 Min",
    microSections: "6 Sections",
    microAudit: "No Generic AI Audit",
    begin: "Begin Diagnostic",
    back: "Back",
    next: "Continue",
    review: "Review",
    stepLabels: ["Business", "Operations", "Systems", "Friction", "Priorities", "Contact"],
    // New for Checkpoint 5 — a short, inviting question-style headline
    // shown large above each step's existing fields (which previously had
    // no step-level heading of their own, only small per-field labels).
    // Supporting copy only; the fields, their order, and their validation
    // are completely unchanged.
    stepHeadlines: [
      "Tell us about your business.",
      "How do customers reach you?",
      "What's running behind the scenes?",
      "Where does it get harder than it should?",
      "What matters most right now?",
      "Where should MODUS send your profile?",
    ],
    // Short forms of stepHeadlines, for the diagnostic scene's projected
    // labels. Same six topics, same order — abbreviated because a full
    // question does not fit on a floating chip.
    stepTopics: ["Business", "Customers", "Systems", "Friction", "Priorities", "Contact"],
    profileReady: {
      label: "PROFILE READY",
      loading: "Loading your profile…",
      profileReadyTitle: "Your initial profile is ready.",
      signalsIdentified: (n: number) => `${n} preliminary ${n === 1 ? "Signal" : "Signals"} identified.`,
      estimateAvailable: "Initial engagement estimate available.",
      viewPricing: "View pricing details",
      startNew: "Start a new diagnostic",
      startNewNote: "This clears your saved profile reference on this device. Information you already submitted stays on file with MODUS.",
      unavailable: "This profile reference is no longer valid on this device.",
    },
  },

  chatbot: {
    openLabel: "Open MODUS assistant",
    closeLabel: "Close",
    name: "MODUS",
    available: "Available",
    introTitle: "What would you like to understand?",
    introBody: "Ask about MODUS, the diagnostic, capabilities, platform or how we work.",
    you: "You",
    inputPlaceholder: "Ask MODUS",
    send: "Send",
  },

  diagnosticQuestions: {
    industries: [
      "Restaurant / Café",
      "Bar / Nightlife",
      "Hotel / Hospitality",
      "Hair & Beauty / Barbershop",
      "Fitness / Wellness",
      "Retail",
      "E-commerce",
      "Professional Services",
      "Construction",
      "Logistics",
      "Healthcare",
      "Automotive",
      "Real Estate",
      "Technology",
      "Manufacturing",
      "Financial Services",
      "Creative Services",
      "Education",
      "Other",
    ],
    employeeRanges: ["1–5", "6–20", "21–50", "51–100", "101–250", "250+"],
    locationOptions: ["1", "2–5", "6–10", "11+", "Online only"],
    reachChannels: [
      "Website",
      "Phone",
      "Email",
      "WhatsApp",
      "Walk-in",
      "Social Media",
      "Marketplace",
      "Sales Team",
      "Other",
    ],
    enquiryHandling: [
      "Shared inbox",
      "Personal inboxes",
      "CRM",
      "Spreadsheet",
      "WhatsApp",
      "Phone",
      "Booking system",
      "POS",
      "Paper/manual",
      "Custom software",
      "Other",
    ],
    adminHoursOptions: ["Very little", "A few hours", "5–10 hours", "10–25 hours", "25+ hours", "Unsure"],
    dependencyLevels: ["Low", "Medium", "High"],
    taskConsistencyOptions: TASK_CONSISTENCY_OPTIONS.en,
    absenceCoverageOptions: ABSENCE_COVERAGE_OPTIONS.en,
    systemOptions: [
      "CRM",
      "Accounting",
      "Email",
      "Booking",
      "E-commerce",
      "POS",
      "Inventory",
      "Project Management",
      "Customer Support",
      "Spreadsheets",
      "Analytics",
      "Marketing Automation",
      "HR / Scheduling",
      "Custom Software",
      "AI Tools",
      "Other",
    ],
    connectionLevels: ["Mostly connected", "Some connections", "Mostly manual", "Not sure"],
    spreadsheetDependency: ["Almost none", "Occasional", "Important", "Critical", "We'd stop without them"],
    automationUsage: [
      "No",
      "Basic automations",
      "Zapier / Make / n8n",
      "AI tools such as ChatGPT",
      "AI integrated into workflows",
      "Custom automation",
      "Not sure",
    ],
    frictionAreas: [
      "Administration",
      "Customer enquiries",
      "Sales follow-up",
      "Bookings",
      "Reporting",
      "Data",
      "Internal communication",
      "Scheduling",
      "Inventory",
      "Invoices / finance",
      "Customer support",
      "Marketing",
      "Employee onboarding",
      "Software",
      "Manual data entry",
      "Other",
    ],
    frequencyOptions: ["Daily", "Several times per week", "Weekly", "Occasionally", "Unsure"],
    impactOptions: [
      "Time",
      "Revenue",
      "Customers",
      "Visibility",
      "Employee capacity",
      "Customer experience",
      "Errors",
      "Stress / complexity",
      "Unsure",
    ],
    priorityOptions: [
      "Save employee time",
      "Increase revenue",
      "Reduce costs",
      "Improve customer experience",
      "Improve conversion",
      "Reduce administrative work",
      "Connect systems",
      "Improve reporting",
      "Automate repetitive work",
      "Use AI effectively",
      "Improve operational control",
      "Scale without adding headcount",
      "Not sure, tell me what matters most",
    ],
    timingOptions: ["Immediately", "Within 30 days", "Within 3 months", "This year", "Exploring for now"],
    roleOptions: [
      "Owner / Founder",
      "Director",
      "Operations",
      "Management",
      "Marketing",
      "Sales",
      "IT / Technology",
      "Finance",
      "Other",
    ],
    decisionContextOptions: [
      "Just me",
      "Me and one other person",
      "A small team",
      "Multiple stakeholders / departments",
    ],
    // Same wording as pricing.notServices.disciplines, deliberately — this
    // is the diagnostic's version of the same MODUS discipline list, and
    // the two should always read as one category system, not two.
    interestOptions: [
      "Business Engineering",
      "Operations",
      "Software & Systems",
      "Data & Reporting",
      "Automation & AI",
      "Customer Experience",
      "Revenue Systems",
      "Measurement",
      "Not sure yet",
    ],
  },

  diagnosticSteps: {
    business: {
      companyNameLabel: "Company name",
      companyNamePlaceholder: "Your company",
      companyNameFallbackError: "Enter a valid name.",
      websiteLabel: "Website",
      websitePlaceholder: "https://yourcompany.nl",
      websiteError: "Enter a valid website address.",
      industryLabel: "Industry",
      industryPlaceholder: "Select an industry",
      industryOtherLabel: "Describe your industry",
      industryOtherPlaceholder: "e.g. specialty food distribution",
      employeesLabel: "Employees",
      locationsLabel: "Locations",
    },
    operations: {
      reachTitle: "How do customers primarily reach you?",
      selectAll: "Select all that apply.",
      enquiryTitle: "How are enquiries handled?",
      adminTitle: "How much repetitive administrative work happens each week?",
      /*
       * Rewritten October 2026. The old pair asked the visitor to rate
       * their own "process standardization" on a 1-5 scale and to judge
       * how "dependent" the business is — both ask for a self-assessment
       * in our vocabulary. These ask about something the visitor can
       * simply observe about their week.
       *
       * The legacy keys are kept so historical records can still be
       * rendered with the wording they were answered under.
       */
      taskConsistencyTitle: "Does your team follow the same steps for recurring tasks?",
      taskConsistencyHelper:
        "For example: preparing a quote, booking a job or following up with a customer.",
      absenceCoverageTitle: "If someone is away, can a colleague take over their work?",
      absenceCoverageHelper:
        "Think about whether the colleague can find the information and knows what to do.",
      legacyStandardizationTitle: "How standardized are your processes?",
      legacyDependencyTitle:
        "How dependent is the business on specific employees knowing “how things work”?",
    },
    systems: {
      systemsTitle: "What runs your business today?",
      systemsHint: "Select everything you currently use.",
      specificToolsLabel: "Which tools specifically?",
      specificToolsPlaceholder: "e.g. HubSpot, Exact Online, Shopify",
      connectionTitle: "How connected are these systems?",
      connectionHint: "This is one of the strongest signals MODUS uses.",
      spreadsheetTitle: "How important are spreadsheets to daily operations?",
      automationTitle: "Are you currently using automation or AI?",
    },
    friction: {
      frictionTitle: "Where does the business feel harder than it should?",
      nothingObvious: "Nothing obvious, find it for me",
      primaryPainTitle: "Which one causes the most frustration?",
      descriptionLabel: "In your own words, what happens?",
      descriptionPlaceholder:
        "For example: enquiries arrive through email and WhatsApp, different employees handle them, and sometimes follow-up gets missed.",
      descriptionFallbackError: "Add a little more detail.",
      frequencyTitle: "How often does this happen?",
      impactTitle: "What does this problem primarily cost you?",
    },
    priorities: {
      interestTitle: "Which area are you primarily interested in?",
      interestHint: "Optional, helps us prepare before we talk.",
      priorityTitle: "What would make the biggest difference?",
      chooseUpTo3: "Choose up to 3.",
      rankTitle: "Your ranking",
      rankHint: "Drag to reorder, most important first.",
      reorderLabel: "Reorder",
      timingTitle: "When would you ideally start improving this?",
      decisionTitle: "Who is involved in deciding to move forward?",
    },
    contact: {
      firstNameLabel: "First name",
      lastNameLabel: "Last name",
      emailLabel: "Work email",
      emailPlaceholder: "you@company.nl",
      freeEmailNote:
        "A company email helps us understand your organization, but this address is still accepted.",
      disposableEmailNote:
        "This looks like a temporary email address. If it expires, MODUS won't be able to reach you.",
      roleLabel: "Role",
      roleOtherLabel: "Describe your role",
      companyPrefix: "Company:",
    },
  },

  diagnosticReview: {
    label: "MODUS / Review",
    title: "Review your business profile.",
    groupBusiness: "Business",
    groupSystems: "Systems",
    groupFriction: "Primary Friction",
    groupGoal: "Goal",
    groupContact: "Contact",
    employeesSuffix: "employees",
    locationsSuffix: "locations",
    noSystemsSelected: "No systems selected",
    notSpecified: "Not specified",
    edit: "Edit",
    consentText:
      "By submitting, you agree that MODUS may use this information to review your business and contact you about the diagnostic. Your information is not sold.",
    holdIdle: "Hold to Submit Diagnostic",
    holdHolding: "Submitting",
    holdComplete: "Diagnostic Received",
  },

  diagnosticProfilePanel: {
    label: "MODUS / Initial Profile",
    emptyProfile: "Your profile will build here as you answer.",
    preliminarySignals: "Preliminary Signals",
    emptySignals: "MODUS is watching for signals as you answer.",
    factIndustry: "Industry",
    factTeam: "Team",
    factLocations: "Locations",
    factSystems: "Systems",
    factSystemsIdentified: "identified",
    factManualWork: "Manual Work",
    factPrimaryFriction: "Primary Friction",
    factFriction: "Friction",
    factDependency: "Dependency",
  },

  diagnosticProgress: {
    stepLabel: "Step",
    complete: "Complete",
  },

  diagnosticSubmitTransition: {
    buildingProfile: "Building Initial Profile",
    identifyingSignals: "Identifying Signals",
    profileReady: "Profile Ready",
  },

  diagnosticSubmitError: {
    label: "Diagnostic / Not Sent",
    heading: "That didn't go through.",
    body: "Something interrupted the submission on our end. Your answers are still here — nothing has been lost.",
    retry: "Try again",
    backToReview: "Back to review",
  },

  diagnosticResult: {
    received: "Diagnostic / Received",
    heading: "Here's what stands out.",
    intro:
      "Based on your answers, MODUS has created an initial profile of where deeper analysis may be most valuable.",
    preliminaryNote: "This is a preliminary assessment, not a full MODUS diagnosis.",
    initialIndication: "Initial Indication",
    whereModusWouldLookFirst: "Where MODUS Would Look First",
    initialSignals: "Initial Signals",
    noSignals:
      "No strong preliminary signals from your answers alone. That's common, and a review will look deeper.",
    directionalOpportunity: "Directional Opportunity",
    timeRecovery: "Time Recovery",
    revenueImpact: "Revenue Impact",
    systemSimplification: "System Simplification",
    directional: "Directional",
    high: "HIGH",
    medium: "MEDIUM",
    low: "LOW",
    reviewTitle: "Review this with MODUS.",
    reviewBody:
      "A 30-minute review lets us validate these Signals, understand the underlying processes and determine what should actually be improved first.",
    scheduleReview: "Email your profile instead",
    preparingPdf: "Preparing PDF…",
    downloadPdf: "Download PDF Summary",
    talkToModus: "Talk to MODUS",
    emailNote: "Sends your Diagnostic answers straight to MODUS by email. No separate attachment needed.",
    emailSubject: (company: string) => `Schedule Diagnostic Review: ${company}`,
    newBusinessFallback: "New business",
    timelineSubmitted: "Diagnostic submitted",
    timelineReview: "MODUS reviews the information",
    timeline30Min: "30-minute review",
    timelinePriority: "Priority opportunities validated",
    timelineEngagement: "Potential engagement",
    backToHome: "Back to home",
    estimate: {
      label: "Engagement / Initial Estimate",
      heading: "Initial engagement range",
      perMonth: "per month",
      basedOn: "Based on your initial business profile.",
      lowerScope: "Lower Scope",
      higherScope: "Higher Scope",
      factorBusinessScale: "Business Scale",
      factorSystemFragmentation: "System Fragmentation",
      factorOperationalComplexity: "Operational Complexity",
      factorImplementationScope: "Implementation Scope",
      levelLow: "Low",
      levelModerate: "Moderate",
      levelHigh: "High",
      disclaimer:
        "This is an initial estimate based on the information you provided. Final pricing is determined after MODUS validates the underlying processes and systems.",
      manualScopeLabel: "Complex Engagement",
      manualScopeBody:
        "Your business appears to require a broader engagement. MODUS will determine the appropriate scope during your review.",
      manualScopeFrom: "Typically from",
      howPricingWorks: "How Pricing Works",
    },
  },

  diagnosticSystemMap: {
    businessLabel: "Business",
    placeholderCategories: ["Operations", "Customers", "Systems", "Data", "Revenue", "Automation"],
  },

  diagnosticWarpDetail: {
    label: "Signal / Preliminary",
    close: "Close",
    whyThisMatters: "Why This Matters",
    whatModusWouldInspect: "What MODUS Would Inspect",
    possibleIntervention: "Possible Intervention",
  },

  diagnosticRules: {
    signals: {
      spreadsheetDependency: {
        headline: "High spreadsheet dependency.",
        body: "Several core workflows may depend on manual information transfer between spreadsheets and other systems.",
        why: "When spreadsheets sit at the center of daily operations, growth tends to create more manual work rather than less, and errors compound quietly.",
        inspect: [
          "Which workflows touch a spreadsheet first",
          "Where data is copied rather than connected",
          "What breaks if the spreadsheet owner is out",
        ],
        intervention:
          "Replace the highest-traffic spreadsheet with a connected system, or automate the handoff around it.",
      },
      adminLoad: {
        headline: "Significant repetitive administration.",
        body: (adminHours: string) =>
          `You estimate ${adminHours.toLowerCase()} of repetitive administrative work each week.`,
        why: "Repetitive administrative work rarely shows up as a single problem. It shows up as a team that never quite has capacity for anything new.",
        inspect: [
          "Which tasks are done manually every week",
          "Whether the same data is entered more than once",
          "Who currently absorbs this work",
        ],
        intervention: "Map the highest-frequency manual task and automate or eliminate it first.",
      },
      fragmentedIntake: {
        headline: "Fragmented customer intake.",
        body: (channels: number) =>
          `Customers reach you through ${channels} channels, which may be creating inconsistent routing and follow-up.`,
        why: "Every additional channel without a shared system increases the chance an enquiry is missed or handled inconsistently.",
        inspect: [
          "Where enquiries land first",
          "Who is responsible for each channel",
          "What happens when nobody follows up",
        ],
        intervention: "Route every channel into one system with a single, owned follow-up process.",
      },
      keyPersonRisk: {
        headline: "Process knowledge concentration.",
        body: "Important operational knowledge may not yet be captured in systems. It may live mostly with specific people.",
        why: "This is a common, quiet operational risk. It doesn't cause problems until someone is unavailable, and then it causes several at once.",
        inspect: [
          "Which processes exist only as tribal knowledge",
          "What documentation currently exists",
          "What would break if a key person left",
        ],
        intervention: "Document the two or three processes with the highest concentration risk first.",
      },
      systemFragmentation: {
        headline: "Several systems may require manual transfer.",
        body: (systems: number) => `${systems} systems are in use, with limited connection between them.`,
        why: "Disconnected systems don't just cost time moving data. They create versions of the truth that quietly drift apart.",
        inspect: [
          "Which two systems share the most data",
          "How that data currently moves between them",
          "What breaks first when it doesn't",
        ],
        intervention: "Connect the two highest-friction systems before adding anything new.",
      },
      followupGap: {
        headline: "Follow-up may be inconsistent.",
        body: "Revenue-related friction combined with manual follow-up processes often points to leads that are lost quietly, not obviously.",
        why: "Most lost revenue from follow-up gaps never shows up as a complaint. It just shows up as a lower conversion rate nobody investigates.",
        inspect: [
          "What happens after the first response",
          "Whether follow-up timing is owned by a person or a system",
          "How many leads go cold with no clear reason",
        ],
        intervention: "Build a follow-up sequence that doesn't depend on someone remembering.",
      },
    },
    indicators: {
      operationalComplexity: "Operational Complexity",
      systemFragmentation: "System Fragmentation",
      automationMaturity: "Automation Maturity",
      processDependency: "Process Dependency",
      visibility: "Visibility",
      high: "HIGH",
      moderate: "MODERATE",
      low: "LOW",
      early: "EARLY",
    },
    focusAreas: {
      customerIntake: {
        name: "Customer Intake",
        why: (channels: number | string) => `${channels} enquiry channels with manual follow-up.`,
      },
      systemConnections: {
        name: "System Connections",
        why: (systems: number) => `${systems} tools identified, limited automatic connection.`,
      },
      administration: {
        name: "Administration",
        why: (adminHours: string) => `${adminHours} of repetitive work per week.`,
      },
      generalOperations: {
        name: "General Operations",
        why: "Based on the areas flagged as friction.",
      },
      multipleFallback: "Multiple",
    },
  },

  diagnosticValidation: {
    companyNameRequired: "Enter your company name.",
    companyNameTooLong: "Keep this under 80 characters.",
    companyNameInvalid: "Enter a valid company name.",
    websiteInvalid: "Enter a valid website address.",
    nameTooShort: "Enter at least 2 characters.",
    nameTooLong: "Keep this under 60 characters.",
    nameLooksLikeUrl: "This doesn't look like a name.",
    nameInvalid: "Enter a valid name.",
    nameInvalidChars: "Use letters, spaces, hyphens or apostrophes only.",
    emailTooLong: "Enter a shorter email address.",
    emailNoSpaces: "Email addresses can't contain spaces.",
    emailInvalid: "Enter a valid email address.",
    textareaTooShort: (min: number) => `Add a little more detail (at least ${min} characters).`,
    textareaTooLong: (max: number) => `Keep this under ${max} characters.`,
    textareaRepetitive: "Tell us a bit more, in your own words.",
  },

  fieldPhoto: {
    placeholder: "Field photography placeholder",
  },

  home: {
    hero: {
      label: "Business, without the friction",
      processLabel: "Observe · Diagnose · Implement · Measure",
      // Specified by the rebuild mandate (section 5) and matching the
      // MODUS homepage study. `headlineLines` carries the deliberate
      // two-line desktop break as data rather than letting it fall out of
      // whatever width the container happens to be; `headline` is kept as
      // the flat string for metadata and for anything that needs one
      // sentence.
      headline: "Find the friction. Move forward.",
      headlineLines: ["Find the friction.", "Move forward."],
      body: "MODUS connects the dots between your people, processes and tools. See what holds you back, and improve what actually matters.",
      ctaPrimary: "Run a Diagnostic",
      ctaSecondary: "See How It Works",
      scrollCue: "Scroll to explore",
      sceneBubbles: [
        "Friction detected",
        "Handoff mapped",
        "Improvement identified",
        "Workflow connected",
        "Progress reviewed",
      ],
      sceneBubblesNote:
        "The network illustrates the kinds of signal a MODUS diagnostic looks for. It is an illustration, not an analysis of your business.",
      rotatingPrefix: "Currently examining:",
      examining: [
        "CUSTOMER INTAKE",
        "MULTIPLE LOCATIONS",
        "TIME LOST",
        "REVENUE LOST",
        "FRICTION",
        "DISCONNECTED SYSTEMS",
        "MISSED OPPORTUNITIES",
      ],
    },
    // Supplied verbatim by the user. The five-line desktop composition is
    // deliberate — the line breaks are the composition, not an accident of
    // container width — so the lines are stored as data and rendered as
    // explicit blocks rather than being re-wrapped by the browser.
    manifesto: {
      lines: [
        "Most businesses don’t need more tools.",
        "They need to see what is slowing them down.",
        "Where time, money and attention are being lost.",
        "MODUS finds the friction, fixes what matters,",
        "and keeps improving what comes next.",
      ],
    },
    // Section 02. Three story steps beside the real 3D architecture scene.
    // Copy follows the MODUS homepage study; it describes how the work is
    // structured and makes no outcome claim.
    stack: {
      label: "02 / Where we sit",
      headingLines: ["A clearer view.", "A better way to work."],
      intro:
        "Between the way your business works today and what it could become. MODUS brings the whole picture together.",
      steps: [
        {
          id: "diagnose",
          eyebrow: "01 / Diagnose",
          heading: "See what is slowing you down.",
          body: "Start with your business. Map the friction across processes, systems and everyday work.",
        },
        {
          id: "improve",
          eyebrow: "02 / Improve",
          heading: "Fix what matters.",
          body: "Turn insight into focused changes, built around the work you actually do.",
        },
        {
          id: "evolve",
          eyebrow: "03 / Evolve",
          heading: "Keep moving forward.",
          body: "Keep learning from your operation and improve what comes next.",
        },
      ],
      diagram: {
        heading: {
          team: "Your business",
          improvements: "Focused improvements",
          insight: "Diagnostic insight",
          identity: "MODUS",
          production: "Your everyday operation",
          "category.sales": "Sales",
          "category.operations": "Operations",
          "category.finance": "Finance",
          "category.service": "Service",
          "category.tools": "Tools",
        },
        support: {
          team: "People, priorities and decisions",
          improvements: "Better processes. Connected systems.",
          insight: "A shared picture of the friction",
          production: "The work behind the work",
        },
        // Read by assistive technology in place of the canvas.
        description:
          "A layered diagram of a business: your business at the top, focused improvements and diagnostic insight in the middle alongside the MODUS identity, the business areas MODUS connects — sales, operations, finance, service and tools — and your everyday operation at the base.",
      },
    },
    diagnosticEntry: {
      label: "Start Here",
      heading: "What could work better?",
      placeholder: "Tell us where your business is getting stuck…",
      categories: ["Website", "Leads", "Processes", "Growth", "Not sure yet"],
    },
    process: {
      label: "The MODUS Loop",
      heading: "A continuous cycle, not a one-time fix.",
      body: "Every engagement runs the same six stages — for the first fix, and every one after it.",
      stages: [
        {
          id: "OBSERVE",
          heading: "Observe",
          body: "We connect to how the business actually runs — the people, the handoffs, the systems — and surface what matters.",
        },
        {
          id: "DIAGNOSE",
          heading: "Diagnose",
          body: "What we see becomes a specific, named signal — the true constraint, not a vague impression of one.",
        },
        {
          id: "PRIORITIZE",
          heading: "Prioritize",
          body: "Not every signal is worth acting on first. We rank by impact, effort and strategic value.",
        },
        {
          id: "IMPLEMENT",
          heading: "Implement",
          body: "A scoped change ships — process, software or system — tied to the exact signal that justified it.",
        },
        {
          id: "MEASURE",
          heading: "Measure",
          body: "We check whether it actually worked, and quantify what changed. Not whether it merely shipped.",
        },
        {
          id: "IMPROVE",
          heading: "Improve",
          body: "The change becomes part of the business. The loop returns to Observe — MODUS is already looking again.",
        },
      ],
    },
    pricingPreview: {
      label: "Engagement",
      heading: "Three ways to work with MODUS.",
      body: "Every engagement starts with a Free Diagnostic. Advertising spend is always shown separately from the retainer.",
      plans: [
        {
          name: "Essential",
          price: "€200",
          period: "/month",
          desc: "A steady, focused improvement cadence for a single constraint at a time.",
        },
        {
          name: "Intelligence",
          price: "€700",
          period: "/month",
          desc: "Deeper diagnostic work and more frequent implementation across the business.",
        },
        {
          name: "Growth",
          price: "€1,000",
          period: "/month",
          desc: "For businesses actively scaling operations, systems and demand.",
        },
      ],
      cta: "See full pricing",
    },
    // The orbital intelligence hero visual — five business domains around
    // a central MODUS core, replacing the earlier layered-3D concept.
    // `domains`/`descriptors` are matched by array index to the fixed
    // geometry defined in HeroOrbitalSystem.tsx — position/angle isn't
    // translated, only the label text.
    heroOrbital: {
      coreLabel: "MODUS / Active",
      domains: ["Customer", "Operations", "Systems", "Data", "Measurement"],
      // A qualitative read per domain, matched by index — demo/illustrative,
      // same discipline as the rest of the site: never a fabricated score.
      states: ["Attention", "Stable", "Developing", "Improving", "Observing"],
      // What shows in the "CURRENTLY EXAMINING" line while that domain is
      // focused (hover, focus, or click-locked).
      examining: [
        "Customer Experience",
        "Operations",
        "System Connectivity",
        "Visibility",
        "Performance",
      ],
      examiningDefault: "Business Friction",
      examiningSignal: "Customer Intake",
      // What MODUS looks at inside each domain — shown in the inspector,
      // matched by index to `domains`.
      observes: [
        ["Customer intake", "Response flow", "Follow-up", "Experience", "Conversion"],
        ["Workflow", "Ownership", "Capacity", "Repeated work", "Operational dependency"],
        ["Connectivity", "Manual handoffs", "Duplicate entry", "System ownership", "Data movement"],
        ["Visibility", "Quality", "Structure", "Reporting", "Decision readiness"],
        ["Performance", "Change", "Efficiency", "Business impact", "Outcome verification"],
      ],
      // Channels/tools/processes named in the inspector under each domain —
      // illustrative, not read from the domain's own actual system list.
      secondary: [
        ["Website", "Phone", "Email", "WhatsApp", "Booking"],
        ["People", "Process", "Approval", "Handoff", "Capacity"],
        ["CRM", "Email", "Booking", "Accounting", "Analytics"],
        ["Reporting", "Spreadsheets", "Database", "Analytics", "Sources"],
        ["Response Time", "Conversion", "Admin Hours", "Cost", "Output"],
      ],
      overviewTitle: "MODUS / Observing",
      overviewHeading: "5 Business Domains",
      overviewBody: "Continuous observation across customer, operations, systems, data and measurement.",
      overviewHint: "Move through the system to inspect.",
      whatModusObserves: "What MODUS Observes",
      channelsLabel: "Channels",
      signalId: "SIG / 021",
      signalTitle: "Customer Intake",
      signalStatus: "Preliminary",
      frictionDetected: "Friction Detected",
      signalObservation: "Multiple customer channels appear to depend on manual assignment.",
      impactLabel: "Impact",
      effortLabel: "Effort",
      statusLabel: "Status",
      impactHigh: "High",
      effortMedium: "Medium",
      viewInsight: "View Insight",
      // Kept from the previous version — no longer rendered directly, but
      // still used to build the default aria-label for each domain button.
      descriptors: [
        "Behavior & demand",
        "Processes & workflows",
        "Tools & connections",
        "Visibility & structure",
        "Performance & outcomes",
      ],
    },
    centralInsight: {
      headline1: "Most businesses don't need more software.",
      headline2: "They need to understand what is actually slowing them down.",
      body: "MODUS looks across operations, technology, data and customer experience to find the constraint and fix it.",
      link: "How MODUS works",
    },
    businessXRaySection: {
      label: "Business X-Ray",
      heading: "See what MODUS sees.",
      body: "Here's a real operational flow, showing a customer enquiry moving through a service business. Switch views to see where it actually breaks down.",
    },
    businessXRay: {
      context: "A multi-location service business, one customer enquiry",
      normalView: "Normal View",
      modusView: "MODUS View",
      whatHappensLabel: "What happens",
      whatDetectedLabel: "What MODUS detected",
      whyMattersLabel: "Why it matters",
      interventionLabel: "Possible intervention",
      footerNormal: "Switch to MODUS View to see where this breaks down.",
      footerModus: "This is what MODUS sees. Tap a step for detail.",
      steps: [
        {
          label: "Customer",
          whatHappens: "A potential customer decides to reach out.",
          why: "This is the first moment of the relationship.",
        },
        {
          label: "Website / Phone",
          whatHappens: "They call, or fill out a form.",
          why: "The channel shapes how much detail MODUS can capture from the start.",
        },
        {
          label: "Enquiry",
          whatHappens: "The enquiry lands in an inbox or a phone log.",
          why: "From here, speed of handling starts to matter.",
        },
        {
          label: "Employee",
          whatHappens: "An employee reads it and manually copies the details into the CRM.",
          detected: "Manual data entry, duplicated across two systems.",
          why: "Every manual transfer adds delay and a chance of error.",
          intervention: "Automated intake that writes directly to the CRM.",
          friction: "+14 MIN",
          frictionLabel: "Manual copy into CRM",
        },
        {
          label: "CRM",
          whatHappens: "The enquiry sits in a queue until someone has time to quote it.",
          detected: "Average 17 hour wait before a quote goes out.",
          why: "Customers form their impression of you in the first few hours, not days.",
          intervention: "Priority queueing with response-time alerts.",
          friction: "AVG DELAY / 17H",
          frictionLabel: "Quote preparation delay",
        },
        {
          label: "Quote",
          whatHappens: "A quote is written by hand and emailed over.",
          detected: "No automated follow-up sequence exists after this point.",
          why: "Most customers who don't hear back simply go elsewhere.",
          intervention: "A scheduled, automated follow-up sequence.",
          friction: "NO AUTOMATION",
          frictionLabel: "No follow-up sequence",
        },
        {
          label: "Follow-up",
          whatHappens: "Nobody follows up again unless the customer chases it.",
          detected: "38% of quotes never convert into a booking.",
          why: "This is where revenue is actually being lost.",
          intervention: "Timed nudges based on how customers actually decide.",
          friction: "38% DROP-OFF",
          frictionLabel: "Quote-to-booking drop-off",
        },
        {
          label: "Booking",
          whatHappens: "The customer confirms, and a booking is created.",
          why: "The moment both the work and the relationship actually begin.",
        },
        {
          label: "Invoice",
          whatHappens: "The job is completed and invoiced.",
          why: "The full journey, start to finish.",
        },
      ],
      outcomes: [
        { value: "3", label: "Manual steps removed" },
        { value: "−11.4H", label: "Recovered per week" },
        { value: "42% → 100%", label: "Follow-up coverage" },
      ],
    },
    modusExperience: {
      label: "The MODUS Experience",
      heading: "What happens when MODUS enters your business?",
      stages: [
        {
          title: "We listen.",
          copy: "We talk with the people who actually operate the company. Not just leadership.",
          caption: "Reception desk, first conversation.",
        },
        {
          title: "We observe.",
          copy: "We trace how customers, information and work actually move through the business.",
          caption: "Order entry, back office.",
        },
        {
          title: "We intervene.",
          copy: "We redesign the process, software or system creating the constraint.",
          caption: "Implementation in progress.",
        },
        {
          title: "We stay.",
          copy: "We measure what changed, and continue looking for the next improvement.",
          caption: "Verified outcome, dashboard review.",
        },
      ],
    },
    engagementTeaser: {
      label: "The Engagement",
      loop: ["Diagnose", "Prioritize", "Implement", "Measure", "Continue"],
      cta: "See what's included in a MODUS engagement",
    },
    platformTeaser: {
      label: "Platform",
      heading: "Everything MODUS sees. In one place.",
      body: "Business health, signals, active work and measured outcomes, always visible. Not an inbox you wait on.",
      link: "Explore the MODUS Platform",
    },
    proofSection: {
      label: "Recently Improved",
      heading: "From fragmented to focused.",
      context: "Multi-location service business · Illustrative example",
      body: "Unified its systems, automated manual work and cut response time. That's a representative pattern of what a MODUS engagement targets.",
      link: "Read the case",
      metrics: [
        { value: "78%", label: "Faster response time" },
        { value: "26%", label: "Increase in bookings" },
        { value: "€42K+", label: "Annual value created" },
      ],
    },
    philosophy: {
      label: "Philosophy",
      heading: "Businesses are systems.",
      body: "MODUS looks beyond the visible symptom. We understand the system around it. Then we improve the system.",
      examples: [
        { symptom: "A customer service problem", real: "may actually be a workflow problem." },
        { symptom: "A sales problem", real: "may actually be a follow-up problem." },
        { symptom: "A reporting problem", real: "may actually be a data architecture problem." },
        { symptom: "An automation problem", real: "may actually be a badly designed process." },
      ],
    },
  },

  finalCTA: {
    label: "Get Started",
    heading: "What would MODUS find in your business?",
    body: "Find where your business is losing time, performance or opportunity.",
    ctaPrimary: "Run a Diagnostic",
    ctaSecondary: "Talk to MODUS",
    footnote: "No generic AI audit. No 40-page report. No obligation to implement everything.",
  },

  howItWorks: {
    hero: {
      label: "How MODUS Works",
      headline: "Growing businesses become complicated before they become optimized.",
      body: "Most businesses know they could operate better. They simply don't know where the largest opportunities are, or what should be fixed first. That is where MODUS begins.",
    },
    symptoms: [
      "Manual processes become permanent.",
      "Software stops communicating.",
      "Customer data becomes fragmented.",
      "Teams repeat the same work.",
      "Opportunities go unnoticed.",
      "Technology gets added without fixing the underlying process.",
    ],
    modusLoop: {
      label: "How MODUS Works",
      heading: "A continuous loop of improvement.",
      body: "We don't just advise. We embed, implement and continuously improve your systems, processes and performance.",
      steps: [
        { name: "Observe", copy: "We connect to your systems and surface what matters." },
        { name: "Understand", copy: "We analyze signals and find the true constraints." },
        { name: "Prioritize", copy: "We rank opportunities by impact, effort and strategic value." },
        { name: "Intervene", copy: "We implement the right changes across people, process and technology." },
        { name: "Measure", copy: "We track outcomes, quantify impact and learn continuously." },
        { name: "Improve", copy: "The change becomes part of the business. Then we look again." },
      ],
      footer: "Improve returns to Observe. The loop continues.",
    },
    notConsulting: {
      label: "From Insight to Implementation",
      heading: "Advice is only useful when something changes.",
      traditionalLabel: "Traditional Consultancy",
      traditionalSteps: ["Analyze", "Recommend", "Present", "Leave"],
      endLabel: "End",
      modusLabel: "MODUS",
      modusSteps: ["Analyze", "Prioritize", "Implement", "Measure", "Continue"],
      ongoingLabel: "Ongoing",
    },
    alternatives: {
      label: "Why Not Just...",
      heading: "The realistic alternatives, honestly.",
      items: [
        {
          option: "Hire a freelancer",
          limit: "Good at one skill. The constraint is rarely confined to one.",
        },
        {
          option: "Hire someone internally",
          limit: "Slow to find, slower to ramp, and idle the moment there's nothing left to fix.",
        },
        {
          option: "Buy another tool",
          limit: "Adds a system. Doesn't explain why the current ones don't talk to each other.",
        },
        {
          option: "A general digital agency",
          limit: "Builds what you ask for. Doesn't diagnose whether you're asking for the right thing.",
        },
        {
          option: "Keep doing it manually",
          limit: "The friction doesn't go away. It just stays quiet and compounds.",
        },
      ],
      body: "MODUS starts with diagnosis, works across disciplines, and stays involved after the first fix. None of the alternatives above do all three.",
    },
    aiCapability: {
      label: "AI",
      heading: "AI is a capability. Not the strategy.",
      body1: "MODUS uses AI where it creates a practical business advantage. We will never recommend it simply because it is available.",
      body2: "The objective remains the same: make the business work better.",
      whereItApplies: "Where it applies",
      applications: [
        "Document processing",
        "Customer support",
        "Internal knowledge",
        "Lead qualification",
        "Workflow automation",
        "Reporting",
      ],
    },
    continuity: {
      headline: "The business doesn't stop changing after we fix one problem.",
      drivers: [
        "New employees join.",
        "Customer behavior changes.",
        "Software changes.",
        "Processes evolve.",
        "New technology appears.",
        "New bottlenecks form.",
      ],
      body: "Improvement can't be a project with a final delivery date. MODUS stays involved, observing, improving, measuring, repeating.",
    },
    faq: {
      label: "FAQ",
      heading: "Common questions.",
      items: [
        {
          q: "How long does a first diagnostic take?",
          a: "Usually 3–5 minutes to submit, followed by a review call once MODUS has looked at what you've shared.",
        },
        {
          q: "Do we need to replace our existing software?",
          a: "Rarely entirely. MODUS usually connects, automates or replaces individual pieces rather than your whole stack.",
        },
        {
          q: "What if we don't know what's wrong?",
          a: "That's the most common starting point. Diagnosis is what MODUS does first, not something you need to arrive with.",
        },
        {
          q: "Is this a one-off project?",
          a: "No. MODUS stays connected after the first intervention, because businesses keep changing after the first fix.",
        },
      ],
    },
  },

  platform: {
    hero: {
      label: "Platform",
      headline: "Your business. Understood.",
      body: "Core and Partner engagements include access to a private improvement platform showing business health, signals, active improvements and outcomes, always visible. Not an inbox you wait on.",
    },
    modusBrief: {
      label: "MODUS Brief",
      heading: "A short brief, every morning.",
      body: "Not a dashboard you have to interpret. A short, plain-language summary of what changed and what needs attention.",
      dateLabel: "Wednesday / 28 August",
      greeting: "Good morning. Your business is stable.",
      signalsNote: "Two Signals require attention.",
      stat1: "Intervention active",
      stat2: "Signals assessed",
      stat3: "Urgent issues",
      impactLabel: "Estimated impact this month",
      impactValue: "26 hours recovered",
    },
    clientDay: {
      label: "A Client Day",
      heading: "MODUS behaves. It doesn't just sit there.",
      events: [
        { time: "08:31", text: "MODUS detected response time increasing." },
        { time: "09:04", text: "Signal assessed." },
        { time: "11:20", text: "Potential cause identified." },
        { time: "13:42", text: "Intervention proposed." },
        { time: "Next day", text: "Approved. Customer intake routing moved to Active." },
      ],
    },
    askModus: {
      label: "Ask MODUS",
      heading: "Ask it directly.",
      body: "What makes MODUS more than a portal is a compact conversational interface over your own operational data.",
      headerLabel: "MODUS / Ask",
      question: "Why did booking conversion fall last week?",
      answer:
        "The largest change occurred after the appointment form was updated on 19 August. Mobile completion fell from 71% to 54%. I recommend reviewing the address step first.",
      viewSignal: "View Signal",
      openFormAnalysis: "Open Form Analysis",
    },
    mockup: {
      panelLabel: "Platform",
      nav: [
        { id: "overview", label: "Overview" },
        { id: "signals", label: "Signals" },
        { id: "improvements", label: "Improvements" },
        { id: "performance", label: "Performance" },
        { id: "systems", label: "Systems" },
        { id: "askModus", label: "Ask MODUS" },
      ],
    },
    panels: {
      overview: {
        businessHealth: "Business Health",
        stableStatus: "Stable · +4 since July",
        signals: "Signals",
        nextReview: "Next review 04 Sep 2026",
        activeImprovements: "Active Improvements",
        activeImprovementsDetail: "Customer intake · CRM sync · Checkout",
        annualizedImpact: "Annualized Impact",
        annualizedImpactValue: "€18,420",
        annualizedImpactDetail: "124 hrs removed · +0.8% conv.",
      },
      signals: {
        filters: { ALL: "ALL", HIGH: "HIGH", ASSESSED: "ASSESSED", NEW: "NEW" },
        severity: { HIGH: "HIGH", MEDIUM: "MEDIUM" },
        status: { DETECTED: "DETECTED", ASSESSED: "ASSESSED", PRIORITIZED: "PRIORITIZED" },
        statusPrefix: "Status:",
        noneMatch: "No signals match this filter.",
        items: [
          {
            system: "Customer Intake",
            text: "Response delay increased 18%.",
          },
          {
            system: "Checkout",
            text: "Mobile completion dropped 7%.",
          },
          {
            system: "Administration",
            text: "Duplicate data entry found. Estimated impact 6.4 hrs/week.",
          },
        ],
      },
      improvements: {
        lifecycle: {
          DETECTED: "DETECTED",
          ASSESSED: "ASSESSED",
          PRIORITIZED: "PRIORITIZED",
          ACTIVE: "ACTIVE",
          MEASURING: "MEASURING",
          VERIFIED: "VERIFIED",
        },
        items: [
          {
            name: "Customer Intake Automation",
            detail: "Progress 68% · Owner MODUS · Expected measurement 03 Sep",
          },
          {
            name: "CRM Data Sync",
            detail: "Baseline 14 duplicate entries/week · Current 2",
          },
          {
            name: "Checkout Simplification",
            detail: "Estimated impact +0.4–0.9pp conversion",
          },
        ],
      },
      performance: {
        metrics: [
          { label: "Response Time", before: "14h 22m", after: "2h 48m" },
          { label: "Conversion", before: "2.7%", after: "3.5%" },
          { label: "Manual Admin", before: "148 hrs", after: "117 hrs" },
          { label: "Operational Cost", before: "€8,420", after: "€7,930" },
        ],
      },
      systems: {
        overviewTitle: "Systems Overview",
        summary: (count: number, issues: number) =>
          `${count} connected systems · ${issues} issue · Last sync 2m ago`,
        viewAll: "View All Systems",
        statConnected: "Connected",
        statConnectedDetail: (count: number) => `of ${count} identified`,
        statHealth: "Health",
        statHealthValue: "Good",
        statHealthDetail: (issues: number) => `${issues} issue needs attention`,
        statDataFlow: "Data Flow",
        statDataFlowDetail: "Successful sync rate",
        statLastSync: "Last Sync",
        statLastSyncDetail: "All critical systems",
        landscapeTitle: "System Landscape",
        legendHealthy: "Healthy",
        legendIssue: "Issue",
        legendNoConnection: "No Connection",
        coreLabel: "Core",
        coreValue: "Business",
        clickPrompt: "Click a system to view details and recent activity.",
        dataFlowPrefix: "Data flow:",
        healthTitle: "System Health",
        statusHealthy: "Healthy",
        statusIssue: "Connection issue",
        viewAllIntegrations: "View all systems and integrations",
        categories: {
          CRM: "CRM",
          Website: "Website",
          Email: "Email",
          Booking: "Booking",
          POS: "POS",
          Accounting: "Accounting",
          Analytics: "Analytics",
          Advertising: "Advertising",
        },
        flows: {
          hubspot: "Website, email -> Sales",
          webflow: "Enquiries -> CRM",
          workspace: "CRM <-> Customer",
          calendly: "CRM -> Booking -> POS",
          exact: "POS -> Accounting",
          lightspeed: "Booking -> POS -> Accounting",
        },
      },
      askModus: {
        question: "Why did conversion fall last week?",
        answer:
          "The largest change happened after the booking form update on 19 August. Mobile completion fell from 71% to 54%.",
        primarySignal: "Primary Signal",
        addressStep: "Address Step",
        recommendation: "Recommendation",
        reviewMobileInput: "Review mobile input",
        viewSignal: "View Signal",
        openFormAnalysis: "Open Form Analysis",
      },
    },
  },

  capabilities: {
    hero: {
      label: "Capabilities",
      headline: "Different disciplines. One objective.",
      body: "We don't sell isolated digital services. We use whatever discipline is required to improve the business.",
    },
    groups: [
      {
        name: "Operations",
        copy: "Streamline processes and reduce friction.",
        items: ["Processes", "Workflow", "Administration", "Handoffs"],
      },
      {
        name: "Technology",
        copy: "Improve software infrastructure and eliminate unnecessary complexity.",
        items: ["Software", "Integrations", "Internal tools", "Infrastructure"],
      },
      {
        name: "Intelligence",
        copy: "Turn fragmented information into usable decision support.",
        items: ["Data", "Reporting", "Dashboards", "Decision support"],
      },
      {
        name: "Automation",
        copy: "Remove repetitive work and apply AI where practical.",
        items: ["Workflow automation", "AI", "Document processing", "Customer communication"],
      },
      {
        name: "Customer",
        copy: "Remove friction from how customers find, buy from and stay with you.",
        items: ["Booking", "Conversion", "Sales systems", "Customer experience"],
      },
    ],
  },

  results: {
    hero: {
      label: "Results",
      headline: "What changed.",
      body: "Evidence, not portfolio cards. Real client information where it exists, and clearly marked where it doesn't yet.",
    },
    impactMetrics: {
      label: "Measurable Impact",
      heading: "Measure improvement, not activity.",
      illustrativeNote: "Illustrative example values. Figures update per engagement.",
      responseTime: {
        label: "Average response time decrease",
        detail: "Across customer-facing processes",
        before: "14h 22m",
        after: "2h 48m",
      },
      hoursUnit: " hrs",
      metrics: [
        { label: "Conversion rate increase", detail: "Average improvement after intervention" },
        { label: "Manual work removed per month", detail: "Across administrative processes" },
        { label: "Average annual value created", detail: "Per client, through quantified improvements" },
      ],
    },
    resultsCase: {
      label: "Case · Illustrative Example",
      heading: "From fragmented to focused.",
      metrics: [
        { value: "78%", label: "Faster response time" },
        { value: "26%", label: "Increase in bookings" },
        { value: "€42K+", label: "Annual value created" },
      ],
      fields: [
        {
          label: "Context",
          text: "A multi-location service business, six employees handling customer intake across phone, email and a booking form.",
        },
        {
          label: "Signal",
          text: "Average quote response time was increasing month over month, with no single owner of the process.",
        },
        {
          label: "Baseline",
          text: "17H 42M average time from enquiry to quote. No automated follow-up after a quote went out.",
        },
        {
          label: "Intervention",
          text: "Automated intake routing into the CRM, a scheduled follow-up sequence, and a shared response-time dashboard.",
        },
        {
          label: "Outcome",
          text: "Response time fell to 3H 06M. Follow-up coverage went from partial to 100% of quotes.",
        },
        {
          label: "What MODUS learned",
          text: "The bottleneck was never the CRM itself. It was that no step in the process owned moving a lead forward.",
        },
      ],
    },
  },

  company: {
    hero: {
      label: "Company",
      headline: "Businesses rarely break all at once.",
      body: "They become inefficient one workaround at a time. A temporary fix becomes permanent. A spreadsheet becomes infrastructure. Nobody owns fixing the whole system, so nobody does. MODUS exists to be that owner.",
    },
    humanPresence: {
      label: "Human Presence",
      heading: "Real people applying judgment.",
      body: "MODUS is a system and a team. Not an autonomous piece of software making decisions on your behalf.",
      photoCaptions: [
        "Founder, working notes.",
        "Client observation, on site.",
        "System diagram, early draft.",
      ],
    },
    categoryStatement: {
      headline1: "Your business needs systems for operating.",
      headline2: "It also needs a system for improving.",
      body: "MODUS is Improvement Infrastructure for growing businesses, a permanent layer whose responsibility is simple: find where the business can operate better, implement the change, and continue looking.",
    },
  },

  pricing: {
    // Shown directly beside every price figure on the site (the generic
    // tiers, the personalized estimate, and the diagnostic result) —
    // deliberately one shared sentence, not a features/deliverables list:
    // saying exactly what's included would let a visitor just copy the
    // list and shop it around instead of engaging MODUS.
    compositionNote:
      "This number isn't built from a list of features or hours. It reflects the responsibility MODUS takes for continuously finding, implementing and measuring improvements in your business — priced by your operational complexity, systems and priorities, not a menu you assemble yourself.",
    hero: {
      label: "Pricing / Engagement",
      headline: "Built around your business.",
      body: "MODUS engagements are shaped by your operational complexity, systems, priorities and the improvements we're responsible for implementing.",
      ctaPrimary: "Get Your Personal Price",
      ctaSecondary: "Compare Scope",
      microEstimate: "Personal Estimate",
      microTime: "~4 Min Diagnostic",
      microObligation: "No Obligation",
    },
    guidance: {
      label: "Pricing / Guidance",
      heading: "Know the range before we talk.",
      startingLabel: "Starting Engagement",
      typicalLabel: "Typical Engagements",
      complexLabel: "Complex Engagements",
      complexNote: "Custom scope",
      from: "From",
      diagnosticLabel: "Initial Business Diagnostic",
      diagnosticValue: "Free",
      perMonth: "/ month",
    },
    engagementStack: {
      label: "Engagement / Included",
      heading: "What your engagement can include.",
      body: "These capabilities are scoped to your engagement. Essentials is deliberately limited; Core and Partner add MODUS OS and ongoing implementation. Tools and capacity follow the agreed priorities.",
      expand: "Expand",
      collapse: "Collapse",
      items: [
        {
          id: "01",
          title: "MODUS Diagnostic",
          benefit: "Understand where to look.",
          status: "Included",
          detail: {
            heading: "What MODUS Examines",
            items: ["Customer", "Operations", "Systems", "Data", "Measurement"],
            purpose: "Establishes where deeper investigation is worth spending time.",
          },
        },
        {
          id: "02",
          title: "Business X-Ray",
          benefit: "See how the system fits together.",
          status: "Included",
          detail: {
            heading: "Maps",
            items: ["Channels", "Processes", "Systems", "Handoffs", "Dependencies"],
            purpose: "Makes hidden operational relationships visible.",
          },
        },
        {
          id: "03",
          title: "Signal Detection",
          benefit: "Find what deserves attention.",
          status: "Continuous",
          detail: {
            heading: "Potential Signals",
            items: [
              "Repeated administration",
              "Slow response",
              "Fragmented systems",
              "Customer friction",
              "Lost visibility",
              "Conversion leakage",
            ],
            purpose: "Surfaces problems and opportunities before they become permanent.",
          },
        },
        {
          id: "04",
          title: "Improvement Prioritization",
          benefit: "Work on the right problem first.",
          status: "Included",
          detail: {
            heading: "Assessed Against",
            items: ["Business importance", "Potential impact", "Implementation effort", "Risk", "Feasibility", "Timing"],
            purpose: "Avoids spending on the wrong improvement first.",
          },
        },
        {
          id: "05",
          title: "Implementation",
          benefit: "Turn insight into change.",
          status: "Included",
          detail: {
            heading: "MODUS May",
            items: [
              "Redesign a workflow",
              "Connect systems",
              "Build automation",
              "Modify software",
              "Create reporting",
              "Improve customer intake",
            ],
            purpose: "Advice only creates value when something actually changes.",
          },
        },
        {
          id: "06",
          title: "Implementation Capability",
          benefit: "Use the right tool for the problem.",
          status: "As Required",
          detail: {
            heading: "Capabilities May Include",
            items: ["Automation", "AI", "Software", "Data", "Integrations", "Customer Experience"],
            note: "Implementation is shaped by the complexity of each Improvement. Larger engineering work may require additional scope.",
          },
        },
        {
          id: "07",
          title: "Measurement",
          benefit: "Know whether it worked.",
          status: "Included",
          detail: {
            heading: "Measurement May Include",
            items: ["Response time", "Manual hours", "Conversion", "Cost", "Errors", "Capacity"],
            purpose: "Baseline, then intervention, then measurement, then result.",
          },
        },
        {
          id: "08",
          title: "MODUS OS",
          benefit: "See what MODUS sees.",
          status: "Core & Partner",
          detail: {
            heading: "Visible Inside MODUS",
            items: ["Signals", "Active Improvements", "Performance", "Systems", "Reviews", "What's Next"],
            purpose: "The visibility layer for the engagement, not a separate subscription.",
          },
        },
        {
          id: "09",
          title: "Business Reviews",
          benefit: "Understand what changed and what's next.",
          status: "Continuous",
          detail: {
            heading: "Every Review Answers",
            items: [
              "What changed?",
              "What did MODUS complete?",
              "What is being measured?",
              "What needs attention?",
              "What is next?",
            ],
          },
        },
        {
          id: "10",
          title: "Continuous Improvement",
          benefit: "One improvement reveals the next.",
          status: "Ongoing",
          detail: {
            heading: "Why This Continues",
            items: ["Teams grow", "Systems change", "Processes drift", "New bottlenecks appear", "New opportunities emerge"],
            purpose: "MODUS keeps observing the business rather than stopping after one project.",
          },
        },
      ],
      closingLine:
        "You are not paying MODUS for a list of services. You are giving one function responsibility for continuously improving how the business works.",
    },
    notServices: {
      label: "From Insight to Implementation",
      heading: "Not hours. Not individual services.",
      body: "Your MODUS engagement gives us responsibility for continuously finding, implementing and measuring improvements across the business. Those disciplines are what we deploy inside it, not separate things you buy.",
      disciplines: [
        "Business Engineering",
        "Operations",
        "Software & Systems",
        "Data & Reporting",
        "Automation & AI",
        "Customer Experience",
        "Revenue Systems",
        "Measurement",
      ],
    },
    variables: {
      label: "Engagement / Variables",
      heading: "What shapes an engagement.",
      low: "Low",
      high: "High",
      items: [
        {
          id: "01",
          name: "Operational Complexity",
          body: "How many workflows, teams and dependencies exist inside the business.",
        },
        {
          id: "02",
          name: "System Landscape",
          body: "How many platforms exist and how well they communicate with each other.",
        },
        {
          id: "03",
          name: "Implementation Scope",
          body: "How much MODUS needs to build, connect, automate or redesign.",
        },
        {
          id: "04",
          name: "Company Scale",
          body: "The number of people, locations and customers the business operates across.",
        },
        {
          id: "05",
          name: "Improvement Intensity",
          body: "How frequently MODUS is expected to identify and implement change.",
        },
      ],
    },
    estimateCta: {
      label: "Personal Estimate",
      heading: "Find out what MODUS would cost for your business.",
      body: "Complete the free Business Diagnostic. We'll use your company structure, systems and current friction to calculate an initial engagement range.",
      cta: "Run Free Diagnostic",
      microTime: "~4 Min",
      microObligation: "No Obligation",
      microEstimate: "Personal Estimate",
    },
    process: {
      label: "Pricing / Process",
      heading: "Pricing starts with understanding.",
      body: "MODUS cannot responsibly price an engagement without first understanding how the business operates. That's a differentiator, not a delay.",
      steps: [
        "Initial Diagnostic",
        "Initial Profile",
        "Preliminary Signals",
        "Engagement Estimate",
        "MODUS Review",
        "Final Scope",
      ],
    },
    faq: {
      label: "Pricing / Questions",
      heading: "Common questions.",
      items: [
        {
          q: "How much does MODUS cost?",
          a: "Indicative monthly tiers are about €200, €700 and €1,000. Essentials is deliberately limited; Core and Partner include MODUS OS. Your diagnostic gives a personal range, and the reviewed scope determines the quote. Complex work may require a separate scope.",
        },
        {
          q: "Why isn't there one fixed price?",
          a: "Every business has a different mix of systems, friction and scale. Pricing reflects the complexity MODUS takes responsibility for, not a generic package.",
        },
        {
          q: "How is my estimate calculated?",
          a: "From your Diagnostic answers, using a fixed set of business factors: scale, systems, operations, friction and improvement intensity. The same answers always produce the same estimate.",
        },
        {
          q: "Is the Diagnostic free?",
          a: "Yes. There's no cost and no obligation to continue afterward.",
        },
        {
          q: "Is the estimate final?",
          a: "No. It's an initial range based on what you tell us. MODUS validates it in a short review before anything is agreed.",
        },
        {
          q: "What happens after the Diagnostic?",
          a: "You'll see an initial engagement range immediately, and can schedule a short review where MODUS validates the Signals and confirms the final scope.",
        },
        {
          q: "Does MODUS charge separately for development?",
          a: "Some engagements include a one-time setup fee for the first phase of implementation. That's discussed during your review, not hidden inside the monthly price.",
        },
        {
          q: "Can we start with one specific issue?",
          a: "Yes. Many engagements begin narrow and expand as MODUS finds more to improve.",
        },
        {
          q: "Do I have to commit long term?",
          a: "No fixed multi-year contract. MODUS earns the engagement by continuing to find and implement improvement.",
        },
      ],
    },
  },
};

export type Dictionary = typeof en;

export const chatRulesEn: ChatRule[] = [
  {
    id: "pricing",
    keywords: ["price", "pricing", "cost", "how much", "expensive", "fee"],
    response:
      "MODUS works on an ongoing engagement model, because improvement does not stop after one project. Pricing depends on business complexity and the scope of systems we support. The best starting point is the diagnostic.",
    actions: [
      { label: "Run Diagnostic", href: "/diagnostic" },
      { label: "Talk to MODUS", href: "mailto:hello@modus.example.com" },
    ],
  },
  {
    id: "about",
    keywords: ["what do you do", "what is modus", "services", "about"],
    response:
      "MODUS continuously identifies where a business is losing time, efficiency or opportunity. Then it implements the systems, technology or process changes that improve it.",
    actions: [{ label: "How MODUS Works", href: "/how-it-works" }],
  },
  {
    id: "ai",
    keywords: ["ai", "automation", "artificial intelligence"],
    response:
      "MODUS uses automation and AI when they solve a real operational problem. They are tools, not the product. The objective is always to make the business work better.",
    actions: [{ label: "View Capabilities", href: "/capabilities" }],
  },
  {
    id: "diagnostic",
    keywords: ["diagnostic", "audit", "assessment"],
    response:
      "The MODUS Diagnostic is the starting point. We look across operations, technology, data and customer experience to identify where deeper improvement may be valuable.",
    actions: [{ label: "Start Diagnostic", href: "/diagnostic" }],
  },
  {
    id: "platform",
    keywords: ["platform", "app", "dashboard", "software"],
    response:
      "The MODUS Platform gives clients one place to see Business Health, Signals, active Improvements, Performance, connected Systems and communication with MODUS.",
    actions: [{ label: "Explore Platform", href: "/platform" }],
  },
  {
    id: "contact",
    keywords: ["contact", "talk", "human", "call", "email", "someone"],
    response: "You can talk directly with MODUS about your business and what you want to improve.",
    actions: [{ label: "Contact MODUS", href: "mailto:hello@modus.example.com" }],
  },
];

export const fallbackResponseEn =
  "There is no predefined answer for that yet. You can ask about the diagnostic, platform, pricing, automation, AI, capabilities or how MODUS works.";

export const fallbackChipsEn = ["Diagnostic", "Platform", "Pricing", "AI", "Capabilities", "Contact"];

export const quickRepliesEn = [
  "What is MODUS?",
  "How does the diagnostic work?",
  "What can MODUS improve?",
  "How does pricing work?",
  "How does the platform work?",
  "Can I talk to someone?",
];
