import type { DiagnosticEmailInput } from "../diagnosticEmails";

/**
 * Fictional diagnostics, chosen to be the cases a template gets wrong.
 *
 * Nothing here is a real submission, a real company or a real address.
 */

export const base: DiagnosticEmailInput = {
  id: "cmpreview0000example0000",
  firstName: "Sanne",
  lastName: "de Vries",
  companyName: "Bakkerij de Vries",
  email: "sanne@bakkerijdevries.example",
  phone: "+31 6 12 34 56 78",
  primaryInterest: "klanten opvolgen",
  priorities: ["Tijd besparen", "Meer aanvragen omzetten"],
  problemDescription:
    "Offertes gaan nu per mail de deur uit en daarna raken we het spoor bijster. Niemand weet wie wat heeft nagebeld.",
  industry: "Bakkerij / Food",
  employees: "6–20",
  locations: "2–5",
  reachChannels: ["Telefoon", "Website formulier", "Walk-in"],
  systems: ["Kassa", "Boekhouding", "Planning"],
  connectionLevel: "Grotendeels handmatig",
  adminHours: "5–10 uur",
  friction: ["Offertes", "Opvolging", "Planning"],
  primaryPain: "Opvolging",
  timing: "Binnen 30 dagen",
  estimateMin: 4500,
  estimateMax: 9000,
  pricingBand: "Focused",
  manualScopeRequired: false,
  submittedAt: new Date("2026-10-04T09:58:49.000Z"),
};

/** The long end: a visitor who wrote a lot, in every field that allows it. */
export const long: DiagnosticEmailInput = {
  ...base,
  firstName: "Alexandra-Wilhelmina",
  lastName: "van der Heijden-Brouwerszoon",
  companyName: "Van der Heijden Installatietechniek & Onderhoud Noord-Nederland B.V.",
  email: "alexandra.vanderheijden@installatietechniek-noord-nederland.example",
  primaryInterest: "de volledige offerte- en nacalculatiestroom van begin tot eind",
  priorities: [
    "Tijd besparen op administratie",
    "Meer aanvragen omzetten in opdrachten",
    "Minder fouten in de planning",
    "Beter zicht op marge per project",
  ],
  problemDescription:
    "Elke aanvraag komt binnen via de mail, de telefoon of het formulier, en wordt daarna met de hand overgetypt in de planning.\n\n" +
    "Daar gaat het mis: de monteur ziet een andere versie dan de planner, en de nacalculatie klopt achteraf nooit. We hebben drie keer geprobeerd het met een spreadsheet op te lossen en elke keer loopt het binnen twee maanden weer vast omdat niemand hem bijhoudt.\n\n" +
    "Wat ik eigenlijk wil is dat een aanvraag één keer wordt ingevoerd en daarna vanzelf meegaat naar de offerte, de planning en de factuur.",
  systems: ["CRM", "Boekhouding", "Planning", "Urenregistratie", "Voorraad", "Kassa"],
  friction: ["Offertes", "Opvolging", "Planning", "Facturatie", "Voorraad"],
  estimateMin: 18000,
  estimateMax: 32000,
  pricingBand: "Comprehensive",
};

/** The sparse end: only what the form actually requires. */
export const sparse: DiagnosticEmailInput = {
  ...base,
  firstName: "Tom",
  lastName: "Jansen",
  companyName: "",
  email: "tom@example.test",
  phone: "",
  primaryInterest: "",
  priorities: [],
  problemDescription: "",
  industry: "",
  employees: "1–5",
  locations: "1",
  reachChannels: [],
  systems: [],
  connectionLevel: "",
  adminHours: "",
  friction: [],
  primaryPain: "",
  timing: "",
  estimateMin: null,
  estimateMax: null,
  pricingBand: "",
  manualScopeRequired: false,
};

/** Priority stated only through `priorities`, and a scope the model would not price. */
export const manualScope: DiagnosticEmailInput = {
  ...base,
  primaryInterest: "",
  priorities: ["Meer aanvragen krijgen"],
  manualScopeRequired: true,
  estimateMin: null,
  estimateMax: null,
  pricingBand: "",
};

/** Content that would break a template that forgot to escape. */
export const injection: DiagnosticEmailInput = {
  ...base,
  firstName: '<script>alert("xss")</script>',
  companyName: 'Bakkerij "de Vries" & Zn <b>BV</b>',
  problemDescription:
    'We gebruiken nu <img src=x onerror=alert(1)> en een "offerte" & een \'planning\'.',
  email: "injection@example.test",
};

/** A header-injection attempt, which belongs in the subject line's test. */
export const headerInjection: DiagnosticEmailInput = {
  ...base,
  companyName: "Evil BV\r\nBcc: someone@elsewhere.example",
};
