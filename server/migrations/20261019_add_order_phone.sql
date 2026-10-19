-- Add this column to an existing database before deploying the updated checkout API.
ALTER TABLE checkout_orders
  ADD COLUMN phone VARCHAR(30) NULL AFTER address;
