# Tutorial: Building Real-Time Location Tracking with Apache Kafka & SSE

**Topic:** Event Streaming for Microservices & Server-Side Notifications


## 1. Introduction

In modern distributed systems, especially ride-sharing apps like Uber or Bolt, users expect **real-time feedback**. When a passenger requests a ride, they need to see the driver's car moving on the map smoothly, without refreshing the page.

Traditional **Polling** (asking the server "Where are you?" every second) is inefficient and hard to scale. It floods the server with HTTP requests and introduces latency.

**The Solution:** An **Event Streaming Architecture**.
Build a scalable real-time location feature using:
1.  **Apache Kafka:** To stream high-frequency GPS coordinates between microservices.
2.  **Redis:** To cache the latest state for fast retrieval.
3.  **Server-Sent Events (SSE):** To push updates instantly from the server to the browser.

## 2. Architecture Design

My system, **RideStream**, implements a "Location Service" that handles the simulation of driver movement. The data flow acts as a pipeline:

1.  **Ingestion (Producer):** A simulation loop generates GPS coordinates (Lat/Lng) and publishes them to a Kafka topic (`driver-locations`).
2.  **Processing (Consumer):** The service consumes these events. It does two things:
    * **Persistence:** Updates the "Latest Known Location" in **Redis** (In-Memory Cache).
    * **Broadcasting:** Pushes the data to connected Frontend clients via **SSE**.
3.  **Delivery (Client):** The Driver/Passenger web apps receive the stream and update the Leaflet.js map.

**Why this separation?**
By using Kafka, we decouple the *Generation* of data from the *Consumption*. If we had 10,000 drivers, the producer could just dump data into Kafka, and we could scale up multiple Consumer instances to handle the load without blocking the system.

## 3. Infrastructure Setup (Docker)

First, we need the infrastructure. We use **Docker Compose** to spin up Zookeeper (required for Kafka), Kafka itself, and Redis.

**File:** `docker-compose.yml`
```yaml
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.4.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:7.4.0
    depends_on:
      - zookeeper
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
```

### 4. Implementation: The Location Service
The core logic resides in a Node.js microservice (`location-service`). We use `kafkajs` for streaming and `redis` for caching.

### A. The Producer (Generating Data)
Instead of a real GPS, we simulate a driver moving towards a destination. We calculate the new coordinates and **Publish** them to Kafka.

**Snippet from:** `services/location-service/index.js`
```javascript
// ... Simulation logic ...
const locationUpdate = { 
  driverId: driverState.id, 
  lat: driverState.lat, 
  lng: driverState.lng, 
  phase: driverState.phase,
  timestamp: Date.now() 
};

// Publish to Kafka
await producer.send({
  topic: 'driver-locations', // The Event Stream
  messages: [{ value: JSON.stringify(locationUpdate) }],
});
```

### B. The Consumer (Processing Data)
We subscribe to the same topic. This represents the "Backend" listening to the "Real World". When an event arrives, we cache it and broadcast it.

**Snippet from:** `services/location-service/index.js`

```javascript
await consumer.subscribe({ topic: 'driver-locations', fromBeginning: false });

await consumer.run({
  eachMessage: async ({ message }) => {
    const dataStr = message.value.toString();
    const data = JSON.parse(dataStr);
    
    // 1. Update Redis (Fast Access for new users)
    await redisClient.set(`driver:${data.driverId}`, dataStr);

    // 2. Broadcast to connected browsers (SSE)
    // 'clients' is an array of active HTTP responses
    clients.forEach(client => {
      client.res.write(`data: ${dataStr}\n\n`);
    });
  },
});
```

### C. Server-Sent Events (SSE) Endpoint
Unlike WebSockets, SSE is simpler (one-way, HTTP-based). We keep the connection open and write data whenever it's available.

**Snippet from:** `services/location-service/index.js`

```javascript
app.get('/events', (req, res) => {
  // Essential Headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Save this connection to our list
  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  // Cleanup on disconnect
  req.on('close', () => {
    clients = clients.filter(c => c.id !== clientId);
  });
});
```

### 5. Implementation: The Frontend Client
On the browser side (Passenger or Driver app), we don't need any heavy libraries. The `EventSource` API is built into modern browsers.

**Snippet from:** `frontend/driver/index.html`

```javascript
// 1. Connect to the stream
const evtSource = new EventSource("/api/location/events");

// 2. React to incoming messages
evtSource.onmessage = function(event) {
    const data = JSON.parse(event.data);

    // 3. Update the UI instantly
    carMarker.setLatLng([data.lat, data.lng]);
    document.getElementById('phase-text').innerText = data.phase.toUpperCase();
};

evtSource.onerror = function() {
    console.log("Stream lost. Reconnecting...");
};
```

### 6. Conclusion
By combining **Kafka** for reliable, high-throughput event buffering and **SSE** for lightweight client delivery, we created a robust real-time system.

**Key Takeaways:**
* **Decoupling:** The simulation (Producer) is completely unaware of the web clients. It simply acts as a "fire and forget" publisher to Kafka.
* **Scalability:** We can easily scale up the *Consumer* side (adding more location-service instances) to handle thousands of concurrent users without putting load on the simulation engine.
* **Efficiency:** We replaced traditional polling (which would require hundreds of HTTP requests per minute) with a single, persistent data stream.

This architecture forms the backbone of the **RideStream** project, enabling the seamless visual experience of tracking a taxi on a map in real-time.

**Repository:** https://github.com/andreimihaionica/ride-stream