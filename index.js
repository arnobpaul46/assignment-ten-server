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

    // DB Collections 
    const featuredCollection = db.collection("featured_books");
    const userCollection = db.collection("user");
    const allBooksCollection = db.collection("all_books");

    console.log("✅ Fable Server: MongoDB Connected & APIs Ready!");

    // ==========================================
    // 1. PUBLIC APIs
    // ==========================================
    app.get('/api/featured-books', async (req, res) => {
      const result = await featuredCollection.find({ isFeatured: true }).toArray();
      res.send(result);
    });

    // ==========================================
    // 2. ADMIN APIs
    // ==========================================

    // all users
    app.get('/api/admin/users', async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    // add new user form admin and block user
    app.post('/api/admin/add-user', async (req, res) => {
      try {
        const { name, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
          name, email, password: hashedPassword,
          role: role || 'reader',
          isBlocked: false, 
          emailVerified: true, image: "",
          createdAt: new Date()
        };
        const result = await userCollection.insertOne(newUser);
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error adding user" });
      }
    });

    // delete user
    app.delete('/api/admin/delete-user/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Invalid ID format" });
      }
    });

     // update user role
    app.patch('/api/admin/update-role/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { newRole } = req.body;
        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: newRole } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Update failed" });
      }
    });

    // ==========================================
    // 3. WRITER APIs
    // ==========================================

    // add new book
    app.post('/api/writer/add-book', async (req, res) => {
      const book = req.body;
      const result = await allBooksCollection.insertOne(book);
      res.send(result);
    });

    // see all books of writer
    app.get('/api/writer/my-books/:email', async (req, res) => {
      const email = req.params.email;
      const result = await allBooksCollection.find({ writerEmail: email }).toArray();
      res.send(result);
    });

    // delete book
  

    // ==========================================
    // 4. READER APIs
    // ==========================================

    // see all books of reader
    app.get('/api/reader/all-books', async (req, res) => {
      const result = await allBooksCollection.find({ status: "Published" }).toArray();
      res.send(result);
    });

    // see book of reader
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
  res.send('Fable Server is running smoothly...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(` Server running on port ${PORT}`));