const path = require('path');
const fs = require('fs');

function loadEnvFromFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFromFile();

const config = {
  port: Number(process.env.API_PORT || 3000),
  jwtSecret: process.env.API_JWT_SECRET || 'techno-red-dev-secret',
  supabaseUrl: process.env.SUPABASE_URL || 'https://uzamffsbckljxoytcbtz.supabase.co',
  supabaseAnonKey:
    process.env.SUPABASE_ANON_KEY || 'sb_publishable_LI5I9H6eULDyYJ0N8PHA-Q_56oY51uC',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200'
};

module.exports = { config };
