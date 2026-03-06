const test = require('node:test');
const assert = require('node:assert/strict');

const { ALLOWED_ROLES, normalizeRole } = require('../src_roles');

test('mantiene solo los 3 roles definidos', () => {
  assert.deepEqual(ALLOWED_ROLES, ['ventas', 'clientes', 'admin']);
});

test('normaliza errores comunes de escritura para clientes', () => {
  assert.equal(normalizeRole('clinetes'), 'clientes');
  assert.equal(normalizeRole('cliente'), 'clientes');
});

test('acepta roles válidos con variaciones de formato', () => {
  assert.equal(normalizeRole('  VENTAS '), 'ventas');
  assert.equal(normalizeRole('Administrador'), 'admin');
});

test('rechaza roles fuera del catálogo permitido', () => {
  assert.throws(() => normalizeRole('superadmin'), /Rol no permitido/);
});
