# PAWS Frontend (Pet Automated Wellness System)

PAWS is a comprehensive IoT solution designed to monitor and manage your pet's environment. This directory contains the frontend application built with **Expo (React Native)**, which serves as the control center for the PAWS ecosystem.

## 📱 Features

- **Real-time Dashboard**: Monitor environmental metrics like Temperature, Humidity, CO2, VOC, and Water Levels.
- **Remote Control**: Toggle lights and trigger automated feeding remotely.
- **Smart Insights**: Integrated with a local LLM to provide health and wellness insights based on sensor data.
- **Notifications**: Receive alerts for low water levels, abnormal sensor readings, or motion detection.
- **Historical Data**: View charts and logs of past events and environmental trends.

## 🛠 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (LTS version recommended)
- **npm** (comes with Node.js)
- **Expo Go** app on your iOS or Android device (or an Emulator/Simulator set up on your computer).
- **Git**

## ⚙️ Configuration

The application relies on a central configuration file for secrets and network settings.

1.  **Locate the Config**: Go to the root of the PAWS project (one level up from paws-frontend).
2.  **Create Secrets File**:
    Copy the example secrets file:
    `ash
    cp ../config/secrets.example.json ../config/secrets.json
    `
    *(Note: If you are on Windows Command Prompt, use copy instead of cp)*

3.  **Edit config/secrets.json**:
    Open the file and fill in your specific details:
    `json
    {
      "llm": {
        "host": "http://YOUR_LLM_IP:PORT",
        "model": "your-model-name",
        "temperature": 0.5
      },
      "wifi": {
        "ssid": "YOUR_WIFI_SSID",
        "password": "YOUR_WIFI_PASSWORD"
      },
      "server": {
        "host": "YOUR_LOCAL_IP_ADDRESS",
        "port": 4100
      }
    }
    `
    *   **llm**: Settings for your local LLM server (e.g., LM Studio).
    *   **wifi**: Credentials for the Arduino hardware to connect to your network.
    *   **server**: The IP address of the machine running the local-db-server.js. **Crucial**: Ensure this IP is accessible from your phone running Expo Go.

## 🚀 Installation & Setup

1.  **Install Dependencies**:
    Navigate to the paws-frontend directory and install the required packages:
    `ash
    cd paws-frontend
    npm install
    `

2.  **Start the Backend Server**:
    The frontend requires the local backend to store data and handle requests.
    `ash
    npm run db:start
    `
    *This command runs local-db-server.js. Keep this terminal window open.*

3.  **Start the Expo App**:
    Open a new terminal window, navigate to paws-frontend, and run:
    `ash
    npx expo start
    `

4.  **Run on Device**:
    *   Scan the QR code displayed in the terminal using the **Expo Go** app on your phone.
    *   Ensure your phone and the computer are on the **same Wi-Fi network**.

## 📖 How to Use

### Dashboard
Upon launching the app, you will see the main dashboard.
- **Sensor Cards**: Display current readings.
- **Quick Actions**: Buttons to toggle the light or dispense food.

### Settings
- Configure notification preferences.
- View app information.

### Troubleshooting
- **"Network Error" or No Data**:
    - Check if 
pm run db:start is running.
    - Verify the server.host IP in secrets.json matches your computer's local IP.
    - Ensure your phone and computer are on the same Wi-Fi.
    - Check firewall settings allowing traffic on port 4100.

## 📂 Project Structure

- **app/**: Main application screens (Expo Router).
- **components/**: Reusable UI components (SensorCard, etc.).
- **services/**: API integration and configuration services.
- **local-db-server.js**: A lightweight Node.js server acting as the backend/database.
- **assets/**: Images and static resources.

---
*Built with Expo and React Native.*
