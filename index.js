const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();


app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

async function run() {
  try {
    await client.connect();
    const db = client.db("fableDB");

    // db collections
    const featuredCollection = db.collection("featured_books");
    const userCollection = db.collection("user");
    const allBooksCollection = db.collection("all_books");

    console.log("✅ MongoDB Atlas Connected & APIs Ready!");

    // --- PUBLIC API ---
    app.get('/api/featured-books', async (req, res) => {
      const result = await featuredCollection.find({ isFeatured: true }).toArray();
      res.send(result);
    });

    // --- ADMIN APIs ---

    // seeing all users
    app.get('/api/admin/users', async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });
    // add new user 
    app.post('/api/admin/add-user', async (req, res) => {
      try {
        const { name, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
          name,
          email,
          password: hashedPassword,
          role: role || 'reader',
          emailVerified: true,
          image: "",
          createdAt: new Date()
        };

        const result = await userCollection.insertOne(newUser);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error adding user" });
      }
    });


    // delete user (Fixed ObjectId)
    app.delete('/api/admin/delete-user/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Invalid ID format" });
      }
    });

    // update user role (Fixed ObjectId)
    app.patch('/api/admin/update-role/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { newRole } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { role: newRole } };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Update failed" });
      }
    });

    // seeing all books (for admin panel)
    app.get('/api/admin/all-books', async (req, res) => {
      const books = await allBooksCollection.find().toArray();
      res.send(books);
    });

    // --- WRITER APIs ---

    // add new book
    app.post('/api/writer/add-book', async (req, res) => {
      const book = req.body;
      const result = await allBooksCollection.insertOne(book);
      res.send(result);
    });
    // --- Writer APIs ---
    // writers own books seeing
    app.get('/api/writer/my-books/:email', async (req, res) => {
      const email = req.params.email;
      const result = await allBooksCollection.find({ writerEmail: email }).toArray();
      res.send(result);
    });
    // delete book (Fixed ObjectId)
    app.delete('/api/writer/delete-book/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await allBooksCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Invalid ID format" });
      }
    });

    // --- READER APIs ---

    // all published books
    app.get('/api/reader/all-books', async (req, res) => {
      const result = await allBooksCollection.find().toArray();
      res.send(result);
    });

    // single book
    app.get('/api/reader/book/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await allBooksCollection.findOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Book not found" });
      }
    });

  } catch (error) {
    console.error(" Connection Error:", error);
  }
}

run().catch(console.dir);

// Root Route
app.get('/', (req, res) => {
  res.send('Fable Server is running...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(` Server running on port ${PORT}`));