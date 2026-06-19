const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
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
    const bookCollection = db.collection("featured_books");

    console.log("MongoDB Atlas Connected!");

    
    app.get('/api/featured-books', async (req, res) => {
      const result = await bookCollection.find({ isFeatured: true }).toArray();
      res.send(result);
    });

    
    app.post('/api/add-book', async (req, res) => {
      const book = req.body;
      const result = await bookCollection.insertOne(book);
      res.send(result);
    });

  } finally {}
}
run().catch(console.dir);

app.listen(process.env.PORT, () => console.log("🚀 Server running on port 5000"));