const http = require('http');
const { createClient } = require('@supabase/supabase-js');
const { config } = require('./config');
const { sign, verify } = require('./lib/token');

const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

function sendJson(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload)
  });
  res.end(payload);
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('JSON invalido');
  }
}

function splitName(fullName) {
  const raw = String(fullName || '').trim();
  if (!raw) {
    return { first_name: '', last_name: '' };
  }

  const parts = raw.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: '' };
  }

  return {
    first_name: parts.slice(0, -1).join(' '),
    last_name: parts.slice(-1).join(' ')
  };
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'support' || value === 'seller' || value === 'ventas') return 'support';
  return 'user';
}

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length).trim();
}

function requireAuth(req, res) {
  const token = getTokenFromRequest(req);
  if (!token) {
    sendJson(res, 401, { success: false, message: 'No autenticado' });
    return null;
  }

  const checked = verify(token, config.jwtSecret);
  if (!checked.valid) {
    sendJson(res, 401, { success: false, message: checked.reason });
    return null;
  }

  if (checked.payload.isActive === false) {
    sendJson(res, 403, { success: false, message: 'Cuenta bloqueada' });
    return null;
  }

  return checked.payload;
}

async function getProfileById(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('id, email, role, is_active, first_name, last_name')
    .eq('id', userId)
    .maybeSingle();
  return data || null;
}

async function loadProductMeta(productIds) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('product_meta')
    .select(
      'product_id, seller_email, brand, available_units, colors_available, technical_specs, terms_and_conditions'
    )
    .in('product_id', productIds);

  if (error || !data) {
    return new Map();
  }

  const map = new Map();
  for (const row of data) {
    map.set(row.product_id, row);
  }
  return map;
}

async function upsertProductMeta(productId, patch) {
  const safePatch = {
    product_id: productId,
    seller_email: patch.seller_email || null,
    brand: patch.brand || null,
    available_units: typeof patch.available_units === 'number' ? patch.available_units : null,
    colors_available: Array.isArray(patch.colors_available) ? patch.colors_available : [],
    technical_specs: Array.isArray(patch.technical_specs) ? patch.technical_specs : [],
    terms_and_conditions: patch.terms_and_conditions || null
  };

  await supabase.from('product_meta').upsert(safePatch, { onConflict: 'product_id' });
}

function mergeProducts(products, metaMap) {
  return products.map((product) => {
    const meta = metaMap.get(product.id);
    if (!meta) return product;
    return {
      ...product,
      seller_email: meta.seller_email || undefined,
      brand: meta.brand || undefined,
      available_units: meta.available_units ?? undefined,
      colors_available: Array.isArray(meta.colors_available) ? meta.colors_available : [],
      technical_specs: Array.isArray(meta.technical_specs) ? meta.technical_specs : [],
      terms_and_conditions: meta.terms_and_conditions || undefined
    };
  });
}

async function handleRegister(req, res) {
  const body = await readJsonBody(req);
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!name || !email || password.length < 6) {
    sendJson(res, 400, { success: false, message: 'Datos invalidos' });
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } }
  });

  if (error) {
    sendJson(res, 400, { success: false, message: error.message });
    return;
  }

  const userId = data.user?.id;
  if (userId) {
    const { first_name, last_name } = splitName(name);
    await supabase.from('profiles').upsert(
      {
        id: userId,
        email,
        first_name,
        last_name,
        role: 'user',
        is_active: true
      },
      { onConflict: 'id' }
    );
  }

  sendJson(res, 201, {
    success: true,
    message: data.session
      ? 'Usuario registrado correctamente'
      : 'Registro creado. Revisa tu correo para confirmar la cuenta.'
  });
}

async function handleLogin(req, res) {
  const body = await readJsonBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!email || !password) {
    sendJson(res, 400, { success: false, message: 'Email y contrasena requeridos' });
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    sendJson(res, 401, { success: false, message: error?.message || 'Credenciales invalidas' });
    return;
  }

  const profile = await getProfileById(data.user.id);
  const role = normalizeRole(profile?.role);
  const isActive = profile?.is_active !== false;
  const fullName =
    `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || email.split('@')[0];

  if (!isActive) {
    sendJson(res, 403, { success: false, message: 'Tu cuenta esta bloqueada' });
    return;
  }

  const token = sign(
    { sub: data.user.id, email, role, isActive: true, name: fullName },
    config.jwtSecret,
    60 * 60 * 12
  );

  sendJson(res, 200, {
    success: true,
    token,
    user: {
      id: data.user.id,
      name: fullName,
      email,
      role,
      isActive: true
    }
  });
}

async function handleGetMe(req, res, authUser) {
  const profile = await getProfileById(authUser.sub);
  const role = normalizeRole(profile?.role || authUser.role);
  const isActive = profile?.is_active !== false;
  const name =
    `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || authUser.name || 'Usuario';

  sendJson(res, 200, {
    success: true,
    user: {
      id: authUser.sub,
      name,
      email: profile?.email || authUser.email,
      role,
      isActive
    }
  });
}

