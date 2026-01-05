import express from 'express';
import { json } from 'body-parser';
import { connect } from 'amqplib';
import { Pool } from 'pg';
import cors from 'cors';

const app = express();
app.use(json());
app.use(cors());

const pool = new Pool({
  user: process.env.POSTGRES_USER || 'user',
  host: process.env.POSTGRES_HOST || 'postgres',
  database: process.env.POSTGRES_DB || 'ridestream_db',
  password: process.env.POSTGRES_PASSWORD || 'password',
  port: 5432,
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rides (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        pickup VARCHAR(255),
        destination VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Database connected & Table "rides" created/verified.');
  } catch (err) {
    console.error('Database connection failed, retrying in 5s...', err.message);
    setTimeout(initDB, 5000);
  }
}
// Start the DB init immediately
initDB();

// --- RabbitMQ Setup ---
const RABBIT_URL = 'amqp://rabbitmq';
const QUEUE_NAME = 'ride_requests';
let channel;

async function connectRabbit() {
  try {
    const connection = await connect(RABBIT_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME);
    console.log('Connected to RabbitMQ');

    consumeRides();
  } catch (err) {
    console.error('RabbitMQ connection failed, retrying in 5s...', err.message);
    setTimeout(connectRabbit, 5000);
  }
}
connectRabbit();

// --- The Consumer (Worker) ---
function consumeRides() {
  channel.consume(QUEUE_NAME, async (msg) => {
    if (msg !== null) {
      const data = JSON.parse(msg.content.toString());
      console.log('Worker: Processing ride request:', data);

      try {
        await pool.query(
          'INSERT INTO rides (user_id, pickup, destination, status) VALUES ($1, $2, $3, $4)',
          [data.userId, data.pickup, data.destination, 'driver_assigned']
        );
        console.log('Worker: Ride saved to DB.');
        channel.ack(msg);
      } catch (err) {
        console.error('Error saving ride:', err.message);
      }
    }
  });
}

// --- The API (Producer) ---
app.post('/request', (req, res) => {
  const { userId, pickup, destination } = req.body;

  if (!channel) return res.status(500).json({ message: 'Queue not ready' });

  const message = { userId, pickup, destination };
  channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(message)));

  console.log('API: Sent to queue:', message);
  res.status(202).json({ message: 'Ride request received, searching for driver...' });
});

app.get('/', (req, res) => {
  res.send('Ride Service is running');
});

const PORT = 80;
app.listen(PORT, () => {
  console.log(`Ride Service running on port ${PORT}`);
});