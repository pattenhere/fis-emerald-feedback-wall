ALTER TABLE PRODUCT_FEATURE_CATEGORIES ADD COLUMN id TEXT;

UPDATE PRODUCT_FEATURE_CATEGORIES
SET id = CASE feature
  WHEN 'Assignment Manager' THEN 'PFC-001'
  WHEN 'Collateral Doc Tracker' THEN 'PFC-002'
  WHEN 'Cross-Limit Controls' THEN 'PFC-003'
  WHEN 'Customer Flowdown & Pooling' THEN 'PFC-004'
  WHEN 'Customer Risk & Credit' THEN 'PFC-005'
  WHEN 'ECC Collateral Controls' THEN 'PFC-006'
  WHEN 'EIR Fees' THEN 'PFC-007'
  WHEN 'Escrow' THEN 'PFC-008'
  WHEN 'Facility History' THEN 'PFC-009'
  WHEN 'Facility Invoices' THEN 'PFC-010'
  WHEN 'Facility: Collateral' THEN 'PFC-011'
  WHEN 'FX Rate Controls' THEN 'PFC-012'
  WHEN 'Loan History Views' THEN 'PFC-013'
  WHEN 'Loan: Collateral' THEN 'PFC-014'
  WHEN 'Payoff Event' THEN 'PFC-015'
  WHEN 'Pro Rata & SNC Reporting' THEN 'PFC-016'
  WHEN 'Reference Repayment Schedules' THEN 'PFC-017'
  WHEN 'Renewal / Mod / Amendments' THEN 'PFC-018'
  WHEN 'Syndication' THEN 'PFC-019'
  WHEN 'System Admin Suite' THEN 'PFC-020'
  WHEN 'Trouble Asset Manager' THEN 'PFC-021'
  ELSE id
END
WHERE id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_feature_categories_id
  ON PRODUCT_FEATURE_CATEGORIES(id);

