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

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function run() {
  try {
    await client.connect();
    const db = client.db("fableDB");

    const featuredCollection = db.collection("featured_books");
    const userCollection = db.collection("user");
    const allBooksCollection = db.collection("all_books");
    const purchaseCollection = db.collection("purchases");
    const bookmarkCollection = db.collection("bookmarks");

    console.log("✅ Fable Server: MongoDB Connected & APIs Ready!");

    // ==========================================
    // 1. PUBLIC & HOME PAGE APIs
    // ==========================================
    
    // Featured Books (Latest 6)
    app.get('/api/featured-books', async (req, res) => {
      const result = await allBooksCollection.find({ status: "Published" }).sort({ createdAt: -1 }).limit(6).toArray();
      res.send(result);
    });

    // Top Writers (Based on sales count)
    app.get('/api/public/top-writers', async (req, res) => {
      const topWriters = await purchaseCollection.aggregate([
        { $group: { _id: "$writerEmail", salesCount: { $sum: 1 }, name: { $first: "$writerName" } } },
        { $sort: { salesCount: -1 } },
        { $limit: 3 }
      ]).toArray();
      res.send(topWriters);
    });

    // ==========================================
    // 2. BROWSE EBOOKS (Search, Filter, Sort, Pagination)
    // ==========================================
    app.get('/api/reader/all-books', async (req, res) => {
      try {
        const { search, genre, minPrice, maxPrice, sort, page = 1, limit = 8 } = req.query;
        
        let query = { status: "Published" };

        // Search by title or writer name
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { writerName: { $regex: search, $options: 'i' } }
          ];
        }

        
        if (genre && genre !== "All") {
          query.genre = genre;
        }

        
        if (minPrice || maxPrice) {
          query.price = {};
          if (minPrice) query.price.$gte = parseFloat(minPrice);
          if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        // Sorting logic
        let sortObj = {};
        if (sort === 'price-low') sortObj.price = 1;
        else if (sort === 'price-high') sortObj.price = -1;
        else sortObj.createdAt = -1; 

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const totalBooks = await allBooksCollection.countDocuments(query);
        const books = await allBooksCollection.find(query)
          .sort(sortObj)
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        res.send({
          books,
          totalBooks,
          totalPages: Math.ceil(totalBooks / limit),
          currentPage: parseInt(page)
        });
      } catch (error) {
        res.status(500).send({ message: "Error fetching books" });
      }
    });

    // ==========================================
    // 3. ADMIN APIs & ANALYTICS
    // ==========================================
    app.get('/api/admin/users', async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.get('/api/admin/stats', async (req, res) => {
      try {
        const totalUsers = await userCollection.countDocuments();
        const totalBooks = await allBooksCollection.countDocuments();
        const transactions = await purchaseCollection.find().toArray();
        const totalRevenue = transactions.reduce((acc, curr) => acc + curr.price, 0);

        // Dynamic Chart: Ebooks by Genre (Pie Chart Data)
        const genreStats = await allBooksCollection.aggregate([
          { $group: { _id: "$genre", value: { $sum: 1 } } },
          { $project: { name: "$_id", value: 1, _id: 0 } }
        ]).toArray();

        // Monthly Sales (Simple mockup based on data, in real app use aggregate $month)
        const chartData = [
          { name: 'Jan', sales: 4000 }, { name: 'Feb', sales: 3000 },
          { name: 'Mar', sales: 5000 }, { name: 'Apr', sales: 4500 },
          { name: 'May', sales: 6000 }, { name: 'Jun', sales: 7000 },
        ];

        res.send({ totalUsers, totalBooks, totalRevenue, chartData, genreStats });
      } catch (error) {
        res.status(500).send({ message: "Stats error" });
      }
    });

    // Admin: Roles, Block, Delete, Transactions 
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
      } catch (error) { res.status(500).send({ message: "Error adding user" }); }
    });

    app.delete('/api/admin/delete-user/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) { res.status(500).send({ message: "Invalid ID" }); }
    });

    app.patch('/api/admin/update-role/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { newRole } = req.body;
        const result = await userCollection.updateOne({ _id: new ObjectId(id) }, { $set: { role: newRole } });
        res.send(result);
      } catch (error) { res.status(500).send({ message: "Update failed" }); }
    });

    app.patch('/api/admin/toggle-block/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { isBlocked } = req.body;
        const result = await userCollection.updateOne({ _id: new ObjectId(id) }, { $set: { isBlocked: isBlocked } });
        res.send(result);
      } catch (error) { res.status(500).send({ message: "Blocking failed" }); }
    });

    app.get('/api/admin/all-books', async (req, res) => {
      const books = await allBooksCollection.find().toArray();
      res.send(books);
    });

    app.get('/api/admin/transactions', async (req, res) => {
      const result = await purchaseCollection.find().toArray();
      res.send(result);
    });

    // ==========================================
    // 4. WRITER APIs 
    // ==========================================
    app.post('/api/writer/add-book', async (req, res) => {
      const book = { ...req.body, createdAt: new Date() };
      const result = await allBooksCollection.insertOne(book);
      res.send(result);
    });

    app.get('/api/writer/my-books/:email', async (req, res) => {
      const result = await allBooksCollection.find({ writerEmail: req.params.email }).toArray();
      res.send(result);
    });

    app.delete('/api/writer/delete-book/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await allBooksCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) { res.status(500).send({ message: "Delete failed" }); }
    });

    app.patch('/api/writer/update-status/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        const result = await allBooksCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: status } });
        res.send(result);
      } catch (error) { res.status(500).send({ message: "Status update failed" }); }
    });

    app.patch('/api/writer/update-book/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updateData = req.body;
        delete updateData._id;
        const result = await allBooksCollection.updateOne({ _id: new ObjectId(id) }, { $set: updateData });
        res.send(result);
      } catch (error) { res.status(500).send({ message: "Book update failed" }); }
    });

    app.get('/api/writer/sales/:email', async (req, res) => {
      const result = await purchaseCollection.find({ writerEmail: req.params.email }).toArray();
      res.send(result);
    });

    // ==========================================
    // 5. READER & STRIPE APIs 
    // ==========================================
    app.patch('/api/user/update-profile/:email', async (req, res) => {
      try {
        const { name, image } = req.body;
        const result = await userCollection.updateOne({ email: req.params.email }, { $set: { name, image } });
        res.send(result);
      } catch (error) { res.status(500).send({ message: "Profile update failed" }); }
    });

    app.get('/api/reader/book/:id', async (req, res) => {
      try {
        const result = await allBooksCollection.findOne({ _id: new ObjectId(req.params.id) });
        res.send(result);
      } catch (error) { res.status(500).send({ message: "Book not found" }); }
    });

    app.post('/api/reader/purchase', async (req, res) => {
      const result = await purchaseCollection.insertOne(req.body);
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
      const result = await purchaseCollection.findOne({ userEmail: email, bookId: bookId });
      res.send({ isPurchased: !!result });
    });

    app.delete('/api/reader/delete-purchase/:id', async (req, res) => {
      try {
        const result = await purchaseCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.send(result);
      } catch (error) { res.status(500).send({ message: "Failed to remove" }); }
    });

    // STRIPE
    app.post('/api/create-checkout-session', async (req, res) => {
      try {
        const { book, userEmail, userName } = req.body;
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          customer_email: userEmail,
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: { name: book.title, images: [book.image], description: `By ${book.writerName}` },
              unit_amount: Math.round(book.price * 100),
            },
            quantity: 1,
          }],
          success_url: `${process.env.CLIENT_URL}/dashboard/reader?session_id={CHECKOUT_SESSION_ID}&purchase=success`,
          cancel_url: `${process.env.CLIENT_URL}/book/${book._id}`,
          metadata: { bookId: book._id.toString(), title: book.title, price: book.price.toString(), writerEmail: book.writerEmail, writerName: book.writerName }
        });
        res.send({ url: session.url });
      } catch (error) { res.status(500).send({ message: error.message }); }
    });

    app.post('/api/reader/verify-purchase', async (req, res) => {
      try {
        const { sessionId } = req.body;
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === 'paid') {
          const { bookId, title, price, image, writerEmail, writerName } = session.metadata;
          const userEmail = session.customer_email;
          const existingPurchase = await purchaseCollection.findOne({ stripeSessionId: sessionId });
          if (!existingPurchase) {
            await purchaseCollection.insertOne({ bookId, title, price: parseFloat(price), image, writerEmail, writerName, userEmail, date: new Date(), stripeSessionId: sessionId });
            return res.send({ success: true, message: "Purchase saved" });
          }
          return res.send({ success: true, message: "Already recorded" });
        }
        res.status(400).send({ message: "Payment not verified" });
      } catch (error) { res.status(500).send({ message: error.message }); }
    });

  } catch (error) { console.error(" Connection Error:", error); }
}

run().catch(console.dir);
app.get('/', (req, res) => { res.send('Fable Server is running smoothly...'); });
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(` Server running on port ${PORT}`));