const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = '0n3dost4u';
const DB_FILE = path.join(__dirname, 'news.db');
const BOOKINGS_FILE = path.join(__dirname, 'bookings.db');

const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
    process.exit(1);
  }
  console.log('Connected to SQLite database.');
});

const bookingsDb = new sqlite3.Database(BOOKINGS_FILE, (err) => {
  if (err) {
    console.error('Failed to open bookings database:', err.message);
    process.exit(1);
  }
  console.log('Connected to Bookings database.');
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

const initDb = () => {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        image_path TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    db.get('SELECT COUNT(*) AS count FROM news', (err, row) => {
      if (err) {
        console.error('Failed to count news rows:', err.message);
        return;
      }

      if (row.count === 0) {
        const sampleNews = [
          {
            title: 'Welcome to DOSTXAMCen',
            date: '2026-06-01',
            category: 'General',
            description: 'DOSTXAMCen is dedicated to providing quality education based on Salesian values.',
            image_path: 'https://via.placeholder.com/300x180?text=Welcome',
            created_at: new Date('2026-05-20T08:00:00').getTime()
          },
          {
            title: 'Sports Day 2026',
            date: '2026-05-28',
            category: 'Events',
            description: 'Our annual sports day was a huge success with students showcasing their athletic talents. Congratulations to all winners!',
            image_path: 'https://via.placeholder.com/300x180?text=Sports+Day',
            created_at: new Date('2026-05-25T10:30:00').getTime()
          },
          {
            title: 'New Library Wing Opening',
            date: '2026-05-20',
            category: 'Facilities',
            description: 'The new library wing is now open with over 5,000 new books and modern study facilities for all students.',
            image_path: 'https://via.placeholder.com/300x180?text=Library',
            created_at: new Date('2026-06-01T14:15:00').getTime()
          }
        ];

        const stmt = db.prepare(`
          INSERT INTO news (title, date, category, description, image_path, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        sampleNews.forEach(({ title, date, category, description, image_path, created_at }) => {
          stmt.run(title, date, category, description, image_path, created_at);
        });

        stmt.finalize();
      }
    });
  });

  // Initialize Bookings Database
  bookingsDb.serialize(() => {
    bookingsDb.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        service TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        message TEXT,
        status TEXT DEFAULT 'pending',
        created_at INTEGER NOT NULL
      )
    `);

    bookingsDb.run(`
      CREATE TABLE IF NOT EXISTS mails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER,
        sender TEXT NOT NULL,
        recipient TEXT NOT NULL,
        subject TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(booking_id) REFERENCES bookings(id)
      )
    `);
  });
};

const getNewsItem = (id, callback) => {
  db.get('SELECT * FROM news WHERE id = ?', [id], callback);
};

app.options(/(.*)/, (req, res) => res.sendStatus(204));

app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

app.post('/api/admin/check-password', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, message: 'Password is required' });
  }

  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, message: 'Password correct' });
  }

  res.status(401).json({ success: false, message: 'Incorrect password' });
});

app.get('/api/news', (req, res) => {
  db.all('SELECT * FROM news ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('Failed to fetch news:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to fetch news' });
    }
    res.json(rows);
  });
});

app.get('/api/news/:id', (req, res) => {
  const id = Number(req.params.id);
  getNewsItem(id, (err, row) => {
    if (err) {
      console.error('Failed to fetch news item:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to fetch news item' });
    }
    if (!row) {
      return res.status(404).json({ success: false, message: 'News not found' });
    }
    res.json(row);
  });
});

app.post('/api/news', (req, res) => {
  const { title, date, category, description, image_path, password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  if (!title || !date || !category || !description) {
    return res.status(400).json({ success: false, message: 'Title, date, category, and description are required' });
  }

  const imagePath = image_path || 'https://via.placeholder.com/300x180?text=No+Image';
  const createdAt = Date.now();

  db.run(
    'INSERT INTO news (title, date, category, description, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [title, date, category, description, imagePath, createdAt],
    function (err) {
      if (err) {
        console.error('Failed to create news item:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to create news' });
      }
      db.get('SELECT * FROM news WHERE id = ?', [this.lastID], (err, row) => {
        if (err) {
          console.error('Failed to fetch created news item:', err.message);
          return res.status(500).json({ success: false, message: 'Failed to fetch created news' });
        }
        res.status(201).json({ success: true, message: 'News created', data: row });
      });
    }
  );
});

