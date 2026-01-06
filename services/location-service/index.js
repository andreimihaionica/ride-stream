const express = require('express');
const bodyParser = require('body-parser');
const { Kafka } = require('kafkajs');
const { createClient } = require('redis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- Configuration ---
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'kafka:29092';
const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const TOPIC = 'driver-locations';
// Internal Docker DNS name for the function
const INVOICE_FUNCTION_URL = 'http://invoice-function:8080';

// --- Global Simulation State ---
let driverState = {
  id: 1,
  lat: 46.770129,
  lng: 23.590299,
  targetLat: null,
  targetLng: null,
  phase: 'idle',
  finalDest: null,
  mission: null // { pickup: {lat,lng}, destination: {lat,lng} }
};

// --- Infra Setup ---
const redisClient = createClient({ url: REDIS_URL });
redisClient.on('error', (err) => console.error('Redis Client Error', err));

const kafka = new Kafka({ clientId: 'location-service', brokers: [KAFKA_BROKER] });
const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'location-group' });

async function startInfra() {
  await redisClient.connect();
  await producer.connect();

  // --- CONNECT & RUN CONSUMER ---
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const data = JSON.parse(message.value.toString());
      console.log(`Consumer: Updating Redis for Driver ${data.driverId}`);
      await redisClient.set(`driver:${data.driverId}`, JSON.stringify(data));
    },
  });

  console.log('Infra Connected (Producer + Consumer)');
  startDriverSimulation();
}

// --- FaaS Trigger Logic ---
async function triggerInvoice(missionData) {
  console.log('🏁 Ride Complete. Triggering Invoice Function...');

  const payload = {
    rideId: `ride-${Date.now()}`,
    userId: "passenger-1",
    email: missionData.email,
    distanceKm: 4.5,
    timestamp: new Date().toISOString()
  };

  try {
    const res = await fetch(INVOICE_FUNCTION_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });
    const invoice = await res.json();
    console.log('💰 INVOICE SENT:', invoice);
  } catch (err) {
    console.error('❌ Failed to trigger invoice:', err.message);
  }
}

function moveTowards(current, target, step) {
  if (Math.abs(target - current) < step) return target;
  return current < target ? current + step : current - step;
}

function startDriverSimulation() {
  setInterval(async () => {
    // Movement Logic
    if (driverState.phase !== 'idle' && driverState.targetLat !== null) {
      const speed = 0.0005;
      driverState.lat = moveTowards(driverState.lat, driverState.targetLat, speed);
      driverState.lng = moveTowards(driverState.lng, driverState.targetLng, speed);

      // Check arrival
      if (driverState.lat === driverState.targetLat && driverState.lng === driverState.targetLng) {
        if (driverState.phase === 'pickup') {
          driverState.phase = 'trip';
          driverState.targetLat = driverState.finalDest.lat;
          driverState.targetLng = driverState.finalDest.lng;
        } else if (driverState.phase === 'trip') {
          triggerInvoice(driverState.mission);

          driverState.phase = 'idle';
          driverState.targetLat = null;
          driverState.targetLng = null;
          driverState.mission = null;
        }
      }
    }

    // Broadcast Update
    const locationUpdate = {
      driverId: driverState.id,
      lat: driverState.lat,
      lng: driverState.lng,
      phase: driverState.phase,
      mission: driverState.mission,
      timestamp: Date.now()
    };

    try {
      await producer.send({
        topic: TOPIC,
        messages: [{ value: JSON.stringify(locationUpdate) }],
      });
    } catch (err) {
      console.error('Kafka error:', err.message);
    }
  }, 1000);
}

// --- Endpoints ---
app.get('/location/:driverId', async (req, res) => {
  const data = await redisClient.get(`driver:${req.params.driverId}`);
  if (data) res.json(JSON.parse(data));
  else res.status(404).json({ message: 'No location data' });
});

app.post('/mission', (req, res) => {
  const { pickup, destination, email } = req.body;

  driverState.lat = parseFloat(pickup.lat);
  driverState.lng = parseFloat(pickup.lng);
  driverState.targetLat = parseFloat(pickup.lat);
  driverState.targetLng = parseFloat(pickup.lng);

  driverState.finalDest = { lat: parseFloat(destination.lat), lng: parseFloat(destination.lng) };
  driverState.phase = 'pickup';

  driverState.mission = { pickup, destination, email };

  res.json({ message: 'Simulation started' });
});

const PORT = 80;
app.listen(PORT, startInfra);