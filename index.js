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
    const purchaseCollection = db.collection("purchases");
    const bookmarkCollection = db.collection("bookmarks");

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
    app.get('/api/admin/users', async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

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

    app.delete('/api/admin/delete-user/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Invalid ID" });
      }
    });

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

    app.patch('/api/admin/toggle-block/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { isBlocked } = req.body;
        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { isBlocked: isBlocked } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Blocking failed" });
      }
    });

    app.get('/api/admin/all-books', async (req, res) => {
      const books = await allBooksCollection.find().toArray();
      res.send(books);
    });


    app.get('/api/admin/transactions', async (req, res) => {
      const result = await db.collection("purchases").find().toArray();
      res.send(result);
    });

    app.get('/api/admin/stats', async (req, res) => {
      try {
        const totalUsers = await userCollection.countDocuments();
        const totalBooks = await allBooksCollection.countDocuments();
        const transactions = await purchaseCollection.find().toArray();
        const totalRevenue = transactions.reduce((acc, curr) => acc + curr.price, 0);

    
        const chartData = [
          { name: 'Jan', sales: 4000 }, { name: 'Feb', sales: 3000 },
          { name: 'Mar', sales: 5000 }, { name: 'Apr', sales: 4500 },
          { name: 'May', sales: 6000 }, { name: 'Jun', sales: 7000 },
        ];

        res.send({ totalUsers, totalBooks, totalRevenue, chartData });
      } catch (error) {
        res.status(500).send({ message: "Stats error" });
      }
    });

    // ==========================================
    // 3. WRITER APIs
    // ==========================================
    app.post('/api/writer/add-book', async (req, res) => {
      const book = req.body;
      const result = await allBooksCollection.insertOne(book);
      res.send(result);
    });

    app.get('/api/writer/my-books/:email', async (req, res) => {
      const email = req.params.email;
      const result = await allBooksCollection.find({ writerEmail: email }).toArray();
      res.send(result);
    });

    app.delete('/api/writer/delete-book/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await allBooksCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Delete failed" });
      }
    });

    app.patch('/api/writer/update-status/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        const result = await allBooksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: status } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Status update failed" });
      }
    });

    app.patch('/api/writer/update-book/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updateData = req.body;
        delete updateData._id;
        const result = await allBooksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Book update failed" });
      }
    });

    app.get('/api/writer/sales/:email', async (req, res) => {
      const result = await db.collection("purchases").find({ writerEmail: req.params.email }).toArray();
      res.send(result);
    });
    // ==========================================
    // 4. USER & READER APIs
    // ==========================================
    app.patch('/api/user/update-profile/:email', async (req, res) => {
      try {
        const email = req.params.email;
        const { name, image } = req.body;
        const result = await userCollection.updateOne(
          { email: email },
          { $set: { name, image } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Profile update failed" });
      }
    });

    app.get('/api/reader/all-books', async (req, res) => {
      const result = await allBooksCollection.find({ status: "Published" }).toArray();
      res.send(result);
    });

    app.get('/api/reader/book/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await allBooksCollection.findOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Book not found" });
      }
    });

    app.post('/api/reader/purchase', async (req, res) => {
      const purchaseData = req.body;
      const result = await purchaseCollection.insertOne(purchaseData);
      res.send(result);
    });

    app.post('/api/reader/toggle-bookmark', async (req, res) => {
      const { bookId, userEmail, title, image, author } = req.body;
      const exists = await bookmarkCollection.findOne({ bookId, userEmail });
      if (exists) {
        await bookmarkCollection.deleteOne({ bookId, userEmail });
        return res.send({ message: "Removed", status: false });
      }
      const result = await bookmarkCollection.insertOne({ bookId, userEmail, title, image, author });
      res.send({ message: "Added", status: true });
    });

    app.get('/api/reader/my-library/:email', async (req, res) => {
      const result = await purchaseCollection.find({ userEmail: req.params.email }).toArray();
      res.send(result);
    });

    app.get('/api/reader/my-bookmarks/:email', async (req, res) => {
      const result = await bookmarkCollection.find({ userEmail: req.params.email }).toArray();
      res.send(result);
    });


    app.get('/api/reader/check-purchase', async (req, res) => {
      const { email, bookId } = req.query;
      const result = await db.collection("purchases").findOne({ userEmail: email, bookId: bookId });
      res.send({ isPurchased: !!result });
    });


    app.delete('/api/reader/delete-purchase/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await db.collection("purchases").deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Failed to remove from library" });
      }
    });

  } catch (error) {
    console.error(" Connection Error:", error);
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Fable Server is running smoothly...');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(` Server running on port ${PORT}`));