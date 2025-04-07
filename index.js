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
  db.run(`CREATE TABLE IF NOT EXISTS Producto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    Nombre TEXT NOT NULL,
    SKU TEXT NOT NULL,
    Descripcion TEXT,
    Cantidad INTEGER NOT NULL,
    PrecioDefecto REAL NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS Cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    Nombre TEXT NOT NULL,
    NIT TEXT NOT NULL,
    Correo TEXT,
    Numero TEXT NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS Contrato (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    Fecha TEXT NOT NULL,
    Ciudad TEXT,
    Vencimiento TEXT,
    Country TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS Precios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fkProducto INTEGER NOT NULL,
    fkContrato INTEGER,
    fkCliente INTEGER,
    Precio REAL NOT NULL,
    minCantidad INTEGER NOT NULL,
    FOREIGN KEY (fkProducto) REFERENCES Producto(id),
    FOREIGN KEY (fkContrato) REFERENCES Contrato(id),
    FOREIGN KEY (fkCliente) REFERENCES Cliente(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS Pedido (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fkCliente INTEGER NOT NULL,
    TOTAL REAL NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (fkCliente) REFERENCES Cliente(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS ProductosPedido (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fkProducto INTEGER NOT NULL,
    fkPrecio INTEGER,
    fkPedido INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    precioUsado REAL NOT NULL,
    FOREIGN KEY (fkProducto) REFERENCES Producto(id),
    FOREIGN KEY (fkPrecio) REFERENCES Precios(id),
    FOREIGN KEY (fkPedido) REFERENCES Pedido(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS TPM (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fkCliente INTEGER NOT NULL,
    fkProducto INTEGER NOT NULL,
    TPM REAL NOT NULL CHECK (TPM >= 0 AND TPM <= 1),
    Country TEXT,
    FOREIGN KEY (fkCliente) REFERENCES Cliente(id),
    FOREIGN KEY (fkProducto) REFERENCES Producto(id)
  )`);
});

