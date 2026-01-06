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

// --- Redis & Kafka Setup ---
const redisClient = createClient({ url: REDIS_URL });
redisClient.on('error', (err) => console.error('Redis Client Error', err));
const kafka = new Kafka({ clientId: 'location-service', brokers: [KAFKA_BROKER] });
const producer = kafka.producer();

async function startInfra() {
  await redisClient.connect();
  await producer.connect();
  console.log('Infra Connected');
  startDriverSimulation();
}

// --- Simulation Logic ---
function moveTowards(current, target, step) {
  if (Math.abs(target - current) < step) return target;
  return current < target ? current + step : current - step;
}

function startDriverSimulation() {
  setInterval(async () => {
    // Movement Logic
    if (driverState.phase !== 'idle' && driverState.targetLat !== null) {
      const speed = 0.0002;
      driverState.lat = moveTowards(driverState.lat, driverState.targetLat, speed);
      driverState.lng = moveTowards(driverState.lng, driverState.targetLng, speed);

      // Check arrival
      if (driverState.lat === driverState.targetLat && driverState.lng === driverState.targetLng) {
        if (driverState.phase === 'pickup') {
          driverState.phase = 'trip';
          driverState.targetLat = driverState.finalDest.lat;
          driverState.targetLng = driverState.finalDest.lng;
        } else if (driverState.phase === 'trip') {
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
      await redisClient.set(`driver:${driverState.id}`, JSON.stringify(locationUpdate));
    } catch (err) {
      console.error('Kafka error:', err.message);
    }
  }, 1000);
}

// --- API Endpoint ---
app.get('/location/:driverId', async (req, res) => {
  const data = await redisClient.get(`driver:${req.params.driverId}`);
  if (data) res.json(JSON.parse(data));
  else res.status(404).json({ message: 'No location data' });
});

app.post('/mission', (req, res) => {
  const { pickup, destination } = req.body;

  const pickupLat = parseFloat(pickup.lat);
  const pickupLng = parseFloat(pickup.lng);

  driverState.lat = pickupLat + (Math.random() - 0.5) * 0.01;
  driverState.lng = pickupLng + (Math.random() - 0.5) * 0.01;
  driverState.targetLat = pickupLat;
  driverState.targetLng = pickupLng;
  driverState.finalDest = { lat: parseFloat(destination.lat), lng: parseFloat(destination.lng) };
  driverState.phase = 'pickup';

  driverState.mission = {
    pickup: { lat: pickupLat, lng: pickupLng },
    destination: { lat: driverState.finalDest.lat, lng: driverState.finalDest.lng }
  };

  res.json({ message: 'Simulation started' });
});

const PORT = 80;
app.listen(PORT, startInfra);