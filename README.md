# PAWS - Pet Automated Wellness System

## System Architecture & Data Flow

This document outlines the interaction between the hardware sensors, the local server, the database, the AI service, and the user frontend.

```mermaid
graph TD
    %% Nodes Definition
    User((User))
    
    subgraph "Frontend (React Native)"
        UI[Mobile/Web App]
        Dashboard[Dashboard View]
        Controls[Control Panel]
        Chat[AI Chat Interface]
    end

    subgraph "Local Server (Node.js)"
        Server[Express API Server]
        Scheduler[Feeding Scheduler]
        SerialHandler[Serial Port Handler]
        DB[(JSON Database)]
    end

    subgraph "Intelligence"
        LLM[Local LLM Service]
    end

    subgraph "Hardware (Arduino)"
        MCU[Arduino Microcontroller]
        
        subgraph Sensors
            Env[Environment<br/>(Temp/Hum/Air)]
            Weight[Load Cell<br/>(Food Weight)]
            Water[Water Level]
            Activity[Motion & Sound]
        end
        
        subgraph Actuators
            Motor[Servo Motor<br/>(Feeder)]
            Light[LED Light]
        end
    end

    %% Relationships & Flows

    %% 1. User Interaction
    User <--> UI
    UI --> Dashboard
    UI --> Controls
    UI --> Chat

    %% 2. Frontend <-> Server
    Dashboard -- "Polls Data (HTTP)" --> Server
    Controls -- "Send Commands (HTTP)" --> Server
    Chat -- "Query (HTTP)" --> Server

    %% 3. Server Internal
    Server <--> DB
    Scheduler -- "Checks Time" --> Server

    %% 4. Server <-> Hardware
    Server <-->|"Serial (USB)"| SerialHandler
    SerialHandler <-->|"JSON Protocol"| MCU
    
    MCU -- "Read" --> Sensors
    MCU -- "Control" --> Actuators

    %% 5. AI Flow
    Server -- "Context + Prompt" --> LLM
    LLM -- "Response" --> Server

    %% Styling
    classDef hardware fill:#f9f,stroke:#333,stroke-width:2px;
    classDef server fill:#bbf,stroke:#333,stroke-width:2px;
    classDef frontend fill:#bfb,stroke:#333,stroke-width:2px;
    classDef ai fill:#fbb,stroke:#333,stroke-width:2px;

    class MCU,Sensors,Actuators hardware;
    class Server,Scheduler,SerialHandler,DB server;
    class UI,Dashboard,Controls,Chat frontend;
    class LLM ai;
```

## Workflow Descriptions

### 1. Data Collection Loop (Hardware to Database)
1.  **Sensors** read physical values (Temperature, Weight, Motion, etc.).
2.  **Arduino** aggregates these readings into a JSON object.
3.  Every ~5 seconds, Arduino sends this JSON string over **Serial (USB)** to the PC.
4.  **Local Server** receives the string, parses it, and:
    *   Updates the "Current State" in memory.
    *   Appends significant changes to history files in the **JSON Database**.

### 2. User Monitoring (Database to Frontend)
1.  **User** opens the App.
2.  **App** requests dashboard data from the **Local Server**.
3.  **Server** reads the latest state from the **Database** and returns it.
4.  **App** updates the UI (Charts, Status Cards).

### 3. Command Execution (User to Hardware)
1.  **User** taps "Dispense Food" in the App.
2.  **App** sends a POST request to the **Server**.
3.  **Server** queues a command flag (`feedCommand: true`).
4.  On the next heartbeat from Arduino, **Server** responds with the command.
5.  **Arduino** receives the command, activates the **Servo Motor**, and dispenses food.

### 4. AI Assistance (Data to Intelligence)
1.  **User** asks "How is my pet doing?" in the Chat.
2.  **App** sends the message to the **Server**.
3.  **Server** gathers recent history (Feeding, Environment, Activity) from the **Database**.
4.  **Server** preprocesses/summarizes this data into a text context.
5.  **Server** sends the Prompt + Context to the **Local LLM**.
6.  **LLM** generates a natural language response.
7.  **Server** returns the response to the **App**.
