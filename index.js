const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

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

// CRUD Productos (mantenemos los existentes, solo muestro uno como referencia)
app.get('/products', (req, res) => {
  db.all('SELECT * FROM products', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Crear un pedido
app.post('/orders', (req, res) => {
  const { customer_name, customer_id, products } = req.body;
  if (!customer_name || !products || !Array.isArray(products)) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  db.serialize(() => {
    // Verificar inventario
    const checkStmt = db.prepare('SELECT id, quantity, price FROM products WHERE id = ?');
    let total = 0;
    let inventoryError = false;

    for (const { id, quantity } of products) {
      checkStmt.get(id, (err, row) => {
        if (err || !row || row.quantity < quantity) {
          inventoryError = true;
        } else {
          total += row.price * quantity;
        }
      });
    }
    checkStmt.finalize();

    if (inventoryError) {
      return res.status(400).json({ error: 'Inventario insuficiente o producto no encontrado' });
    }

    // Crear pedido
    const createdAt = new Date().toISOString();
    db.run('INSERT INTO orders (customer_name, customer_id, total, created_at) VALUES (?, ?, ?, ?)',
      [customer_name, customer_id || null, total, createdAt], function(err) {
        if (err) return res.status(500).json({ error: err.message });

        const orderId = this.lastID;
        const itemStmt = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');

        products.forEach(({ id, quantity }) => {
          db.get('SELECT price FROM products WHERE id = ?', [id], (err, row) => {
            itemStmt.run(orderId, id, quantity, row.price);
          });
        });
        itemStmt.finalize();

        // Actualizar inventario
        const updateStmt = db.prepare('UPDATE products SET quantity = quantity - ? WHERE id = ?');
        products.forEach(({ id, quantity }) => {
          updateStmt.run(quantity, id);
        });
        updateStmt.finalize();

        // Generar factura
        const invoice = {
          order_id: orderId,
          customer_name,
          customer_id: customer_id || 'N/A',
          products: products.map(p => ({
            product_id: p.id,
            quantity: p.quantity,
            price: db.get('SELECT price FROM products WHERE id = ?', [p.id]).price
          })),
          total,
          created_at: createdAt,
          tax: total * 0.19, // Ejemplo: 19% IVA (ajustable)
          grand_total: total * 1.19
        };

        res.status(201).json({ message: 'Pedido creado', invoice });
      });
  });
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