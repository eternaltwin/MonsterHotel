ALTER TABLE hotels ADD COLUMN data_version INTEGER NOT NULL DEFAULT 43;
-- Versions 43 and 44 have the same stored fields; 44 adds client enum values.
UPDATE hotels SET data_version = 44 WHERE data_version = 43;
ALTER TABLE hotels ALTER COLUMN data_version SET DEFAULT 44;