async function handleChangePassword(req, res, authUser) {
  const body = await readJsonBody(req);
  const newPassword = String(body.newPassword || '');
  if (newPassword.length < 6) {
    sendJson(res, 400, { success: false, message: 'Contrasena demasiado corta' });
    return;
  }

  const { error } = await supabase.auth.admin.updateUserById(authUser.sub, { password: newPassword });
  if (error) {
    sendJson(res, 400, { success: false, message: error.message });
    return;
  }

  sendJson(res, 200, { success: true });
}

async function handleGetUsers(req, res, authUser) {
  if (authUser.role !== 'admin') {
    sendJson(res, 403, { success: false, message: 'Sin permisos' });
    return;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, is_active, first_name, last_name');

  if (error) {
    sendJson(res, 500, { success: false, message: 'No se pudieron cargar usuarios' });
    return;
  }

  const users = (data || []).map((u) => ({
    id: u.id,
    email: u.email || 'sin-email',
    role: normalizeRole(u.role),
    isActive: u.is_active !== false,
    name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Usuario'
  }));

  sendJson(res, 200, { success: true, users });
}

async function handleSetUserRole(req, res, authUser, userId) {
  if (authUser.role !== 'admin') {
    sendJson(res, 403, { success: false, message: 'Sin permisos' });
    return;
  }

  const body = await readJsonBody(req);
  const role = normalizeRole(body.role);

  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) {
    sendJson(res, 500, { success: false, message: 'No se pudo actualizar rol' });
    return;
  }

  sendJson(res, 200, { success: true });
}

async function handleSetUserBlocked(req, res, authUser, userId) {
  if (authUser.role !== 'admin') {
    sendJson(res, 403, { success: false, message: 'Sin permisos' });
    return;
  }

  const body = await readJsonBody(req);
  const blocked = Boolean(body.blocked);
  const { error } = await supabase.from('profiles').update({ is_active: !blocked }).eq('id', userId);

  if (error) {
    sendJson(res, 500, { success: false, message: 'No se pudo actualizar estado' });
    return;
  }

  sendJson(res, 200, { success: true });
}

async function handleGetProducts(req, res) {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(*)')
    .order('created_at', { ascending: false });

  if (error) {
    sendJson(res, 500, { success: false, message: 'No se pudieron cargar productos' });
    return;
  }

  const products = data || [];
  const metaMap = await loadProductMeta(products.map((p) => p.id));
  sendJson(res, 200, { success: true, products: mergeProducts(products, metaMap) });
}

async function handleGetProductById(req, res, productId) {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(*)')
    .eq('id', productId)
    .maybeSingle();

  if (error || !data) {
    sendJson(res, 404, { success: false, message: 'Producto no encontrado' });
    return;
  }

  const metaMap = await loadProductMeta([productId]);
  const [product] = mergeProducts([data], metaMap);
  sendJson(res, 200, { success: true, product });
}

async function handleCreateProduct(req, res, authUser) {
  if (authUser.role !== 'admin' && authUser.role !== 'support') {
    sendJson(res, 403, { success: false, message: 'Sin permisos para crear productos' });
    return;
  }

  const body = await readJsonBody(req);
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const price = Number(body.price || 0);
  const stock = Number(body.availableUnits ?? body.stock ?? 0);

  if (!name || !description || !(price > 0)) {
    sendJson(res, 400, { success: false, message: 'Datos de producto invalidos' });
    return;
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      name,
      description,
      price,
      stock,
      is_active: true
    })
    .select('id, name, description, price, stock, created_at')
    .single();

  if (error || !data) {
    sendJson(res, 500, { success: false, message: error?.message || 'No se pudo crear producto' });
    return;
  }

  const imageUrl = String(body.imageUrl || '').trim();
  if (imageUrl) {
    await supabase.from('product_images').insert({
      product_id: data.id,
      image_url: imageUrl,
      is_primary: true
    });
  }

  await upsertProductMeta(data.id, {
    seller_email: authUser.email,
    brand: body.brand,
    available_units: stock,
    colors_available: body.colorsAvailable,
    technical_specs: body.technicalSpecs,
    terms_and_conditions: body.termsAndConditions
  });

  sendJson(res, 201, { success: true, productId: data.id });
}

