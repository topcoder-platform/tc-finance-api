CREATE INDEX idx_winnings_type_created_at ON winnings USING btree (type, created_at DESC);
