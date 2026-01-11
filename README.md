# 🚖 RideStream: Distributed Ride-Sharing System

RideStream is a microservices-based ride-sharing platform (like Uber/Bolt) built to demonstrate advanced distributed system concepts, including Event Streaming, Message Queues, Load Balancing, Serverless Functions, and Real-time Communication.

## 🏗️ Architecture Overview

The system is composed of the following services containerized via Docker:

* **API Gateway (Nginx):** Single entry point (Port `8080`) acting as a Reverse Proxy and Load Balancer.
* **Auth Service (Node.js + PostgreSQL):** Handles User Registration & JWT Login.
* **Ride Service (Node.js + PostgreSQL + RabbitMQ):** Handles Ride Requests. Scalable stateless service.
* **Location Service (Node.js + Kafka + Redis):** Simulates driver movement, streams GPS data, and pushes real-time updates via SSE.
* **Invoice Function (Python + OpenFaaS Watchdog):** A "Scale-to-Zero" Serverless function that generates receipts.
* **Frontend:**
    * **Passenger App:** Web interface for booking rides.
    * **Driver Dashboard:** Real-time map visualization.
* **Infrastructure:** RabbitMQ (Task Queue), Apache Kafka (Event Streaming), Redis (Cache), MailHog (SMTP Testing).

---

## 🚀 How to Run the System

### Prerequisites
* [Docker Desktop](https://www.docker.com/products/docker-desktop) installed and running.

### 1. Start the System
Run the following command in the project root to build and start all containers:

```bash
docker-compose up -d --build
```
*Wait about 30-60 seconds for Kafka and RabbitMQ to fully initialize.*

### 2. Access the Interfaces
| Service | URL | Description |
| :--- | :--- | :--- |
| **Passenger App** | [http://localhost:8080/passenger](http://localhost:8080/passenger) | Login & Book Rides |
| **Driver Dashboard** | [http://localhost:8080/driver/](http://localhost:8080/driver/) | View Real-time Car Movement |
| **MailHog (Email)** | [http://localhost:8025](http://localhost:8025) | View Fake Email Receipts |
| **RabbitMQ UI** | [http://localhost:15672](http://localhost:15672) | User/Pass: `guest`/`guest` |

---

## 🧪 How to Test & Verify Features

### 1. Full "Happy Path" Demo
1.  Open **Passenger App**.
2.  **Register** a new user (e.g., `test@example.com` / `password123`).
3.  **Login** to get your JWT Token.
4.  Select a **Pickup** (e.g., "Cluj Arena") and **Destination** (e.g., "Airport").
5.  Click **"Request Ride"**.
6.  Click the link **"Check the live location..."** to open the Driver Dashboard.
7.  **Watch:** The car will move smoothly across the map (SSE Stream).
8.  **Finish:** When the car reaches the destination, check **MailHog** (`http://localhost:8025`) for your receipt email.

### 2. Verify Load Balancing (Scalability)
The Ride Service is designed to scale horizontally. Nginx balances traffic between instances.

1.  **Scale Up:** Run 3 instances of the Ride Service:
    ```bash
    docker-compose up -d --scale ride-service=3
    ```
2.  **Run the Spam Script:** Use the included script to fire rapid requests:
    ```bash
    cd utils
    ./spam.sh
    ```
3.  **Check Logs:** See different containers handling requests:
    ```bash
    docker-compose logs -f ride-service
    ```
    *You will see logs like `[Instance: ride-service-1]` and `[Instance: ride-service-2]` alternating.*

### 3. Verify Security (JWT)
The system blocks unauthorized access to business APIs.

**Test:** Try to book a ride without a token (using curl):
```bash
curl -X POST http://localhost:8080/api/ride/request \
     -H "Content-Type: application/json" \
     -d '{"pickup": "Test", "destination": "Test"}'
```

**Result:** `{"message":"No token provided"}` (Request Blocked).

---

## 🛠️ Useful Commands

### View Logs for a Specific Service
If something isn't working, check the logs for that specific container:

```bash
# Ride Service (Backend Logic)
docker-compose logs -f ride-service

# Location Service (Simulation & Kafka)
docker-compose logs -f location-service

# Auth Service
docker-compose logs -f auth-service

# Invoice Function (FaaS)
docker-compose logs -f invoice-function
```

### Restart a Specific Service
If you change code in just one service, you don't need to restart everything:

```bash
# Rebuild and restart only the location service
docker-compose up -d --build location-service
```

### Stop the System
To stop and remove all containers:
```bash
docker-compose down
```