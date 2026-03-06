const ALLOWED_ROLES = Object.freeze(["ventas", "clientes", "admin"]);

const ROLE_ALIASES = Object.freeze({
  cliente: "clientes",
  clinetes: "clientes",
  customer: "clientes",
  sales: "ventas",
  administrador: "admin",
  administrator: "admin",
});

function normalizeRole(inputRole) {
  if (typeof inputRole !== "string") {
    throw new Error("El rol debe ser un texto válido.");
  }

  const normalized = inputRole.trim().toLowerCase();
  const resolved = ROLE_ALIASES[normalized] || normalized;

  if (!ALLOWED_ROLES.includes(resolved)) {
    throw new Error(
      `Rol no permitido: \"${inputRole}\". Roles válidos: ${ALLOWED_ROLES.join(", ")}.`
    );
  }

  return resolved;
}

module.exports = {
  ALLOWED_ROLES,
  normalizeRole,
};
