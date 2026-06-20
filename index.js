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

    // writer and reader api
    app.patch('/api/admin/update-role/:id', async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { role: role } };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

  } catch (error) {
    console.error("Connection Error:", error);
  }
}
run().catch(console.dir);

app.listen(process.env.PORT, () => console.log(" Server running on port 5000"));