app.put('/api/news/:id', (req, res) => {
  const id = Number(req.params.id);
  const { title, date, category, description, image_path, password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  getNewsItem(id, (err, row) => {
    if (err) {
      console.error('Failed to fetch news item:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to fetch news' });
    }
    if (!row) {
      return res.status(404).json({ success: false, message: 'News not found' });
    }

    const updated = {
      title: title || row.title,
      date: date || row.date,
      category: category || row.category,
      description: description || row.description,
      image_path: image_path || row.image_path
    };

    db.run(
      'UPDATE news SET title = ?, date = ?, category = ?, description = ?, image_path = ? WHERE id = ?',
      [updated.title, updated.date, updated.category, updated.description, updated.image_path, id],
      function (err) {
        if (err) {
          console.error('Failed to update news item:', err.message);
          return res.status(500).json({ success: false, message: 'Failed to update news' });
        }
        db.get('SELECT * FROM news WHERE id = ?', [id], (err, row) => {
          if (err) {
            console.error('Failed to fetch updated news item:', err.message);
            return res.status(500).json({ success: false, message: 'Failed to fetch updated news' });
          }
          res.json({ success: true, message: 'News updated', data: row });
        });
      }
    );
  });
});

app.delete('/api/news/:id', (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  getNewsItem(id, (err, row) => {
    if (err) {
      console.error('Failed to fetch news item:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to delete news' });
    }
    if (!row) {
      return res.status(404).json({ success: false, message: 'News not found' });
    }

    db.run('DELETE FROM news WHERE id = ?', [id], function (err) {
      if (err) {
        console.error('Failed to delete news item:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to delete news' });
      }
      res.json({ success: true, message: 'News deleted', data: row });
    });
  });
});

// ===== BOOKING & MAIL ENDPOINTS =====

// Create booking from online form
app.post('/api/bookings', (req, res) => {
  const { name, email, phone, service, date, time, message } = req.body;

  if (!name || !email || !phone || !service || !date || !time) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields: name, email, phone, service, date, time' 
    });
  }

  const createdAt = Date.now();
  const timestamp = new Date().toLocaleString();

  bookingsDb.run(
    `INSERT INTO bookings (name, email, phone, service, date, time, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, email, phone, service, date, time, message || '', createdAt],
    function (err) {
      if (err) {
        console.error('Failed to create booking:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to create booking' });
      }

      const bookingId = this.lastID;

      // Create corresponding mail notification
      const mailSubject = `New Booking Confirmation - ${service}`;
      const mailContent = `
New booking received!

Client: ${name}
Email: ${email}
Phone: ${phone}
Service: ${service}
Date: ${date}
Time: ${time}
${message ? `Message: ${message}` : ''}

Please confirm or reject this booking.
      `.trim();

      bookingsDb.run(
        `INSERT INTO mails (booking_id, sender, recipient, subject, content, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [bookingId, email, 'admin@dostamcen.com', mailSubject, mailContent, timestamp, createdAt],
        function (err) {
          if (err) {
            console.error('Failed to create mail notification:', err.message);
          }

          // Return booking info
          bookingsDb.get(
            'SELECT * FROM bookings WHERE id = ?',
            [bookingId],
            (err, booking) => {
              if (err) {
                console.error('Failed to fetch created booking:', err.message);
                return res.status(500).json({ success: false, message: 'Failed to fetch booking' });
              }

              res.status(201).json({ 
                success: true, 
                message: 'Booking created and mail notification sent',
                data: booking 
              });
            }
          );
        }
      );
    }
  );
});

// Get all bookings
app.get('/api/bookings', (req, res) => {
  bookingsDb.all(
    'SELECT * FROM bookings ORDER BY created_at DESC',
    (err, rows) => {
      if (err) {
        console.error('Failed to fetch bookings:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to fetch bookings' });
      }
      res.json(rows || []);
    }
  );
});

// Get booking by ID
app.get('/api/bookings/:id', (req, res) => {
  const id = Number(req.params.id);
  bookingsDb.get(
    'SELECT * FROM bookings WHERE id = ?',
    [id],
    (err, row) => {
      if (err) {
        console.error('Failed to fetch booking:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to fetch booking' });
      }
      if (!row) {
        return res.status(404).json({ success: false, message: 'Booking not found' });
      }
      res.json(row);
    }
  );
});

