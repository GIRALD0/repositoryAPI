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

// Crear tabla de productos
db.run(`CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price REAL NOT NULL
)`);

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

// Confirmar compra
app.post('/purchases', (req, res) => {
  const { products } = req.body;
  if (!products || !Array.isArray(products)) {
    return res.status(400).json({ error: 'Se requiere un arreglo de productos' });
  }

  db.serialize(() => {
    const stmt = db.prepare('UPDATE products SET quantity = quantity - ? WHERE id = ? AND quantity >= ?');
    let errorOccurred = false;

    products.forEach(({ id, quantity }) => {
      stmt.run(quantity, id, quantity, function(err) {
        if (err || this.changes === 0) {
          errorOccurred = true;
        }
      });
    });

    stmt.finalize(() => {
      if (errorOccurred) {
        return res.status(400).json({ error: 'Error al procesar la compra o inventario insuficiente' });
      }
      res.json({ message: 'Compra procesada exitosamente' });
    });
  });
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`API corriendo en http://localhost:${port}`);
});