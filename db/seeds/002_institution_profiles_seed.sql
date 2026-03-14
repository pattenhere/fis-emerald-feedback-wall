INSERT INTO INSTITUTION_PROFILES (
  id,
  institution_name,
  institution_type,
  business_lines,
  target_segments,
  geography,
  known_strengths,
  signals
) VALUES
  (
    'IP-001',
    'Crédit Agricole CIB (CA-CIB)',
    'Global Investment Bank',
    'Corporate Banking, Project Finance, Structured Finance, Capital Markets',
    'Large Corporate, Infrastructure Sponsors, Energy',
    'Global (EU, Americas, APAC)',
    'Project finance leadership, structured lending, energy transition financing',
    'participates in syndicated loans, complex cross-border deals, multi-currency facilities'
  ),
  (
    'IP-002',
    'Farmer Mac',
    'Government-Sponsored Enterprise',
    'Agricultural Finance, Secondary Loan Market, Structured Agricultural Lending',
    'Agricultural Lenders, Rural Utilities, Farm Operators',
    'United States (Rural Markets)',
    'Secondary agricultural loan market, risk transfer for farm credit institutions',
    'securitizes agricultural loans, regulatory compliance focus, portfolio-level loan monitoring'
  ),
  (
    'IP-003',
    'JPMorgan Chase',
    'Global Universal Bank',
    'Corporate Banking, Investment Banking, Treasury Services, Commercial Lending',
    'Global Corporates, Middle Market, Institutional Clients',
    'Global',
    'Syndicated lending leader, treasury services scale, complex credit structuring',
    'participates in large syndicated loans, complex facility structures, multi-jurisdiction lending'
  ),
  (
    'IP-004',
    'Capital One',
    'Large U.S. Bank',
    'Commercial Banking, Credit Cards, Consumer Lending, Digital Banking',
    'Middle Market, Commercial Real Estate, Consumers',
    'United States',
    'Data-driven credit models, digital banking capabilities',
    'strong credit risk analytics, commercial real estate lending, high-volume loan servicing'
  ),
  (
    'IP-005',
    'Citizens Bank',
    'Regional Bank',
    'Commercial Banking, Corporate Finance, Asset-Based Lending',
    'Middle Market Companies, Regional Businesses',
    'United States (Northeast, Midwest)',
    'Middle-market lending, asset-based lending expertise',
    'participates in syndicated deals, collateralized lending structures'
  ),
  (
    'IP-006',
    'First Horizon Bank',
    'Regional Bank',
    'Commercial Banking, Wealth Management, Treasury Services',
    'Small Business, Middle Market',
    'United States (Southeast)',
    'Relationship banking, regional commercial lending',
    'moderate facility complexity, secured commercial loans'
  ),
  (
    'IP-007',
    'BNP Paribas',
    'Global Universal Bank',
    'Corporate Banking, Capital Markets, Trade Finance, Structured Finance',
    'Global Corporations, Institutional Investors',
    'Global (Europe-focused)',
    'Structured finance, cross-border financing, derivatives integration',
    'multi-currency lending, syndicated credit facilities, regulatory-heavy environments'
  ),
  (
    'IP-008',
    'Third Coast Bank',
    'Community / Regional Bank',
    'Commercial Banking, CRE Lending, Treasury Management',
    'Local Businesses, Small-to-Mid Commercial Clients',
    'United States (Texas)',
    'Commercial real estate lending, relationship banking',
    'secured commercial lending, moderate loan servicing needs'
  ),
  (
    'IP-009',
    'CIT Group',
    'Commercial Bank / Specialty Finance',
    'Equipment Finance, Commercial Lending, Factoring',
    'Middle Market, Transportation, Manufacturing',
    'United States',
    'Equipment finance leadership, asset-backed lending',
    'heavy collateral management, asset-based loan monitoring'
  ),
  (
    'IP-010',
    'First Republic Bank',
    'Private / Relationship Bank',
    'Private Banking, Commercial Lending, Wealth Management',
    'High-Net-Worth Individuals, Professional Services Firms',
    'United States (Coastal markets)',
    'Relationship lending, jumbo mortgage lending',
    'relatively simple facility structures, relationship-based underwriting'
  )
ON CONFLICT(id) DO UPDATE SET
  institution_name = excluded.institution_name,
  institution_type = excluded.institution_type,
  business_lines = excluded.business_lines,
  target_segments = excluded.target_segments,
  geography = excluded.geography,
  known_strengths = excluded.known_strengths,
  signals = excluded.signals,
  updated_at = CURRENT_TIMESTAMP;
