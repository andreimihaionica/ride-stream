import express from 'express';
import { Kafka } from 'kafkajs';
import { createClient } from 'redis';
import cors from 'cors';

const app = express();
app.use(cors());

// --- Configuration ---
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'kafka:9092';
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const TOPIC = 'driver-locations';

// --- Redis Setup ---
const redisClient = createClient({ url: REDIS_URL });
redisClient.on('error', (err) => console.error('Redis Client Error', err));

async function startRedis() {
  await redisClient.connect();
  console.log('Connected to Redis');
}

// --- Kafka Setup ---
const kafka = new Kafka({ clientId: 'location-service', brokers: [KAFKA_BROKER] });
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'location-group' });

async function startKafka() {
  try {
    await producer.connect();
    console.log('Kafka Producer connected');

    await consumer.connect();
    await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
    console.log('Kafka Consumer connected');

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const data = JSON.parse(message.value.toString());
        const driverId = data.driverId;

        console.log(`Kafka: Received location for Driver ${driverId}`);

        // SAVE TO REDIS (Key: "driver:123", Value: JSON String)
        await redisClient.set(`driver:${driverId}`, JSON.stringify(data));
      },
    });

    startDriverSimulation();

  } catch (err) {
    console.error('Error connecting to Kafka, retrying in 5s...', err.message);
    setTimeout(startKafka, 5000);
  }
}

// --- Simulation Logic (The Fake Driver) ---
function startDriverSimulation() {
  let lat = 40.7128;
  let lng = -74.0060;
  const driverId = 1;

  setInterval(async () => {
    lat += 0.0001;
    lng += 0.0001;

    const locationUpdate = { driverId, lat, lng, timestamp: Date.now() };

    try {
      await producer.send({
        topic: TOPIC,
        messages: [{ value: JSON.stringify(locationUpdate) }],
      });
      console.log(`Sim: Sent update for Driver ${driverId}`);
    } catch (err) {
      console.error('Error sending Kafka message:', err.message);
    }
  }, 3000); // Send every 3 seconds
}

// --- API Endpoint ---
app.get('/location/:driverId', async (req, res) => {
  const driverId = req.params.driverId;
  const data = await redisClient.get(`driver:${driverId}`);

  if (data) {
    res.json(JSON.parse(data));
  } else {
    res.status(404).json({ message: 'Driver location not found' });
  }
});

app.get('/', (req, res) => res.send('Location Service Running'));

// --- Startup ---
const PORT = 80;
app.listen(PORT, async () => {
  console.log(`Location Service running on port ${PORT}`);
  await startRedis();
  await startKafka();
});