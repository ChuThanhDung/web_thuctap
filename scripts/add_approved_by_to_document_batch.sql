-- Migration: Add approved_by_id to document_batches table
-- Date: 2026-08-16
-- Description: Add foreign key column to track who approved each batch

-- Add approved_by_id column
ALTER TABLE document_batches
ADD COLUMN IF NOT EXISTS approved_by_id INTEGER;

-- Add foreign key constraint
ALTER TABLE document_batches
ADD CONSTRAINT fk_document_batches_approved_by
FOREIGN KEY (approved_by_id)
REFERENCES users(public_id)
ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_document_batches_approved_by_id
ON document_batches(approved_by_id);

-- Comment for documentation
COMMENT ON COLUMN document_batches.approved_by_id IS 'User ID of the accountant who approved this batch';