async function handleUpdateProduct(req, res, authUser, productId) {
  if (authUser.role !== 'admin' && authUser.role !== 'support') {
    sendJson(res, 403, { success: false, message: 'Sin permisos para editar productos' });
    return;
  }

  const metaMap = await loadProductMeta([productId]);
  const meta = metaMap.get(productId);
  if (
    meta?.seller_email &&
    authUser.role !== 'admin' &&
    String(meta.seller_email).toLowerCase() !== String(authUser.email || '').toLowerCase()
  ) {
    sendJson(res, 403, { success: false, message: 'No puedes editar este producto' });
    return;
  }

  const body = await readJsonBody(req);
  const payload = {
    name: String(body.name || '').trim(),
    description: String(body.description || '').trim(),
    price: Number(body.price || 0),
    stock: Number(body.stock ?? body.availableUnits ?? 0)
  };

  if (!payload.name || !payload.description || !(payload.price > 0)) {
    sendJson(res, 400, { success: false, message: 'Datos de producto invalidos' });
    return;
  }

  const { error } = await supabase.from('products').update(payload).eq('id', productId);
  if (error) {
    sendJson(res, 500, { success: false, message: 'No se pudo actualizar producto' });
    return;
  }

  const imageUrl = String(body.imageUrl || '').trim();
  if (imageUrl) {
    const { data: existingImage } = await supabase
      .from('product_images')
      .select('id')
      .eq('product_id', productId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingImage?.id) {
      await supabase.from('product_images').update({ image_url: imageUrl }).eq('id', existingImage.id);
    } else {
      await supabase.from('product_images').insert({
        product_id: productId,
        image_url: imageUrl,
        is_primary: true
      });
    }
  }

  await upsertProductMeta(productId, {
    seller_email: meta?.seller_email || authUser.email,
    brand: body.brand ?? meta?.brand,
    available_units: payload.stock,
    colors_available: body.colorsAvailable ?? meta?.colors_available ?? [],
    technical_specs: body.technicalSpecs ?? meta?.technical_specs ?? [],
    terms_and_conditions: body.termsAndConditions ?? meta?.terms_and_conditions ?? null
  });

  sendJson(res, 200, { success: true });
}

async function handleDeleteProduct(req, res, authUser, productId) {
  if (authUser.role !== 'admin' && authUser.role !== 'support') {
    sendJson(res, 403, { success: false, message: 'Sin permisos para borrar productos' });
    return;
  }

  const metaMap = await loadProductMeta([productId]);
  const meta = metaMap.get(productId);
  if (
    meta?.seller_email &&
    authUser.role !== 'admin' &&
    String(meta.seller_email).toLowerCase() !== String(authUser.email || '').toLowerCase()
  ) {
    sendJson(res, 403, { success: false, message: 'No puedes borrar este producto' });
    return;
  }

  const { error } = await supabase.from('products').delete().eq('id', productId);
  if (error) {
    sendJson(res, 500, { success: false, message: 'No se pudo borrar producto' });
    return;
  }

  await supabase.from('product_meta').delete().eq('product_id', productId);
  sendJson(res, 200, { success: true });
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  try {
    if (req.method === 'GET' && path === '/api/health') {
      sendJson(res, 200, { success: true, status: 'ok' });
      return;
    }

    if (req.method === 'POST' && path === '/api/auth/register') {
      await handleRegister(req, res);
      return;
    }

    if (req.method === 'POST' && path === '/api/auth/login') {
      await handleLogin(req, res);
      return;
    }

    if (req.method === 'POST' && path === '/api/auth/logout') {
      sendJson(res, 200, { success: true });
      return;
    }

    if (req.method === 'GET' && path === '/api/auth/me') {
      const authUser = requireAuth(req, res);
      if (!authUser) return;
      await handleGetMe(req, res, authUser);
      return;
    }

    if (req.method === 'POST' && path === '/api/auth/change-password') {
      const authUser = requireAuth(req, res);
      if (!authUser) return;
      await handleChangePassword(req, res, authUser);
      return;
    }

    if (req.method === 'GET' && path === '/api/users') {
      const authUser = requireAuth(req, res);
      if (!authUser) return;
      await handleGetUsers(req, res, authUser);
      return;
    }

    const roleMatch = path.match(/^\/api\/users\/([^/]+)\/role$/);
    if (req.method === 'PATCH' && roleMatch) {
      const authUser = requireAuth(req, res);
      if (!authUser) return;
      await handleSetUserRole(req, res, authUser, roleMatch[1]);
      return;
    }

    const blockedMatch = path.match(/^\/api\/users\/([^/]+)\/blocked$/);
    if (req.method === 'PATCH' && blockedMatch) {
      const authUser = requireAuth(req, res);
      if (!authUser) return;
      await handleSetUserBlocked(req, res, authUser, blockedMatch[1]);
      return;
    }

    if (req.method === 'GET' && path === '/api/products') {
      await handleGetProducts(req, res);
      return;
    }

    const productIdMatch = path.match(/^\/api\/products\/([^/]+)$/);
    if (req.method === 'GET' && productIdMatch) {
      await handleGetProductById(req, res, productIdMatch[1]);
      return;
    }

    if (req.method === 'POST' && path === '/api/products') {
      const authUser = requireAuth(req, res);
      if (!authUser) return;
      await handleCreateProduct(req, res, authUser);
      return;
    }

    if (req.method === 'PUT' && productIdMatch) {
      const authUser = requireAuth(req, res);
      if (!authUser) return;
      await handleUpdateProduct(req, res, authUser, productIdMatch[1]);
      return;
    }

    if (req.method === 'DELETE' && productIdMatch) {
      const authUser = requireAuth(req, res);
      if (!authUser) return;
      await handleDeleteProduct(req, res, authUser, productIdMatch[1]);
      return;
    }

    sendJson(res, 404, { success: false, message: 'Ruta no encontrada' });
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      message: error?.message || 'Error interno'
    });
  }
});

server.listen(config.port, () => {
  console.log(`API backend escuchando en http://localhost:${config.port}`);
});
