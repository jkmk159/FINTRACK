import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("finance.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS banks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    balance REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('income', 'expense')) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT CHECK(type IN ('income', 'expense')) NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT CHECK(status IN ('pending', 'confirmed')) DEFAULT 'pending',
    bank_id INTEGER,
    category_id INTEGER,
    recurring_id TEXT,
    FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE SET NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );
`);

// Migration for existing databases
const tableInfo = db.prepare("PRAGMA table_info(transactions)").all();
const hasStatus = tableInfo.some((col: any) => col.name === 'status');
if (!hasStatus) {
  db.exec("ALTER TABLE transactions ADD COLUMN status TEXT CHECK(status IN ('pending', 'confirmed')) DEFAULT 'confirmed'");
  db.exec("UPDATE transactions SET status = 'confirmed'");
}

const hasCategoryId = tableInfo.some((col: any) => col.name === 'category_id');
if (!hasCategoryId) {
  db.exec("ALTER TABLE transactions ADD COLUMN category_id INTEGER");
}

const hasRecurringId = tableInfo.some((col: any) => col.name === 'recurring_id');
if (!hasRecurringId) {
  db.exec("ALTER TABLE transactions ADD COLUMN recurring_id TEXT");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  
  // Banks
  app.get("/api/banks", (req, res) => {
    const banks = db.prepare("SELECT * FROM banks").all();
    res.json(banks);
  });

  app.post("/api/banks", (req, res) => {
    const { name, balance } = req.body;
    const info = db.prepare("INSERT INTO banks (name, balance) VALUES (?, ?)").run(name, balance || 0);
    res.json({ id: info.lastInsertRowid, name, balance: balance || 0 });
  });

  app.put("/api/banks/:id", (req, res) => {
    const { name, balance } = req.body;
    const id = req.params.id;
    try {
      db.prepare("UPDATE banks SET name = ?, balance = ? WHERE id = ?").run(name, balance, id);
      res.json({ success: true });
    } catch (error) {
      console.error(`Error updating bank ${id}:`, error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/banks/:id", (req, res) => {
    const id = req.params.id;
    console.log(`DELETE request for bank ID: ${id}`);
    try {
      // Check if there are transactions associated with this bank
      const transactionCount: any = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE bank_id = ?").get(id);
      
      if (transactionCount.count > 0) {
        console.log(`Cannot delete bank ${id} because it has ${transactionCount.count} transactions`);
        return res.status(400).json({ 
          error: "Não é possível excluir um banco que possui transações vinculadas. Exclua as transações primeiro ou altere o banco delas." 
        });
      }

      db.prepare("DELETE FROM banks WHERE id = ?").run(id);
      console.log(`Bank ${id} deleted successfully`);
      res.json({ success: true });
    } catch (error) {
      console.error(`Error deleting bank ${id}:`, error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Categories
  app.get("/api/categories", (req, res) => {
    const categories = db.prepare("SELECT * FROM categories ORDER BY name ASC").all();
    res.json(categories);
  });

  app.post("/api/categories", (req, res) => {
    const { name, type } = req.body;
    const info = db.prepare("INSERT INTO categories (name, type) VALUES (?, ?)").run(name, type);
    res.json({ id: info.lastInsertRowid, name, type });
  });

  app.put("/api/categories/:id", (req, res) => {
    const { name, type } = req.body;
    db.prepare("UPDATE categories SET name = ?, type = ? WHERE id = ?").run(name, type, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/categories/:id", (req, res) => {
    db.prepare("DELETE FROM categories WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Transactions
  app.get("/api/transactions", (req, res) => {
    const transactions = db.prepare(`
      SELECT t.*, b.name as bank_name, c.name as category_name
      FROM transactions t 
      LEFT JOIN banks b ON t.bank_id = b.id
      LEFT JOIN categories c ON t.category_id = c.id
      ORDER BY date DESC, id DESC
    `).all();
    res.json(transactions);
  });

  app.post("/api/transactions", (req, res) => {
    const { type, amount, description, date, bank_id, status, category_id, recurring } = req.body;
    
    const transaction = db.transaction(() => {
      const results = [];
      const recurring_id = recurring ? `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null;
      
      // If recurring, create multiple transactions
      const count = recurring?.months || 1;
      const startDate = new Date(date);

      for (let i = 0; i < count; i++) {
        const currentDate = new Date(startDate);
        currentDate.setMonth(startDate.getMonth() + i);
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // Only the first one can be confirmed if it's today or past, 
        // but let's respect the user's initial status for the first one and set others to pending
        const currentStatus = i === 0 ? (status || 'pending') : 'pending';

        const info = db.prepare(`
          INSERT INTO transactions (type, amount, description, date, bank_id, status, category_id, recurring_id) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(type, amount, description, dateStr, bank_id, currentStatus, category_id, recurring_id);

        // Update bank balance only if confirmed
        if (bank_id && currentStatus === 'confirmed') {
          const adjustment = type === 'income' ? amount : -amount;
          db.prepare("UPDATE banks SET balance = balance + ? WHERE id = ?").run(adjustment, bank_id);
        }
        
        if (i === 0) {
          results.push({ id: info.lastInsertRowid, type, amount, description, date: dateStr, bank_id, status: currentStatus, category_id, recurring_id });
        }
      }

      return results[0];
    });

    const result = transaction();
    res.json(result);
  });

  app.patch("/api/transactions/:id/confirm", (req, res) => {
    const oldTransaction: any = db.prepare("SELECT * FROM transactions WHERE id = ?").get(req.params.id);
    if (!oldTransaction) return res.status(404).json({ error: "Not found" });
    if (oldTransaction.status === 'confirmed') return res.json({ success: true });

    const transaction = db.transaction(() => {
      db.prepare("UPDATE transactions SET status = 'confirmed' WHERE id = ?").run(req.params.id);
      
      if (oldTransaction.bank_id) {
        const adjustment = oldTransaction.type === 'income' ? oldTransaction.amount : -oldTransaction.amount;
        db.prepare("UPDATE banks SET balance = balance + ? WHERE id = ?").run(adjustment, oldTransaction.bank_id);
      }
    });

    transaction();
    res.json({ success: true });
  });

  app.put("/api/transactions/:id", (req, res) => {
    const { type, amount, description, date, bank_id, status, category_id } = req.body;
    const oldTransaction: any = db.prepare("SELECT * FROM transactions WHERE id = ?").get(req.params.id);

    if (!oldTransaction) return res.status(404).json({ error: "Not found" });

    const transaction = db.transaction(() => {
      // Revert old balance if it was confirmed
      if (oldTransaction.bank_id && oldTransaction.status === 'confirmed') {
        const oldAdjustment = oldTransaction.type === 'income' ? -oldTransaction.amount : oldTransaction.amount;
        db.prepare("UPDATE banks SET balance = balance + ? WHERE id = ?").run(oldAdjustment, oldTransaction.bank_id);
      }

      // Update transaction
      db.prepare(`
        UPDATE transactions 
        SET type = ?, amount = ?, description = ?, date = ?, bank_id = ?, status = ?, category_id = ?
        WHERE id = ?
      `).run(type, amount, description, date, bank_id, status, category_id, req.params.id);

      // Apply new balance if new status is confirmed
      if (bank_id && status === 'confirmed') {
        const newAdjustment = type === 'income' ? amount : -amount;
        db.prepare("UPDATE banks SET balance = balance + ? WHERE id = ?").run(newAdjustment, bank_id);
      }
    });

    transaction();
    res.json({ success: true });
  });

  app.delete("/api/transactions/:id", (req, res) => {
    const id = Number(req.params.id);
    console.log(`DELETE request for transaction ID: ${id} (original: ${req.params.id})`);
    
    if (isNaN(id)) {
      console.error(`Invalid ID format: ${req.params.id}`);
      return res.status(400).json({ error: "Invalid ID format" });
    }

    try {
      const oldTransaction: any = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
      if (!oldTransaction) {
        console.log(`Transaction ${id} not found in database`);
        return res.status(404).json({ error: "Not found" });
      }

      console.log(`Found transaction to delete: ${JSON.stringify(oldTransaction)}`);

      const deleteOp = db.transaction(() => {
        // Revert balance only if confirmed
        if (oldTransaction.bank_id && oldTransaction.status === 'confirmed') {
          const adjustment = oldTransaction.type === 'income' ? -oldTransaction.amount : oldTransaction.amount;
          console.log(`Reverting bank balance: Bank ${oldTransaction.bank_id}, Adjustment ${adjustment}`);
          db.prepare("UPDATE banks SET balance = balance + ? WHERE id = ?").run(adjustment, oldTransaction.bank_id);
        }
        
        console.log(`Executing DELETE for transaction ${id}`);
        const result = db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
        console.log(`DELETE result: ${JSON.stringify(result)}`);
      });

      deleteOp();
      console.log(`Transaction ${id} successfully deleted and balance reverted if necessary`);
      res.json({ success: true });
    } catch (error) {
      console.error(`CRITICAL ERROR deleting transaction ${id}:`, error);
      res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