// Endpoints para Producto
app.get('/products', (req, res) => {
  db.all('SELECT * FROM Producto', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/products', (req, res) => {
  const { Nombre, SKU, Descripcion, Cantidad, PrecioDefecto } = req.body;
  if (!Nombre || !SKU || !Cantidad || !PrecioDefecto) {
    return res.status(400).json({ error: 'Faltan datos requeridos (Nombre, SKU, Cantidad, PrecioDefecto)' });
  }
  db.run(
    'INSERT INTO Producto (Nombre, SKU, Descripcion, Cantidad, PrecioDefecto) VALUES (?, ?, ?, ?, ?)',
    [Nombre, SKU, Descripcion || null, Cantidad, PrecioDefecto],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

// Endpoints para Cliente
app.get('/clients', (req, res) => {
  db.all('SELECT * FROM Cliente', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/clients', (req, res) => {
  const { Nombre, NIT, Correo, Numero } = req.body;
  if (!Nombre || !NIT || !Numero) {
    return res.status(400).json({ error: 'Faltan datos requeridos (Nombre, NIT, Numero)' });
  }
  db.run(
    'INSERT INTO Cliente (Nombre, NIT, Correo, Numero) VALUES (?, ?, ?, ?)',
    [Nombre, NIT, Correo || null, Numero],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

// Endpoints para Contrato
app.get('/contracts', (req, res) => {
  db.all('SELECT * FROM Contrato', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/contracts', (req, res) => {
  const { Fecha, Ciudad, Vencimiento, Country } = req.body;
  if (!Fecha) {
    return res.status(400).json({ error: 'Falta la fecha del contrato' });
  }
  db.run(
    'INSERT INTO Contrato (Fecha, Ciudad, Vencimiento, Country) VALUES (?, ?, ?, ?)',
    [Fecha, Ciudad || null, Vencimiento || null, Country || null],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

// Endpoints para Precios
app.get('/prices', (req, res) => {
  db.all('SELECT * FROM Precios', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/prices', (req, res) => {
  const { fkProducto, fkContrato, fkCliente, Precio, minCantidad } = req.body;
  if (!fkProducto || !Precio || !minCantidad) {
    return res.status(400).json({ error: 'Faltan datos requeridos (fkProducto, Precio, minCantidad)' });
  }
  db.run(
    'INSERT INTO Precios (fkProducto, fkContrato, fkCliente, Precio, minCantidad) VALUES (?, ?, ?, ?, ?)',
    [fkProducto, fkContrato || null, fkCliente || null, Precio, minCantidad],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

// Endpoints para Pedido
app.get('/orders', (req, res) => {
  db.all('SELECT * FROM Pedido', [], (err, orders) => {
    if (err) return res.status(500).json({ error: err.message });

    const promises = orders.map(order => {
      return new Promise((resolve, reject) => {
        db.get('SELECT * FROM Cliente WHERE id = ?', [order.fkCliente], (err, client) => {
          if (err) return reject(err);

          db.all(
            'SELECT pp.*, p.Nombre FROM ProductosPedido pp JOIN Producto p ON pp.fkProducto = p.id WHERE fkPedido = ?',
            [order.id],
            (err, items) => {
              if (err) return reject(err);

              resolve({
                ...order,
                customer: client,
                products: items.map(item => ({
                  product_id: item.fkProducto,
                  product_name: item.Nombre,
                  quantity: item.quantity,
                  price: item.precioUsado
                }))
              });
            }
          );
        });
      });
    });

    Promise.all(promises)
      .then(results => res.json(results))
      .catch(err => res.status(500).json({ error: err.message }));
  });
});

app.get('/orders/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM Pedido WHERE id = ?', [id], (err, order) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });

    db.get('SELECT * FROM Cliente WHERE id = ?', [order.fkCliente], (err, client) => {
      if (err) return res.status(500).json({ error: err.message });

      db.all(
        'SELECT pp.*, p.Nombre FROM ProductosPedido pp JOIN Producto p ON pp.fkProducto = p.id WHERE fkPedido = ?',
        [id],
        (err, items) => {
          if (err) return res.status(500).json({ error: err.message });

          const invoice = {
            order_id: order.id,
            customer: client,
            products: items.map(item => ({
              product_id: item.fkProducto,
              product_name: item.Nombre,
              quantity: item.quantity,
              price: item.precioUsado
            })),
            total: order.TOTAL,
            created_at: order.created_at
          };
          res.json(invoice);
        }
      );
    });
  });
});

app.post('/orders', async (req, res) => {
  const { fkCliente, products } = req.body;
  if (!fkCliente || !products || !Array.isArray(products)) {
    return res.status(400).json({ error: 'Faltan datos requeridos (fkCliente, products)' });
  }

  try {
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

    const client = await dbGet('SELECT * FROM Cliente WHERE id = ?', [fkCliente]);
    if (!client) {
      return res.status(400).json({ error: 'Cliente no encontrado' });
    }

    const contract = await dbGet(
      'SELECT * FROM Contrato WHERE id IN (SELECT fkContrato FROM Precios WHERE fkCliente = ?) ORDER BY Fecha DESC LIMIT 1',
      [fkCliente]
    );

    let total = 0;
    const productPrices = [];
    for (const { id, quantity } of products) {
      const product = await dbGet('SELECT * FROM Producto WHERE id = ?', [id]);
      if (!product) {
        return res.status(400).json({ error: `Producto con ID ${id} no encontrado` });
      }
      if (product.Cantidad < quantity) {
        return res.status(400).json({ error: `Inventario insuficiente para producto ${id}` });
      }

      let priceRow = null;
      let precioUsado = product.PrecioDefecto;
      let priceId = null;

      if (contract) {
        priceRow = await dbGet(
          'SELECT * FROM Precios WHERE fkProducto = ? AND fkCliente = ? AND fkContrato = ? AND minCantidad <= ?',
          [id, fkCliente, contract.id, quantity]
        );
      }
      if (!priceRow) {
        priceRow = await dbGet(
          'SELECT * FROM Precios WHERE fkProducto = ? AND fkCliente = ? AND fkContrato IS NULL AND minCantidad <= ?',
          [id, fkCliente, quantity]
        );
      }
      if (priceRow) {
        precioUsado = priceRow.Precio;
        priceId = priceRow.id;
      }

      total += precioUsado * quantity;
      productPrices.push({ productId: id, quantity, priceId, precioUsado });
    }

    await dbRun('BEGIN TRANSACTION');

    const createdAt = new Date().toISOString();
    const orderResult = await dbRun(
      'INSERT INTO Pedido (fkCliente, TOTAL, created_at) VALUES (?, ?, ?)',
      [fkCliente, total, createdAt]
    );
    const orderId = orderResult.lastID;

    for (const { productId, quantity, priceId, precioUsado } of productPrices) {
      await dbRun(
        'INSERT INTO ProductosPedido (fkProducto, fkPrecio, fkPedido, quantity, precioUsado) VALUES (?, ?, ?, ?, ?)',
        [productId, priceId, orderId, quantity, precioUsado]
      );
      await dbRun('UPDATE Producto SET Cantidad = Cantidad - ? WHERE id = ?', [quantity, productId]);
    }

    const orderItems = await dbAll(
      'SELECT pp.*, p.Nombre FROM ProductosPedido pp JOIN Producto p ON pp.fkProducto = p.id WHERE fkPedido = ?',
      [orderId]
    );
    const invoice = {
      order_id: orderId,
      customer: client,
      products: orderItems.map(item => ({
        product_id: item.fkProducto,
        product_name: item.Nombre,
        quantity: item.quantity,
        price: item.precioUsado
      })),
      total,
      created_at: createdAt
    };

    await dbRun('COMMIT');

    res.status(201).json({ message: 'Pedido creado', invoice });
  } catch (error) {
    await dbRun('ROLLBACK');
    console.error(error);
    res.status(500).json({ error: 'Error al procesar el pedido: ' + error.message });
  }
});

// Endpoints para ProductosPedido
app.get('/order-items', (req, res) => {
  db.all(
    'SELECT pp.*, p.Nombre AS product_name, ped.fkCliente FROM ProductosPedido pp JOIN Producto p ON pp.fkProducto = p.id JOIN Pedido ped ON pp.fkPedido = ped.id',
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Endpoints para TPM
app.get('/tpm', (req, res) => {
  db.all('SELECT * FROM TPM', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/tpm', (req, res) => {
  const { fkCliente, fkProducto, TPM, Country } = req.body;
  if (!fkCliente || !fkProducto || TPM === undefined || TPM < 0 || TPM > 1) {
    return res.status(400).json({ error: 'Faltan datos requeridos o TPM inválido (debe estar entre 0 y 1)' });
  }
  db.run(
    'INSERT INTO TPM (fkCliente, fkProducto, TPM, Country) VALUES (?, ?, ?, ?)',
    [fkCliente, fkProducto, TPM, Country || null],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`API corriendo en http://localhost:${port}`);
});