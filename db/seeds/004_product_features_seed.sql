INSERT INTO PRODUCT_FEATURES (
  id, product_id, feature_category_id, name, clsv, journey, status, progress, orbit, angle, size, effort, rank, impact, eta, outcomes, votes, description,
  applicable_segments, applicable_institution_types, loan_types, triggers, maturity_level, keywords, exclusion_signals
) VALUES
  (
    'PF-001', 'PRD-005', 'PFCT-006', 'Facility History', 'CLSV-706', 'inquiry', 'design-complete', 90, 1, 0, 18, 'M', '1.5', 'high', 'Q2 2026',
    'farmerMac,efficiency,compliance', 112,
    'Deep-nav facility history ecosystem. Drill through Limit, Fee, Transaction, and Fee Accruals layers from a single view. Transforms static audit log into verifiable evidence for audits and client inquiries.',
    'Corporate banking, Middle market servicing, Syndicated lending', 'Global universal bank; regional bank; specialty lender', 'Participation loans; term loans; revolving lines',
    'Audit exceptions, borrower inquiries, compliance reviews', 'Advanced', 'facility history; transaction trail; audit readiness', 'Consumer-only retail workflows'
  ),
  (
    'PF-002', 'PRD-005', 'PFCT-007', 'Payoff Event', 'CLSV-751+714', 'payoff', 'design-complete', 88, 1, 60, 19, 'L', '1.5', 'high', 'Q2 2026',
    'farmerMac,migration,efficiency', 98,
    'Unified Payoff Quote + Process in a single screen. Tree-view record selection at sub-record granularity — select individual fees, sections, sublimits. Multi-currency totaling and manager submit.',
    'Commercial lenders, syndicated operations, servicing teams', 'Global bank; regional bank; specialty finance', 'Commercial loans; syndicated facilities',
    'Payoff request, billing closeout, fee settlements', 'Advanced', 'payoff workflow; billing automation; multi-currency', 'Simple consumer installment lending'
  ),
  (
    'PF-003', 'PRD-005', 'PFCT-002', 'Loan: Collateral', 'CLSV-724', 'collateral', 'design-complete', 95, 1, 120, 16, 'L', '1', 'high', 'Q1 2026',
    'migration,compliance', 76,
    'Loan-level collateral management. Design complete — ready for engineering handoff. Covers full lifecycle of collateral records linked to loans, document attachments, and status tracking.',
    'Asset-based lending, collateralized portfolios', 'Regional bank; commercial bank; specialty lender', 'Asset-backed commercial loans',
    'Collateral updates, covenant events, document refresh', 'Advanced', 'loan collateral; document tracking; covenant support', 'Unsecured consumer credit cards'
  ),
  (
    'PF-004', 'PRD-005', 'PFCT-002', 'Facility: Collateral', 'CLSV-693', 'collateral', 'design-complete', 85, 1, 180, 16, 'L', '1.5', 'high', 'Q2 2026',
    'migration,compliance', 61,
    'Facility-level collateral management. Covers ECC collateral records, cross-facility tracking, document attachment workflows at the facility tier.',
    'Syndicated and agent-bank servicing', 'Global universal bank; agent bank', 'Syndicated facilities; commercial lines',
    'Facility amendment, collateral valuation change', 'Advanced', 'facility collateral; cross-facility controls', 'Single-loan consumer servicing'
  ),
  (
    'PF-005', 'PRD-005', 'PFCT-007', 'Facility Invoices', 'CLSV-707', 'booking', 'design-complete', 80, 1, 240, 15, 'M', '1', 'high', 'Q2 2026',
    'farmerMac,migration', 54,
    'Facility-level invoice view and management. Includes accruing fee invoices, billing schedules, and re-bill/reverse capabilities.',
    'Loan operations, billing teams', 'Regional bank; specialty lender', 'Commercial facilities',
    'Invoice run, rebill/reverse, fee accrual posting', 'Advanced', 'facility invoices; fee billing; rebill', 'Simple retail installment billing'
  ),
  (
    'PF-006', 'PRD-005', 'PFCT-008', 'Reference Repayment Schedules', 'CLSV-673', 'booking', 'design-complete', 78, 1, 300, 17, 'XL', '2', 'high', 'Q2 2026',
    'farmerMac,migration,efficiency', 91,
    'Customer-level repayment schedule templates. CSV import, amortization calculator, manual grid entry. Templates reusable across loans.',
    'Origination and servicing handoff teams', 'Regional bank; global bank', 'Term loans; amortizing facilities',
    'New deal onboarding, repayment recast', 'Advanced', 'repayment schedule; amortization; template', 'Credit-card style revolving minimum payments'
  ),
  (
    'PF-007', 'PRD-005', 'PFCT-004', 'EIR Fees', 'CLSV-876', 'booking', 'planned', 0, 2, 20, 16, 'L', '1', 'high', 'Q3 2026',
    'farmerMac,migration', 74,
    'Configure EIR recalculation triggers. Fixed fees, income class mapping, GL daily amortization. Supports IFRS and US GAAP.',
    'Finance controllers, accounting operations', 'Global bank; specialty finance', 'Commercial facilities',
    'Backdated posting, quarter close, year-end close', 'Intermediate', 'eir fees; gaap; ifrs; amortization', 'Institutions without accrual accounting needs'
  ),
  (
    'PF-008', 'PRD-005', 'PFCT-002', 'ECC Collateral Controls', 'CLSV-698', 'collateral', 'planned', 0, 2, 80, 18, 'XL', '1', 'high', 'Q3 2026',
    'migration,compliance', 88,
    'Three XL epics: ECC integration, collateral valuation controls, margin call workflows. Central control point for all external collateral system interactions.',
    'Collateral-heavy commercial portfolios', 'Global universal bank; capital markets lender', 'Collateralized facilities',
    'Margin call, valuation breach, external collateral sync', 'Advanced', 'ecc integration; margin call; collateral valuation', 'Unsecured lending-only institutions'
  ),
  (
    'PF-009', 'PRD-005', 'PFCT-006', 'Loan History Views', 'CLSV-863', 'inquiry', 'planned', 0, 2, 140, 14, 'M', '1', 'high', 'Q3 2026',
    'efficiency,compliance', 53,
    'Deep loan-level history matching Facility History depth. Loan-specific Transaction and Accrual tabs with date-range filtering and export.',
    'Servicing operations and support desks', 'Regional bank; global bank', 'Commercial loans',
    'Client servicing inquiries, operations QA', 'Intermediate', 'loan history; inquiry; transaction export', 'Institutions with real-time-only systems'
  ),
  (
    'PF-010', 'PRD-005', 'PFCT-003', 'Trouble Asset Manager', 'CLSV-738', 'maintenance', 'planned', 0, 2, 200, 17, 'XL', '1', 'high', 'Q3 2026',
    'migration,efficiency', 67,
    'Manage non-performing and watch-list loans. Workflow routing and status tracking for troubled assets. Configurable escalation paths and override controls.',
    'Workout teams, special assets groups', 'Regional bank; commercial bank', 'Commercial and criticized loans',
    'Delinquency threshold, watch-list promotion', 'Advanced', 'trouble assets; watchlist; escalation', 'Prime retail installment-only portfolios'
  ),
  (
    'PF-011', 'PRD-005', 'PFCT-001', 'Assignment Manager', 'CLSV-754', 'booking', 'planned', 0, 2, 250, 15, 'XL', '1.5', 'high', 'Q4 2026',
    'migration', 59,
    'Full loan assignment workflow. Supports partial assignments, syndication links, audit trail, and agent bank management.',
    'Syndication desks, secondary trading support', 'Global bank; agent bank', 'Syndicated and participated loans',
    'Assignment request, participant transfer', 'Advanced', 'assignment; syndication; participation', 'Single-lender-only portfolios'
  ),
  (
    'PF-012', 'PRD-005', 'PFCT-004', 'FX Rate Controls', 'CLSV-752', 'booking', 'planned', 0, 2, 320, 13, 'M', '1', 'med', 'Q4 2026',
    'migration,efficiency', 41,
    'Three-epic FX control suite: rate group management, multi-currency conversion, rate override workflow with effective date handling.',
    'Cross-border lending operations', 'Global universal bank; international lender', 'Multi-currency facilities',
    'Rate reset cycle, conversion posting', 'Advanced', 'fx rates; multi-currency; override', 'Single-currency-only institutions'
  ),
  (
    'PF-013', 'PRD-005', 'PFCT-003', 'Cross-Limit Controls', 'CLSV-689', 'booking', 'future', 0, 3, 15, 15, 'XL', '2', 'high', 'Q1 2027',
    'migration,compliance', 45,
    'Aggregated limit management across facilities. Shared limit pools with real-time utilization reporting and breach alerts.',
    'Corporate banking and portfolio risk teams', 'Global bank; regional bank', 'Commercial revolving and term facilities',
    'Limit breach, utilization threshold', 'Advanced', 'cross-limit; utilization; breach alerts', 'Standalone non-pooled facilities only'
  ),
  (
    'PF-014', 'PRD-005', 'PFCT-002', 'Collateral Doc Tracker', 'CLSV-732', 'collateral', 'future', 0, 3, 55, 13, 'L', '1', 'med', 'Q1 2027',
    'compliance', 38,
    'Document intake and tracking for collateral records. Expiry alerts, renewal workflows, and audit-ready document chains.',
    'Compliance operations and collateral teams', 'Regional bank; specialty lender', 'Collateralized commercial loans',
    'Document expiry, collateral renewal', 'Intermediate', 'collateral docs; expiry alerts; audit chain', 'No-document small-ticket loans'
  ),
  (
    'PF-015', 'PRD-005', 'PFCT-003', 'Customer Flowdown & Pooling', 'CLSV-680', 'booking', 'future', 0, 3, 95, 13, 'L', '1', 'med', 'Q2 2027',
    'migration,efficiency', 31,
    'Propagate customer-level changes across linked deals and facilities. Customer-level limit pooling with inheritance rules.',
    'Enterprise account-servicing teams', 'Global bank; regional bank', 'Commercial lines and facilities',
    'Customer hierarchy update, shared limit change', 'Intermediate', 'flowdown; pooling; hierarchy', 'Single-facility standalone records'
  ),
  (
    'PF-016', 'PRD-005', 'PFCT-006', 'Pro Rata & SNC Reporting', 'CLSV-712', 'inquiry', 'future', 0, 3, 135, 12, 'M', '2', 'med', 'Q2 2027',
    'compliance', 28,
    'Shared national credit reporting suite. Pro rata calculations and SNC exam export format.',
    'Regulatory reporting and credit risk', 'Commercial bank; global bank', 'Syndicated and shared national credits',
    'Regulatory filing cycle, SNC exam request', 'Intermediate', 'pro rata; snc; regulatory export', 'Institutions outside SNC scope'
  ),
  (
    'PF-017', 'PRD-005', 'PFCT-005', 'Escrow, SBA & Re-Amort', 'CLSV-726', 'scheduled', 'future', 0, 3, 175, 13, 'M', '1', 'med', 'Q2 2027',
    'migration,efficiency', 36,
    'Three servicing workflows unified: escrow account management, SBA loan handling, and re-amortization event processing.',
    'Commercial servicing and SBA operations', 'Regional bank; commercial bank', 'SBA and commercial term loans',
    'Escrow analysis cycle, SBA event, rate/amortization reset', 'Intermediate', 'escrow; sba; re-amortization', 'Non-servicing origination-only teams'
  ),
  (
    'PF-018', 'PRD-005', 'PFCT-004', 'System Admin Suite', 'CLSV-E-116', 'sysadmin', 'future', 0, 3, 215, 18, 'XL', NULL, 'high', 'TBD',
    'migration', 55,
    '35 epics. Full admin configuration surface: user management, table maintenance, system parameters, permission matrices, and integration configuration.',
    'Platform administrators and implementation teams', 'All institution types', 'All loan types',
    'Tenant setup, control governance, access reviews', 'Core Infrastructure', 'system admin; permissions; configuration', 'N/A'
  ),
  (
    'PF-019', 'PRD-005', 'PFCT-003', 'Customer Risk & Credit', 'CLSV-676', 'booking', 'future', 0, 3, 255, 14, 'L', '3', 'med', 'Q3 2027',
    'migration,compliance', 33,
    'Customer-level risk ratings, credit limit management, covenant tracking, and risk-grade change workflows.',
    'Credit administration and risk teams', 'Regional bank; global bank', 'Commercial and corporate loans',
    'Risk rating review, covenant breach, exposure update', 'Advanced', 'risk ratings; credit limits; covenants', 'Pure retail unsecured books'
  ),
  (
    'PF-020', 'PRD-005', 'PFCT-008', 'Renewal / Mod / Amendments', 'CLSV-E-114', 'renewal', 'future', 0, 3, 295, 17, 'XL', '2', 'high', 'Q3 2027',
    'migration,efficiency', 62,
    'Full hero journey: loan renewals, modifications, and amendment workflows end-to-end. Largest unscoped journey after Syndication.',
    'Commercial loan ops and relationship teams', 'Commercial bank; global bank', 'Commercial loans; credit lines',
    'Renewal date, amendment request, repricing event', 'Advanced', 'renewal; modification; amendment workflow', 'Short-duration transactional credit only'
  ),
  (
    'PF-021', 'PRD-005', 'PFCT-001', 'Syndication', 'CLSV-E-119', 'syndication', 'future', 0, 3, 335, 14, 'XL', NULL, 'high', 'TBD',
    'migration', 48,
    'Full syndication hero journey. Scope TBD — 0 epics currently defined. Placeholder for strategic roadmap alignment.',
    'Syndication and agency desks', 'Global bank; regional agent bank', 'Syndicated loans; participations',
    'Participant onboarding, facility servicing events', 'Advanced', 'syndication; agency; participant servicing', 'Non-syndicated single-lender books'
  ),
  (
    'PF-022', 'PRD-005', 'PFCT-009', 'Borrower Intake', NULL, 'digital-experience', 'planned', 0, 1, 20, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Digital Experience: Borrower Intake.',
    NULL, NULL, NULL, NULL, 'Seed', 'borrower intake; digital experience', 'N/A'
  ),
  (
    'PF-023', 'PRD-005', 'PFCT-009', 'Self-Service', NULL, 'digital-experience', 'planned', 0, 1, 40, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Digital Experience: Self-Service.',
    NULL, NULL, NULL, NULL, 'Seed', 'self-service; digital experience', 'N/A'
  ),
  (
    'PF-024', 'PRD-005', 'PFCT-009', 'Document/Funding Transition', NULL, 'digital-experience', 'planned', 0, 1, 60, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Digital Experience: Document/Funding Transition.',
    NULL, NULL, NULL, NULL, 'Seed', 'document funding transition; digital experience', 'N/A'
  ),
  (
    'PF-025', 'PRD-005', 'PFCT-008', 'Application Workflow', NULL, 'origination', 'planned', 0, 1, 80, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Origination: Application Workflow.',
    NULL, NULL, NULL, NULL, 'Seed', 'application workflow; origination', 'N/A'
  ),
  (
    'PF-026', 'PRD-005', 'PFCT-008', 'Underwriting', NULL, 'origination', 'planned', 0, 1, 100, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Origination: Underwriting.',
    NULL, NULL, NULL, NULL, 'Seed', 'underwriting; origination', 'N/A'
  ),
  (
    'PF-027', 'PRD-005', 'PFCT-008', 'Pricing / Approval', NULL, 'origination', 'planned', 0, 1, 120, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Origination: Pricing / Approval.',
    NULL, NULL, NULL, NULL, 'Seed', 'pricing approval; origination', 'N/A'
  ),
  (
    'PF-028', 'PRD-005', 'PFCT-008', 'Onboarding to Servicing', NULL, 'origination', 'planned', 0, 1, 140, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Origination: Onboarding to Servicing.',
    NULL, NULL, NULL, NULL, 'Seed', 'onboarding to servicing; origination', 'N/A'
  ),
  (
    'PF-029', 'PRD-005', 'PFCT-003', 'Credit Assessment', NULL, 'customer-risk-credit', 'planned', 0, 1, 160, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Customer Risk & Credit: Credit Assessment.',
    NULL, NULL, NULL, NULL, 'Seed', 'credit assessment; customer risk credit', 'N/A'
  ),
  (
    'PF-030', 'PRD-005', 'PFCT-003', 'Risk Rating', NULL, 'customer-risk-credit', 'planned', 0, 1, 180, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Customer Risk & Credit: Risk Rating.',
    NULL, NULL, NULL, NULL, 'Seed', 'risk rating; customer risk credit', 'N/A'
  ),
  (
    'PF-031', 'PRD-005', 'PFCT-003', 'Exposure Visibility', NULL, 'customer-risk-credit', 'planned', 0, 1, 200, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Customer Risk & Credit: Exposure Visibility.',
    NULL, NULL, NULL, NULL, 'Seed', 'exposure visibility; customer risk credit', 'N/A'
  ),
  (
    'PF-032', 'PRD-005', 'PFCT-003', 'Compliance Monitoring', NULL, 'customer-risk-credit', 'planned', 0, 1, 220, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Customer Risk & Credit: Compliance Monitoring.',
    NULL, NULL, NULL, NULL, 'Seed', 'compliance monitoring; customer risk credit', 'N/A'
  ),
  (
    'PF-033', 'PRD-005', 'PFCT-007', 'Booking / Maintenance', NULL, 'servicing', 'planned', 0, 2, 20, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Servicing: Booking / Maintenance.',
    NULL, NULL, NULL, NULL, 'Seed', 'booking maintenance; servicing', 'N/A'
  ),
  (
    'PF-034', 'PRD-005', 'PFCT-007', 'Payments / Billing / Payoff', NULL, 'servicing', 'planned', 0, 2, 40, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Servicing: Payments / Billing / Payoff.',
    NULL, NULL, NULL, NULL, 'Seed', 'payments billing payoff; servicing', 'N/A'
  ),
  (
    'PF-035', 'PRD-005', 'PFCT-007', 'Amortization / Accruals', NULL, 'servicing', 'planned', 0, 2, 60, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Servicing: Amortization / Accruals.',
    NULL, NULL, NULL, NULL, 'Seed', 'amortization accruals; servicing', 'N/A'
  ),
  (
    'PF-036', 'PRD-005', 'PFCT-007', 'Transaction Processing', NULL, 'servicing', 'planned', 0, 2, 80, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Servicing: Transaction Processing.',
    NULL, NULL, NULL, NULL, 'Seed', 'transaction processing; servicing', 'N/A'
  ),
  (
    'PF-037', 'PRD-005', 'PFCT-002', 'Covenants / Compliance', NULL, 'monitoring-controls', 'planned', 0, 2, 100, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Monitoring & Controls: Covenants / Compliance.',
    NULL, NULL, NULL, NULL, 'Seed', 'covenants compliance; monitoring controls', 'N/A'
  ),
  (
    'PF-038', 'PRD-005', 'PFCT-002', 'Exceptions / Amendments', NULL, 'monitoring-controls', 'planned', 0, 2, 120, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Monitoring & Controls: Exceptions / Amendments.',
    NULL, NULL, NULL, NULL, 'Seed', 'exceptions amendments; monitoring controls', 'N/A'
  ),
  (
    'PF-039', 'PRD-005', 'PFCT-002', 'Policy Controls', NULL, 'monitoring-controls', 'planned', 0, 2, 140, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Monitoring & Controls: Policy Controls.',
    NULL, NULL, NULL, NULL, 'Seed', 'policy controls; monitoring controls', 'N/A'
  ),
  (
    'PF-040', 'PRD-005', 'PFCT-002', 'Operational Workflow', NULL, 'monitoring-controls', 'planned', 0, 2, 160, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Monitoring & Controls: Operational Workflow.',
    NULL, NULL, NULL, NULL, 'Seed', 'operational workflow; monitoring controls', 'N/A'
  ),
  (
    'PF-041', 'PRD-005', 'PFCT-001', 'Syndicated Services', NULL, 'syndication', 'planned', 0, 3, 20, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Syndication: Syndicated Services.',
    NULL, NULL, NULL, NULL, 'Seed', 'syndicated services; syndication', 'N/A'
  ),
  (
    'PF-042', 'PRD-005', 'PFCT-001', 'Agented Loan Support', NULL, 'syndication', 'planned', 0, 3, 40, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Syndication: Agented Loan Support.',
    NULL, NULL, NULL, NULL, 'Seed', 'agented loan support; syndication', 'N/A'
  ),
  (
    'PF-043', 'PRD-005', 'PFCT-001', 'Multi-Party Administration', NULL, 'syndication', 'planned', 0, 3, 60, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Syndication: Multi-Party Administration.',
    NULL, NULL, NULL, NULL, 'Seed', 'multi-party administration; syndication', 'N/A'
  ),
  (
    'PF-044', 'PRD-005', 'PFCT-006', 'Inquiry / Transaction History', NULL, 'analytics-inquiry', 'planned', 0, 3, 80, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Analytics & Inquiry: Inquiry / Transaction History.',
    NULL, NULL, NULL, NULL, 'Seed', 'inquiry transaction history; analytics inquiry', 'N/A'
  ),
  (
    'PF-045', 'PRD-005', 'PFCT-006', 'Reporting', NULL, 'analytics-inquiry', 'planned', 0, 3, 100, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Analytics & Inquiry: Reporting.',
    NULL, NULL, NULL, NULL, 'Seed', 'reporting; analytics inquiry', 'N/A'
  ),
  (
    'PF-046', 'PRD-005', 'PFCT-006', 'BI / Dashboards', NULL, 'analytics-inquiry', 'planned', 0, 3, 120, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Analytics & Inquiry: BI / Dashboards.',
    NULL, NULL, NULL, NULL, 'Seed', 'bi dashboards; analytics inquiry', 'N/A'
  ),
  (
    'PF-047', 'PRD-005', 'PFCT-006', 'Portfolio Visibility', NULL, 'analytics-inquiry', 'planned', 0, 3, 140, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Analytics & Inquiry: Portfolio Visibility.',
    NULL, NULL, NULL, NULL, 'Seed', 'portfolio visibility; analytics inquiry', 'N/A'
  ),
  (
    'PF-048', 'PRD-005', 'PFCT-004', 'Workflow Engine', NULL, 'platform-services', 'planned', 0, 3, 160, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Platform Services: Workflow Engine.',
    NULL, NULL, NULL, NULL, 'Seed', 'workflow engine; platform services', 'N/A'
  ),
  (
    'PF-049', 'PRD-005', 'PFCT-004', 'APIs / Integrations', NULL, 'platform-services', 'planned', 0, 3, 180, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Platform Services: APIs / Integrations.',
    NULL, NULL, NULL, NULL, 'Seed', 'apis integrations; platform services', 'N/A'
  ),
  (
    'PF-050', 'PRD-005', 'PFCT-004', 'Security / Permissions', NULL, 'platform-services', 'planned', 0, 3, 200, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Platform Services: Security / Permissions.',
    NULL, NULL, NULL, NULL, 'Seed', 'security permissions; platform services', 'N/A'
  ),
  (
    'PF-051', 'PRD-005', 'PFCT-004', 'Configuration', NULL, 'platform-services', 'planned', 0, 3, 220, 14, 'M', '2', 'med', 'TBD',
    'seed', 0,
    'Seed feature for Platform Services: Configuration.',
    NULL, NULL, NULL, NULL, 'Seed', 'configuration; platform services', 'N/A'
  )
ON CONFLICT(id) DO UPDATE SET
  product_id = excluded.product_id,
  feature_category_id = excluded.feature_category_id,
  name = excluded.name,
  clsv = excluded.clsv,
  journey = excluded.journey,
  status = excluded.status,
  progress = excluded.progress,
  orbit = excluded.orbit,
  angle = excluded.angle,
  size = excluded.size,
  effort = excluded.effort,
  rank = excluded.rank,
  impact = excluded.impact,
  eta = excluded.eta,
  outcomes = excluded.outcomes,
  votes = excluded.votes,
  description = excluded.description,
  applicable_segments = excluded.applicable_segments,
  applicable_institution_types = excluded.applicable_institution_types,
  loan_types = excluded.loan_types,
  triggers = excluded.triggers,
  maturity_level = excluded.maturity_level,
  keywords = excluded.keywords,
  exclusion_signals = excluded.exclusion_signals,
  updated_at = CURRENT_TIMESTAMP;
