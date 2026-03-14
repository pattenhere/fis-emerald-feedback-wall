INSERT INTO PRODUCTS (id, category, subcategory, name) VALUES
  ('PRD-001', 'Lending', 'Origination Solutions', 'Credit Assessment'),
  ('PRD-002', 'Lending', 'Origination Solutions', 'Consumer & SMB Loan Origination'),
  ('PRD-003', 'Lending', 'Origination Solutions', 'Commercial Loan Origination'),
  ('PRD-004', 'Lending', 'Servicing Solutions', 'Consumer & SMB Loan Servicing'),
  ('PRD-005', 'Lending', 'Servicing Solutions', 'Commercial Loan Servicing'),
  ('PRD-006', 'Lending', 'Specialty Lending Solutions', 'Asset & Auto Finance'),
  ('PRD-007', 'Lending', 'Specialty Lending Solutions', 'Supply Chain Finance'),
  ('PRD-008', 'Lending', 'Specialty Lending Solutions', 'Syndication and Distribution')
ON CONFLICT(id) DO UPDATE SET
  category = excluded.category,
  subcategory = excluded.subcategory,
  name = excluded.name,
  updated_at = CURRENT_TIMESTAMP;
