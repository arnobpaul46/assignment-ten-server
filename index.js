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


    // Collection 
    const bookCollection = db.collection("featured_books");
    const userCollection = db.collection("user");




    console.log("MongoDB Atlas Connected!");
    // home slider api
    app.get('/api/featured-books', async (req, res) => {
      const result = await bookCollection.find({ isFeatured: true }).toArray();
      res.send(result);
    });
    // admin api
    app.get('/api/admin/users', async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    // writer and reader role update
    app.patch('/api/admin/update-role/:id', async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { role: role } };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // adding new book
    app.post('/api/writer/add-book', async (req, res) => {
      const book = req.body; 
      const result = await bookCollection.insertOne(book);
      res.send(result);
    });
    // seeing the one writer's book
    app.get('/api/writer/my-books/:email', async (req, res) => {
      const email = req.params.email;
      const result = await bookCollection.find({ writerEmail: email }).toArray();
      res.send(result);
    });


    // readers api

    app.get('/api/reader/all-books', async (req, res) => {
      const result = await bookCollection.find().toArray();
      res.send(result);
    });
    // seeing the one reader's book
    app.get('/api/reader/book/:id', async (req, res) => {
      const id = req.params.id;
      const result = await bookCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });



  } catch (error) {
    console.error("Connection Error:", error);
  }
}
run().catch(console.dir);

app.listen(process.env.PORT, () => console.log(" Server running on port 5000"));