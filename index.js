const express = require('express')
const cors = require('cors')
const port = process.env.PORT || 5000
require("dotenv").config();   
const { MongoClient, ServerApiVersion } = require('mongodb');


const app = express();


app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_USER_PASSWORD}@cluster0.blm4ehx.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try{
        const docDatabase = client.db("awsomeDoc").collection("appointmentOptions");

        app.get('/appointmentOptions', async(req, res)=>{
            const query = {};
            const options = await docDatabase.find(query).toArray();
            res.send(options)
 
        })

    }
    finally{

    }
}
run().catch(err => console.error(err))
app.get('/', async(req, res) =>{
    res.send('server is booming')
})

app.listen(port, () => {
    console.log(`Server running on ${port}`)
})