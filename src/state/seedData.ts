import type { AppArea, AppScreen, CardSortConcept, FeatureRequest, KudosQuote } from "../types/domain";

export const APP_AREAS: Array<{ id: AppArea; label: string; dark?: boolean }> = [
  { id: "digital-experience", label: "Digital Experience" },
  { id: "origination", label: "Origination" },
  { id: "credit-risk", label: "Credit & Risk" },
  { id: "servicing", label: "Servicing" },
  { id: "monitoring-controls", label: "Monitoring & Controls" },
  { id: "syndication-complex-lending", label: "Syndication / Complex Lending" },
  { id: "analytics-inquiry", label: "Analytics & Inquiry" },
  { id: "platform-services", label: "Platform Services" },
];

export const INITIAL_FEATURE_REQUESTS: FeatureRequest[] = [
  {
    id: "fr-1",
    app: "digital-experience",
    screenId: "de-borrower-intake",
    screenName: "Borrower Intake",
    title: "Pre-fill borrower profile with prior application and KYC data",
    workflowContext: "Reduce intake completion time and drop-off for repeat applicants.",
    votes: 12,
    createdAt: "2026-03-12T08:00:00Z",
    origin: "kiosk",
  },
  {
    id: "fr-2",
    app: "origination",
    screenId: "or-underwriting",
    screenName: "Underwriting",
    title: "Expose explainable decision factors directly in underwriting workspace",
    workflowContext: "Speed reviewer confidence and improve transparent approvals.",
    votes: 8,
    createdAt: "2026-03-12T08:05:00Z",
    origin: "kiosk",
  },
];

export const INITIAL_KUDOS: KudosQuote[] = [
  {
    id: "kd-1",
    text: "The anomaly drill-down view cut our triage time in half.",
    role: "ops",
    consentPublic: true,
    createdAt: "2026-03-12T08:10:00Z",
  },
  {
    id: "kd-2",
    text: "The workflow naming still confuses new team members.",
    role: "product",
    consentPublic: false,
    createdAt: "2026-03-12T08:11:00Z",
  },
];

