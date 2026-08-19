-- Migration: Add chief_approved_by_id to document_batches table
-- Date: 2026-08-16
-- Description: Add foreign key column to track who (chief accountant) final approved each batch

-- Add chief_approved_by_id column
ALTER TABLE document_batches
ADD COLUMN IF NOT EXISTS chief_approved_by_id INTEGER;

-- Add foreign key constraint
ALTER TABLE document_batches
ADD CONSTRAINT fk_document_batches_chief_approved_by
FOREIGN KEY (chief_approved_by_id)
REFERENCES users(public_id)
ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_document_batches_chief_approved_by_id
ON document_batches(chief_approved_by_id);

-- Comment for documentation
COMMENT ON COLUMN document_batches.chief_approved_by_id IS 'User ID of the chief accountant who final approved this batch';
