const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000
require("dotenv").config();   
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { query } = require('express');
const stripe = require("stripe")(process.env.STRIPE_SK);


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

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
        if(err){
            return res.status(403).send({message: 'forbidden access'})
        }

        req.decoded = decoded;
        next();
    })
}


async function run() {
    try{
        const docDatabase = client.db("awsomeDoc").collection("appointmentOptions");
        const bookingDatabase = client.db("awsomeDoc").collection("bookings");
        const userDatabase = client.db("awsomeDoc").collection("users");
        const DoctorsDatabase = client.db("awsomeDoc").collection("AwsomeDoctors");
        const paymentsDatabase = client.db("awsomeDoc").collection("AwsomeDoctors");


        const verifyAdmin = async (req, res, next) =>{
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await userDatabase.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }


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
                        price:1,
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
                        price:1,
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
            const decodedEmail = req.decoded.email
            console.log(decodedEmail)

                if(email !== decodedEmail){
                    return res.status(403).send({message: 'forbidden Accesss'})
                }

            const query = {email : email}
            const results = await bookingDatabase.find(query).toArray();
            res.send(results);

        })


        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingDatabase.findOne(query);
            res.send(booking);
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
        app.get('/users', async(req, res) => {
            const query = {};
            const results = await userDatabase.find(query).toArray();
            res.send(results);

        })

        app.get('/users/admin/:email', async(req, res) => {
            const email = req.params.email;
            const query = {email};
            const user = await userDatabase.findOne(query)
            res.send({isAdmin: user?.role === 'admin'})

        })


        app.get('/jwt', async(req, res) => {
            const email = req.query.email;
            const query = {email : email};
            const user = await userDatabase.findOne(query);

            if(user){
                const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn : '3h'})
                return res.send({accessToken : token})
            }
            res.status(403).send({accessToken : ''})

        })

        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async(req, res) => {
            const id = req.params.id;
            const filter = {_id: ObjectId(id)};
            const options = {upsert : true};

            const updateDoc = {
                $set : {
                    role : 'admin'
                }
            }

            const result = await userDatabase.updateOne(filter, updateDoc, options);
            res.send(result)
        })

        app.get('/appoitmentSpeciality', async(req, res) =>{
            const query ={};
            const result = await docDatabase.find(query).project({name : 1}).toArray()
            res.send(result);
        })


        // temporary to update price field on appointment options
        // app.get('/addPrice', async (req, res) => {
        //     const filter = {}
        //     const options = { upsert: true }
        //     const updatedDoc = {
        //         $set: {
        //             price: 101
        //         }
        //     }
        //     const result = await docDatabase.updateMany(filter, updatedDoc, options);
        //     res.send(result);
        // })


        app.post('/awsomeDoctors',verifyJWT, verifyAdmin, async(req, res) => {
            const doctor = req.body;
            const result = await DoctorsDatabase.insertOne(doctor);
            res.send(result)
        })
        app.get('/awsomeDoctors',verifyJWT, verifyAdmin, async(req, res) => {
            const query = {};
            const result = await DoctorsDatabase.find(query).toArray();
            res.send(result)
        })

        app.delete('/awsomeDoctors/:id',verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) };
            const result = await DoctorsDatabase.deleteOne(filter);
            res.send(result);
        })

        app.post('/create-payment-intent', async (req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": [
                    "card"
                ]
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });


        app.post('/payments', async (req, res) =>{
            const payment = req.body;
            const result = await paymentsDatabase.insertOne(payment);
            const id = payment.bookingId
            const filter = {_id: ObjectId(id)}
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const updatedResult = await bookingDatabase.updateOne(filter, updatedDoc)
            res.send(result);
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