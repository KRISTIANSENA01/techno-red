-- Garantiza que el backend solo persista los 3 roles permitidos.
-- Ajusta el nombre de tabla/campo si en tu proyecto difiere.

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('ventas', 'clientes', 'admin'));
