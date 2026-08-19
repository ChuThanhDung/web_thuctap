#!/usr/bin/env python3
"""
Migration script to add approved_by_id column to document_batches table
Run this script to apply the database migration
"""
import os
import sys
from pathlib import Path

# Add parent directory to path to import project modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from src.database import get_db_session


def run_migration():
    """Execute the migration SQL file"""
    # Read the SQL migration file
    migration_file = Path(__file__).parent / "add_approved_by_to_document_batch.sql"
    
    if not migration_file.exists():
        print(f"❌ Migration file not found: {migration_file}")
        return False
    
    with open(migration_file, 'r', encoding='utf-8') as f:
        sql_content = f.read()
    
    print("🔄 Running migration: Add approved_by_id to document_batches")
    print("-" * 60)
    
    try:
        # Get database session
        with get_db_session() as db:
            # Execute migration
            db.execute(text(sql_content))
            db.commit()
            print("✅ Migration completed successfully!")
            print("-" * 60)
            print("Changes applied:")
            print("  - Added column: approved_by_id (INTEGER, nullable)")
            print("  - Added foreign key: fk_document_batches_approved_by")
            print("  - Added index: idx_document_batches_approved_by_id")
            return True
            
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        return False


if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
