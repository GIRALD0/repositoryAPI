const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
const cors = require('cors');
app.use(cors());

// Conexión a la base de datos SQLite
const db = new sqlite3.Database('./inventory.db', (err) => {
  if (err) console.error(err.message);
  console.log('Conectado a la base de datos SQLite.');
});

// Crear tablas
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    customer_id TEXT,
    status TEXT NOT NULL DEFAULT 'pendiente',
    total REAL NOT NULL,
    created_at TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    order_id INTEGER,
    product_id INTEGER,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`);
});


// CRUD Endpoints
// Obtener todos los productos
app.get('/products', (req, res) => {
  db.all('SELECT * FROM products', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Obtener un producto por ID
app.get('/products/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(row);
  });
});

// Crear un producto
app.post('/products', (req, res) => {
  const { name, quantity, price } = req.body;
  if (!name || !quantity || !price) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }
  db.run('INSERT INTO products (name, quantity, price) VALUES (?, ?, ?)', 
    [name, quantity, price], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    });
});

// Actualizar un producto
app.put('/products/:id', (req, res) => {
  const { id } = req.params;
  const { name, quantity, price } = req.body;
  db.run('UPDATE products SET name = ?, quantity = ?, price = ? WHERE id = ?', 
    [name, quantity, price, id], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
      res.json({ message: 'Producto actualizado' });
    });
});

// Eliminar un producto
app.delete('/products/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ message: 'Producto eliminado' });
  });
});


// Crear un pedido
app.post('/orders', async (req, res) => {
  const { customer_name, customer_id, products } = req.body;
  if (!customer_name || !products || !Array.isArray(products)) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  try {
    // Promisify db operations
    const dbGet = (sql, params) => new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
    const dbRun = (sql, params) => new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        err ? reject(err) : resolve(this);
      });
    });
    const dbAll = (sql, params) => new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

    // 1. Verificar inventario
    let total = 0;
    for (const { id, quantity } of products) {
      const product = await dbGet('SELECT id, quantity, price FROM products WHERE id = ?', [id]);
      if (!product) {
        return res.status(400).json({ error: `Producto con ID ${id} no encontrado` });
      }
      if (product.quantity < quantity) {
        return res.status(400).json({ error: `Inventario insuficiente para producto ${id}` });
      }
      total += product.price * quantity;
    }

    // 2. Iniciar transacción
    await dbRun('BEGIN TRANSACTION');

    // 3. Crear pedido
    const createdAt = new Date().toISOString();
    const orderResult = await dbRun(
      'INSERT INTO orders (customer_name, customer_id, total, created_at) VALUES (?, ?, ?, ?)',
      [customer_name, customer_id || null, total, createdAt]
    );
    const orderId = orderResult.lastID;

    // 4. Insertar ítems del pedido
    for (const { id, quantity } of products) {
      const product = await dbGet('SELECT price FROM products WHERE id = ?', [id]);
      await dbRun(
        'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
        [orderId, id, quantity, product.price]
      );
      // 5. Actualizar inventario
      await dbRun('UPDATE products SET quantity = quantity - ? WHERE id = ?', [quantity, id]);
    }

    // 6. Generar factura
    const orderItems = await dbAll('SELECT product_id, quantity, price FROM order_items WHERE order_id = ?', [orderId]);
    const invoice = {
      order_id: orderId,
      customer_name,
      customer_id: customer_id || 'N/A',
      products: orderItems.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        price: item.price
      })),
      total,
      tax: total * 0.19, // 19% IVA (ajustable)
      grand_total: total * 1.19,
      created_at: createdAt
    };

    // 7. Confirmar transacción
    await dbRun('COMMIT');

    res.status(201).json({ message: 'Pedido creado', invoice });
  } catch (error) {
    // Revertir transacción en caso de error
    await dbRun('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Error al procesar el pedido: ' + error.message });
  }
});

// Listar todos los pedidos
app.get('/orders', (req, res) => {
  db.all('SELECT * FROM orders', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Obtener un pedido con factura
app.get('/orders/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    db.all('SELECT product_id, quantity, price FROM order_items WHERE order_id = ?', [id], (err, items) => {
      if (err) return res.status(500).json({ error: err.message });

      const invoice = {
        order_id: order.id,
        customer_name: order.customer_name,
        customer_id: order.customer_id || 'N/A',
        status: order.status,
        products: items,
        total: order.total,
        tax: order.total * 0.19, // 19% IVA
        grand_total: order.total * 1.19,
        created_at: order.created_at
      };
      res.json(invoice);
    });
  });
});

// Actualizar un pedido (ejemplo: cambiar estado)
app.put('/orders/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Estado requerido' });

  db.run('UPDATE orders SET status = ? WHERE id = ?', [status, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json({ message: 'Pedido actualizado' });
  });
});

// Eliminar un pedido
app.delete('/orders/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM orders WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
    db.run('DELETE FROM order_items WHERE order_id = ?', [id]);
    res.json({ message: 'Pedido eliminado' });
  });
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`API corriendo en http://localhost:${port}`);
});