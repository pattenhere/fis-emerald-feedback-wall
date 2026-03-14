INSERT INTO PRODUCT_FEATURE_CATEGORIES (id, category) VALUES
  ('PFCT-001', 'Syndication / Complex Lending'),
  ('PFCT-002', 'Monitoring & Controls'),
  ('PFCT-003', 'Credit & Risk'),
  ('PFCT-004', 'Platform Services'),
  ('PFCT-005', 'SBA & Re-Amort, Servicing'),
  ('PFCT-006', 'Analytics & Inquiry'),
  ('PFCT-007', 'Servicing'),
  ('PFCT-008', 'Origination'),
  ('PFCT-009', 'Digital Experience'),
  ('PFCT-010', 'Customer Risk & Credit')
ON CONFLICT(id) DO UPDATE SET
  category = excluded.category,
  updated_at = CURRENT_TIMESTAMP;
