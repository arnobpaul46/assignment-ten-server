const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// ==========================================
// JWT Middleware 
// ==========================================
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized access' });
    }
    req.decoded = decoded;
    next();
  });
};

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
    // 0. JWT Token Creation API
    // ==========================================
    app.post('/api/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.send({ token });
    });

    // ==========================================
    // 1. PUBLIC & HOME PAGE APIs
    // ==========================================
    app.get('/api/featured-books', async (req, res) => {
      const result = await allBooksCollection.find({ status: "Published" }).sort({ createdAt: -1 }).limit(6).toArray();
      res.send(result);
    });

    app.get('/api/public/top-writers', async (req, res) => {
      try {
        const topWriters = await purchaseCollection.aggregate([
          {
            $group: {
              _id: "$writerEmail",
              salesCount: { $sum: 1 },
              name: { $first: "$writerName" }
            }
          },
          {
            $lookup: {
              from: "user",
              localField: "_id",
              foreignField: "email",
              as: "writerDetails"
            }
          },
          {
            $project: {
              name: 1,
              salesCount: 1,

              image: { $arrayElemAt: ["$writerDetails.image", 0] }
            }
          },
          { $sort: { salesCount: -1 } },
          { $limit: 4 }
        ]).toArray();
        res.send(topWriters);
      } catch (error) {
        res.status(500).send({ message: "Error fetching top writers" });
      }
    });

    // ==========================================
    // 2. BROWSE EBOOKS (Search, Filter, Pagination)
    // ==========================================
    app.get('/api/reader/all-books', async (req, res) => {
      try {
        const { search, genre, sort, page = 1, limit = 8, availability } = req.query;
        let query = { status: "Published" };

        if (search) {
          query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { writerName: { $regex: search, $options: 'i' } }
          ];
        }
        if (genre && genre !== "All") query.genre = genre;

        let sortObj = {};
        if (sort === 'price-low') sortObj.price = 1;
        else if (sort === 'price-high') sortObj.price = -1;
        else sortObj.createdAt = -1;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const totalBooks = await allBooksCollection.countDocuments(query);
        const books = await allBooksCollection.find(query).sort(sortObj).skip(skip).limit(parseInt(limit)).toArray();

        res.send({ books, totalBooks, totalPages: Math.ceil(totalBooks / limit), currentPage: parseInt(page) });
      } catch (error) { res.status(500).send({ message: "Error" }); }
    });

    // ==========================================
    // 3. ADMIN ANALYTICS (FIXED BUGS INSIDE YOUR CODE)
    // ==========================================
    app.get('/api/admin/stats', verifyToken, async (req, res) => {
      try {
        const totalUsers = await userCollection.countDocuments();
        const totalBooks = await allBooksCollection.countDocuments();
        const transactions = await purchaseCollection.find().toArray();
        const totalRevenue = transactions.reduce((acc, curr) => acc + (parseFloat(curr.price) || 0), 0);


        const rawChartData = await purchaseCollection.aggregate([
          {
            $group: {
              _id: { $month: { $toDate: "$date" } },
              sales: { $sum: "$price" }
            }
          },
          { $sort: { "_id": 1 } }
        ]).toArray();


        const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const chartData = rawChartData.map(item => ({
          name: monthNames[item._id] || 'Unknown',
          sales: item.sales
        }));

        const genreStats = await allBooksCollection.aggregate([
          { $group: { _id: "$genre", value: { $sum: 1 } } },
          { $project: { name: "$_id", value: 1, _id: 0 } }
        ]).toArray();

        const topWriters = await purchaseCollection.aggregate([
          { $group: { _id: "$writerEmail", salesCount: { $sum: 1 }, name: { $first: "$writerName" } } },
          { $sort: { salesCount: -1 } },
          { $limit: 3 }
        ]).toArray();

        res.send({
          totalUsers, totalBooks, totalRevenue,
          chartData: chartData.length > 0 ? chartData : [{ name: 'No Data', sales: 0 }],
          genreStats, topWriters
        });

      } catch (error) {
        console.error("Stats API Error:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ==========================================
    // 4. WRITER APIs 
    // ==========================================
    app.post('/api/writer/add-book', verifyToken, async (req, res) => {
      const book = { ...req.body, createdAt: new Date() };
      const result = await allBooksCollection.insertOne(book);
      res.send(result);
    });

    app.get('/api/writer/my-books/:email', verifyToken, async (req, res) => {
      const result = await allBooksCollection.find({ writerEmail: req.params.email }).toArray();
      res.send(result);
    });

    app.delete('/api/writer/delete-book/:id', verifyToken, async (req, res) => {
      const result = await allBooksCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    app.patch('/api/writer/update-status/:id', verifyToken, async (req, res) => {
      const { status } = req.body;
      const result = await allBooksCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { status: status } });
      res.send(result);
    });

    app.patch('/api/writer/update-book/:id', verifyToken, async (req, res) => {
      const updateData = req.body;
      delete updateData._id;
      const result = await allBooksCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: updateData });
      res.send(result);
    });

    app.get('/api/writer/sales/:email', verifyToken, async (req, res) => {
      const result = await purchaseCollection.find({ writerEmail: req.params.email }).toArray();
      res.send(result);
    });

    // writer verifaction
    app.post('/api/create-verification-session', async (req, res) => {
      try {
        const { userEmail } = req.body;
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          customer_email: userEmail,
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: { name: "Author Verification Fee", description: "One-time fee to unlock publishing rights on Fable" },
              unit_amount: 2000,
            },
            quantity: 1,
          }],

          success_url: `${process.env.CLIENT_URL}/dashboard/writer?tab=add-ebook&verify=success`,
          cancel_url: `${process.env.CLIENT_URL}/dashboard/writer?tab=add-ebook`,
        });
        res.send({ url: session.url });
      } catch (error) { res.status(500).send({ message: error.message }); }
    });

    app.patch('/api/writer/verify-account/:email', verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        await userCollection.updateOne(
          { email: email },
          { $set: { isVerified: true } }
        );
        const verificationTransaction = {
          userEmail: email,
          title: "Author Verification Fee",
          price: 20.00,
          date: new Date(),
          type: "verification"
        };
        await purchaseCollection.insertOne(verificationTransaction);

        res.send({ success: true });
      } catch (error) {
        res.status(500).send({ message: "Update failed" });
      }
    });

    // ==========================================
    // 5. READER & STRIPE APIs 
    // ==========================================
    app.patch('/api/user/update-profile/:email', verifyToken, async (req, res) => {
      const { name, image } = req.body;
      const result = await userCollection.updateOne({ email: req.params.email }, { $set: { name, image } });
      res.send(result);
    });


    app.get('/api/reader/book/:id', async (req, res) => {
      try {
        const result = await allBooksCollection.findOne({ _id: new ObjectId(req.params.id) });
        res.send(result);
      } catch (err) { res.status(404).send({ message: "Not found" }); }
    });

    app.post('/api/reader/purchase', verifyToken, async (req, res) => {
      const result = await purchaseCollection.insertOne(req.body);
      res.send(result);
    });

    app.post('/api/reader/toggle-bookmark', verifyToken, async (req, res) => {
      const { bookId, userEmail, title, image, author } = req.body;
      const exists = await bookmarkCollection.findOne({ bookId, userEmail });
      if (exists) {
        await bookmarkCollection.deleteOne({ bookId, userEmail });
        return res.send({ message: "Removed", status: false });
      }
      const result = await bookmarkCollection.insertOne({ bookId, userEmail, title, image, author });
      res.send({ message: "Added", status: true });
    });

    app.get('/api/reader/my-library/:email', verifyToken, async (req, res) => {
      const result = await purchaseCollection.find({ userEmail: req.params.email }).toArray();
      res.send(result);
    });

    app.get('/api/reader/my-bookmarks/:email', verifyToken, async (req, res) => {
      const result = await bookmarkCollection.find({ userEmail: req.params.email }).toArray();
      res.send(result);
    });

    app.get('/api/reader/check-purchase', async (req, res) => {
      const { email, bookId } = req.query;
      const result = await purchaseCollection.findOne({ userEmail: email, bookId: bookId });
      res.send({ isPurchased: !!result });
    });

    app.delete('/api/reader/delete-purchase/:id', verifyToken, async (req, res) => {
      const result = await purchaseCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });

    // STRIPE
    app.post('/api/create-checkout-session', verifyToken, async (req, res) => {
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
          metadata: { bookId: book._id.toString(), title: book.title, price: book.price.toString(), image: book.image, writerEmail: book.writerEmail, writerName: book.writerName }
        });
        res.send({ url: session.url });
      } catch (error) { res.status(500).send({ message: error.message }); }
    });

    app.post('/api/reader/verify-purchase', verifyToken, async (req, res) => {
      try {
        const { sessionId } = req.body;
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status === 'paid') {
          const { bookId, title, price, image, writerEmail, writerName } = session.metadata;
          const userEmail = session.customer_email;
          const existingPurchase = await purchaseCollection.findOne({ stripeSessionId: sessionId });
          if (!existingPurchase) {
            await purchaseCollection.insertOne({ bookId, title, price: parseFloat(price), image: image, writerEmail, writerName, userEmail, date: new Date(), stripeSessionId: sessionId });
            return res.send({ success: true, message: "Purchase saved" });
          }
          return res.send({ success: true, message: "Already recorded" });
        }
        res.status(400).send({ message: "Payment not verified" });
      } catch (error) { res.status(500).send({ message: error.message }); }
    });

    // --- Admin APIs (Existing) ---
    app.get('/api/admin/users', verifyToken, async (req, res) => res.send(await userCollection.find().toArray()));

    app.get('/api/admin/transactions', verifyToken, async (req, res) => res.send(await purchaseCollection.find().toArray()));

    app.get('/api/admin/all-books', verifyToken, async (req, res) => res.send(await allBooksCollection.find().toArray()));

    app.patch('/api/admin/update-role/:id', verifyToken, async (req, res) => res.send(await userCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { role: req.body.newRole } })));

    app.patch('/api/admin/toggle-block/:id', verifyToken, async (req, res) => res.send(await userCollection.updateOne({ _id: new ObjectId(req.params.id) }, { $set: { isBlocked: req.body.isBlocked } })));

    app.post('/api/admin/add-user', verifyToken, async (req, res) => {
      const { name, email, password, role } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      res.send(await userCollection.insertOne({ name, email, password: hashedPassword, role: role || 'reader', isBlocked: false, emailVerified: true, createdAt: new Date() }));
    });

  } catch (error) { console.error(" Connection Error:", error); }
}

run().catch(console.dir);
app.get('/', (req, res) => { res.send('Fable Server is running smoothly...'); });
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));