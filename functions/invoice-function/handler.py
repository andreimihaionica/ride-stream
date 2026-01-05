from flask import Flask, request, jsonify
from datetime import datetime

app = Flask(__name__)

@app.route('/', methods=['POST'])
def generate_invoice():
    data = request.json
    
    base_fare = 5.00
    distance_cost = 2.50
    total = base_fare + distance_cost
    
    receipt = f"""
    --- RIDE RECEIPT ---
    Date: {datetime.now()}
    Ride ID: {data.get('rideId', 'N/A')}
    Passenger: {data.get('userId', 'Unknown')}
    --------------------
    Base Fare:   ${base_fare}
    Distance:    ${distance_cost}
    TOTAL:       ${total}
    --------------------
    Thank you for riding with RideStream!
    """
    
    return jsonify({"invoice": receipt, "status": "generated"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)