export const SCREEN_LIBRARY: AppScreen[] = [
  {
    id: "de-borrower-intake",
    app: "digital-experience",
    name: "Borrower Intake",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Capture borrower information with guided intake and data quality checks.",
  },
  {
    id: "de-self-service",
    app: "digital-experience",
    name: "Self-Service",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Give borrowers visibility and control through a secure self-service portal.",
  },
  {
    id: "de-document-funding-transition",
    app: "digital-experience",
    name: "Document/Funding Transition",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Move from document completion to funding readiness with fewer handoffs.",
  },
  {
    id: "or-application-workflow",
    app: "origination",
    name: "Application Workflow",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Coordinate intake steps, routing, and queue ownership across originations.",
  },
  {
    id: "or-underwriting",
    app: "origination",
    name: "Underwriting",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Assess eligibility and risk with transparent decision support in context.",
  },
  {
    id: "or-pricing-approval",
    app: "origination",
    name: "Pricing / Approval",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Price deals and approve terms with policy-aware approval controls.",
  },
  {
    id: "or-onboarding-servicing",
    app: "origination",
    name: "Onboarding to Servicing",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Transition closed deals into servicing with complete and validated records.",
  },
  {
    id: "cr-credit-assessment",
    app: "credit-risk",
    name: "Credit Assessment",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Evaluate applicant creditworthiness using internal and external credit inputs.",
  },
  {
    id: "cr-risk-rating",
    app: "credit-risk",
    name: "Risk Rating",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Apply consistent risk scores and rationale to each facility and borrower.",
  },
  {
    id: "cr-exposure-visibility",
    app: "credit-risk",
    name: "Exposure Visibility",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Track portfolio, borrower, and segment exposure concentration in real time.",
  },
  {
    id: "cr-compliance-monitoring",
    app: "credit-risk",
    name: "Compliance Monitoring",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Flag and monitor policy and regulatory compliance drift across loans.",
  },
  {
    id: "sv-booking-maintenance",
    app: "servicing",
    name: "Booking / Maintenance",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Book facilities and maintain account-level changes with full audit trails.",
  },
  {
    id: "sv-payments-billing-payoff",
    app: "servicing",
    name: "Payments / Billing / Payoff",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Handle invoicing, payment processing, and payoff execution end to end.",
  },
  {
    id: "sv-amortization-accruals",
    app: "servicing",
    name: "Amortization / Accruals",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Calculate accrual schedules and amortization values with transparent logic.",
  },
  {
    id: "sv-transaction-processing",
    app: "servicing",
    name: "Transaction Processing",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Process operational loan transactions at scale with exception handling.",
  },
  {
    id: "mc-covenants-compliance",
    app: "monitoring-controls",
    name: "Covenants / Compliance",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Track covenant tests and compliance obligations with proactive alerts.",
  },
  {
    id: "mc-exceptions-amendments",
    app: "monitoring-controls",
    name: "Exceptions / Amendments",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Capture waiver and amendment workflows with governed approval trails.",
  },
  {
    id: "mc-policy-controls",
    app: "monitoring-controls",
    name: "Policy Controls",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Enforce configurable policy constraints for key lending lifecycle actions.",
  },
  {
    id: "mc-operational-workflow",
    app: "monitoring-controls",
    name: "Operational Workflow",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Standardize controls-oriented operational work across teams and regions.",
  },
  {
    id: "sy-syndicated-servicing",
    app: "syndication-complex-lending",
    name: "Syndicated Servicing",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Support multi-lender servicing events with participant-level transparency.",
  },
  {
    id: "sy-agented-loan-support",
    app: "syndication-complex-lending",
    name: "Agented Loan Support",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Enable agent bank operations and communications for complex facilities.",
  },
  {
    id: "sy-multi-party-administration",
    app: "syndication-complex-lending",
    name: "Multi-Party Administration",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Manage lender, borrower, and agent interactions with clear role controls.",
  },
  {
    id: "ai-inquiry-transaction-history",
    app: "analytics-inquiry",
    name: "Inquiry / Transaction History",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Search historical activity and inquiry data across accounts and facilities.",
  },
  {
    id: "ai-reporting",
    app: "analytics-inquiry",
    name: "Reporting",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Generate operational and portfolio reports with reusable output templates.",
  },
  {
    id: "ai-bi-dashboards",
    app: "analytics-inquiry",
    name: "BI / Dashboards",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Deliver interactive dashboards for trend, variance, and performance analysis.",
  },
  {
    id: "ai-portfolio-visibility",
    app: "analytics-inquiry",
    name: "Portfolio Visibility",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Expose cross-portfolio risk and servicing visibility for strategic decisions.",
  },
  {
    id: "ps-workflow-engine",
    app: "platform-services",
    name: "Workflow Engine",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Power configurable process orchestration and event-driven task management.",
  },
  {
    id: "ps-apis-integrations",
    app: "platform-services",
    name: "APIs / Integrations",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Connect to internal and partner systems with stable integration contracts.",
  },
  {
    id: "ps-security-permissions",
    app: "platform-services",
    name: "Security / Permissions",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Control access with role-aware permissions and stronger security boundaries.",
  },
  {
    id: "ps-configuration",
    app: "platform-services",
    name: "Configuration",
    wireframeLabel: "Feature detail · working prototype taxonomy",
    description: "Enable admin configuration of rules, workflows, and platform behaviors.",
  },
];

export const CARD_SORT_CONCEPTS: CardSortConcept[] = [
  {
    id: "concept-agent-covenant-monitor",
    title: "Agentic Covenant Monitor",
    description: "Continuously monitors covenant drift and proposes next-best remediation actions.",
  },
  {
    id: "concept-origination-copilot",
    title: "Origination Copilot",
    description: "Suggests underwriting data checks and approval pathways from prior outcomes.",
  },
  {
    id: "concept-servicing-predictive",
    title: "Predictive Servicing Alerts",
    description: "Flags likely payment exceptions before billing cycles complete.",
  },
  {
    id: "concept-portfolio-narrative",
    title: "Portfolio Narrative Brief",
    description: "Generates executive-ready summaries from portfolio and transaction trends.",
  },
  {
    id: "concept-participant-insight",
    title: "Syndication Participant Insight Hub",
    description: "Surfaces cross-party obligations, delays, and communication bottlenecks in one view.",
  },
];

export const SCREENS_BY_APP: Record<AppArea, AppScreen[]> = APP_AREAS.reduce(
  (acc, area) => {
    acc[area.id] = SCREEN_LIBRARY.filter((screen) => screen.app === area.id);
    return acc;
  },
  {} as Record<AppArea, AppScreen[]>,
);

export const FIRST_SCREEN_ID_BY_APP: Record<AppArea, string | null> = APP_AREAS.reduce(
  (acc, area) => {
    acc[area.id] = SCREENS_BY_APP[area.id][0]?.id ?? null;
    return acc;
  },
  {} as Record<AppArea, string | null>,
);

export const SCREEN_COUNT_BY_APP: Record<AppArea, number> = APP_AREAS.reduce(
  (acc, area) => {
    acc[area.id] = SCREENS_BY_APP[area.id].length;
    return acc;
  },
  {} as Record<AppArea, number>,
);
