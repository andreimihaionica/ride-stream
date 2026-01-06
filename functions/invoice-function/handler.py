import sys
import json
import smtplib
from email.mime.text import MIMEText
from datetime import datetime

def handle(req_body):
    try:
        if not req_body:
            return json.dumps({"error": "Empty body"})
            
        data = json.loads(req_body)
        
        # 1. Get Data
        email_addr = data.get('email', 'test@example.com')
        ride_id = data.get('rideId', 'unknown')
        distance = data.get('distanceKm', 0)

        # 2. Generate Receipt
        base_fare = 5.00
        total = base_fare + (distance * 2.00)
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        receipt_text = f"""
        --------------------------------
           RIDE STREAM RECEIPT
        --------------------------------
        Date: {timestamp}
        Ride ID: {ride_id}
        
        Base Fare:      $5.00
        Distance Cost:  ${(distance * 2.00):.2f}
        --------------------------------
        TOTAL CHARGED:  ${total:.2f}
        --------------------------------
        
        Thank you for riding with us!
        """
        
        # 3. Send Email via MailHog
        msg = MIMEText(receipt_text)
        msg['Subject'] = f"Your Receipt for Ride {ride_id}"
        msg['From'] = "receipts@ridestream.com"
        msg['To'] = email_addr

        # Connect to MailHog container on port 1025
        with smtplib.SMTP('mailhog', 1025) as server:
            server.send_message(msg)
            
        return json.dumps({
            "status": "email_sent", 
            "recipient": email_addr, 
            "total": total
        })

    except Exception as e:
        return json.dumps({"error": str(e)})

if __name__ == "__main__":
    input_data = sys.stdin.read()
    sys.stdout.write(handle(input_data))