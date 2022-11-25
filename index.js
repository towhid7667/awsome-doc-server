const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000
require("dotenv").config();   
const { MongoClient, ServerApiVersion } = require('mongodb');
const { query } = require('express');


const app = express();


app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_USER_PASSWORD}@cluster0.blm4ehx.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const verifyJWT = (req, res, next) =>{
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.send(401).send('unauthorized access')
    }

    const token = authHeader.split('')[1];
}


async function run() {
    try{
        const docDatabase = client.db("awsomeDoc").collection("appointmentOptions");
        const bookingDatabase = client.db("awsomeDoc").collection("bookings");
        const userDatabase = client.db("awsomeDoc").collection("users");

        app.get('/appointmentOptions', async(req, res)=>{
            const date = req.query.date;
            const query = {};
            const options = await docDatabase.find(query).toArray();
            const bookingQuery = { appointmentDate: date }
            const alreadyBooked = await bookingDatabase.find(bookingQuery).toArray()

            console.log(alreadyBooked);

            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlots = optionBooked.map(book => book.slot);
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
                option.slots = remainingSlots;
                // console.log(date,option.name, remainingSlots)
               
            })    
            

            res.send(options)
 
        })


        app.get('/v2/appointmentOptions', async(req, res)=>{
            const date = req.query.date;

            const options = await docDatabase.aggregate([
                {
                    $lookup: {
                        from: 'bookings',
                        localField: 'name',
                        foreignField: 'treatment',
                        pipeline:[{
                            $match:{
                                $expr : {
                                    $eq: ['$appointmentDate', date]
                                }
                            }

                        }],
                        as: 'booked'
                    }
                   
                },
                {
                    $project : {
                        name: 1,
                        slots: 1,
                        booked : {
                            $map : {
                                input: '$booked',
                                as: 'book',
                                in: '$$book.slot'
                            }
                        }
                    }


                },

                {
                    $project : {
                        name : 1,
                        slots : {
                            $setDifference : ['$slots', '$booked']
                        }
                    }
                }
            ]).toArray();

            res.send(options);
        })

        app.get('/bookings', verifyJWT, async(req, res) => {
            const email = req.query.email;
            const query = {email : email}
            const results = await bookingDatabase.find(query).toArray();
            res.send(results);

        })


        app.post('/bookings', async(req, res) => {
            const booking = req.body;

            const query = {
                appointmentDate : booking.appointmentDate,
                email : booking.email,
                treatment : booking.treatment

            }

            const alreadyBooked = await bookingDatabase.find(query).toArray();

            if(alreadyBooked.length){
                const message = `You Already Have a Booking ${booking.appointmentDate}`;
                return res.send({acknowledged : false, message})
            }

            const result = await bookingDatabase.insertOne(booking);
            res.send(result);
        })


        app.post('/users', async(req, res) => {
            const user = req.body;
            const results = await userDatabase.insertOne(user);
            res.send(results);

        })


        app.get('/jwt', async(req, res) => {
            const email = req.query.email;
            const query = {email : email};
            const user = await userDatabase.findOne(query);

            if(user){
                const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn : '1h'})
                return res.send({accessToken : token})
            }
            res.status(403).send({accessToken : ''})

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