// Update booking status
app.put('/api/bookings/:id', (req, res) => {
  const id = Number(req.params.id);
  const { status, password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  if (!status) {
    return res.status(400).json({ success: false, message: 'Status is required' });
  }

  bookingsDb.run(
    'UPDATE bookings SET status = ? WHERE id = ?',
    [status, id],
    function (err) {
      if (err) {
        console.error('Failed to update booking:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to update booking' });
      }

      bookingsDb.get(
        'SELECT * FROM bookings WHERE id = ?',
        [id],
        (err, row) => {
          if (err) {
            console.error('Failed to fetch updated booking:', err.message);
            return res.status(500).json({ success: false, message: 'Failed to fetch booking' });
          }
          res.json({ success: true, message: 'Booking updated', data: row });
        }
      );
    }
  );
});

// Delete booking
app.delete('/api/bookings/:id', (req, res) => {
  const id = Number(req.params.id);
  const { password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  bookingsDb.run(
    'DELETE FROM bookings WHERE id = ?',
    [id],
    function (err) {
      if (err) {
        console.error('Failed to delete booking:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to delete booking' });
      }

      res.json({ success: true, message: 'Booking deleted' });
    }
  );
});

// Get all mails from bookings
app.get('/api/mails', (req, res) => {
  bookingsDb.all(
    'SELECT * FROM mails ORDER BY created_at DESC',
    (err, rows) => {
      if (err) {
        console.error('Failed to fetch mails:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to fetch mails' });
      }
      res.json(rows || []);
    }
  );
});

// Mark mail as read
app.put('/api/mails/:id', (req, res) => {
  const id = Number(req.params.id);
  bookingsDb.run(
    'UPDATE mails SET is_read = 1 WHERE id = ?',
    [id],
    function (err) {
      if (err) {
        console.error('Failed to update mail:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to update mail' });
      }

      bookingsDb.get(
        'SELECT * FROM mails WHERE id = ?',
        [id],
        (err, row) => {
          if (err) {
            console.error('Failed to fetch mail:', err.message);
            return res.status(500).json({ success: false, message: 'Failed to fetch mail' });
          }
          res.json({ success: true, message: 'Mail marked as read', data: row });
        }
      );
    }
  );
});

// Delete mail
app.delete('/api/mails/:id', (req, res) => {
  const id = Number(req.params.id);
  bookingsDb.run(
    'DELETE FROM mails WHERE id = ?',
    [id],
    function (err) {
      if (err) {
        console.error('Failed to delete mail:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to delete mail' });
      }

      res.json({ success: true, message: 'Mail deleted' });
    }
  );
});

initDb();

app.listen(PORT, () => {
  console.log(`✓ Backend server running on http://localhost:${PORT}`);
  console.log(`✓ Admin password: ${ADMIN_PASSWORD}`);
  console.log('✓ SQLite database file:', DB_FILE);
  console.log(`✓ Bookings database file: ${BOOKINGS_FILE}`);
  console.log('✓ API endpoints ready:');
  console.log('  === NEWS ===');
  console.log('  GET  /api/news - Get all news');
  console.log('  GET  /api/news/:id - Get single news item');
  console.log('  POST /api/news - Create news (requires password)');
  console.log('  PUT  /api/news/:id - Update news (requires password)');
  console.log('  DELETE /api/news/:id - Delete news (requires password)');
  console.log('  === BOOKINGS ===');
  console.log('  POST /api/bookings - Create booking from online form');
  console.log('  GET  /api/bookings - Get all bookings');
  console.log('  GET  /api/bookings/:id - Get single booking');
  console.log('  PUT  /api/bookings/:id - Update booking status (requires password)');
  console.log('  DELETE /api/bookings/:id - Delete booking (requires password)');
  console.log('  === MAILS ===');
  console.log('  GET  /api/mails - Get all mails from bookings');
  console.log('  PUT  /api/mails/:id - Mark mail as read');
  console.log('  DELETE /api/mails/:id - Delete mail');
  console.log('  === ADMIN ===');
  console.log('  POST /api/admin/check-password - Verify admin password');
});
