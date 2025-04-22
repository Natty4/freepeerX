### FreePeerX - P2P Meter Taxi Web Application 
# <a href="https://freepeerX.vercel.app/" target="_blank">FreePeerX 🤓</a>
<div>

<p><em>`Direct Driver-to-Passenger Connection • No Middleman • Lower Fees • Faster Service`</em></p>

</div>FreePeerX is a revolutionary peer-to-peer meter taxi application that connects drivers and passengers directly without intermediaries. By leveraging WebRTC technology through PeerJS, FreePeerX eliminates the need for central servers to handle ride matching and fare calculation, resulting in lower fees and a more efficient service.


## 📋 Table of Contents

- [Technology Stack](#-technology-stack)
- [Features](#-features)
- [Installation](#-installation)
- [Usage Guide](#-usage-guide)
- [Architecture](#-architecture)
- [P2P Communication](#-p2p-communication)
- [Contributing](#-contributing)
- [Call](#call) 🤙
- [License](#-license)


## 🛠 Technology Stack

<details>
  FreePeerX is built using modern web technologies:
  <summary>Tools</summary>

  - **Frontend**: HTML5, CSS3, JavaScript (ES6+)
  - **Maps**: Leaflet.js for interactive maps
  - **P2P Communication**: PeerJS (WebRTC)
  - **Geolocation**: Browser Geolocation API
  - **UI Framework**: Custom CSS with responsive design
  - **Icons**: Font Awesome
  - **Animation**: CSS3 Animations

  </details>



## ✨ Features

<details>
  <summary>Key Features</summary>


  ### Landing Page

  <div>

  </div>The landing page features an animated cityscape with P2P visualization that demonstrates how FreePeerX connects drivers and passengers directly. The animation includes:

  - Dynamic skyline with moving buildings
  - Animated cars with passengers
  - Data packet visualization showing P2P connections
  - Location pins representing drivers and passengers
  - Optional video background of a city at night


  ### User Type Selection

  <div>

  </div>Users can choose to use the application as either a passenger or a driver:

  - **Passenger**: Search for nearby drivers and request rides
  - **Driver**: Register vehicle information and accept ride requests


  ### Driver Registration

  <div>

  </div>Drivers can register with the following information:

  - Full Name
  - Car Type
  - Car Color
  - City
  - Location (latitude and longitude) automatically detected
  - Option to remember driver information for future sessions


  ### Driver Dashboard

  <div>

  </div>The driver dashboard provides:

  - Real-time location tracking on a map
  - Online/offline status toggle
  - Ride request notifications
  - Daily earnings statistics
  - Completed rides counter
  - Driver rating


  ### Passenger Code Generation

  <div>

  </div>Passengers receive a unique 6-digit code that:

  - Identifies them in the system
  - Can be shared with drivers for direct connection
  - Expires after 5 minutes for security
  - Can be reset if needed


  ### Driver Selection

  <div>

  </div>Passengers can:

  - View nearby drivers on a map
  - See driver details (name, vehicle, rating)
  - View estimated distance and arrival time
  - Select a driver to request a ride
  - Distinguish between real P2P drivers and simulated drivers


  ### Ride Pairing

  <div>

  </div>The pairing screen allows:

  - Entering the driver's code to start the ride
  - Verification of the code's validity
  - Secure connection establishment between driver and passenger


  ### Active Ride

  <div>

  </div>During an active ride:

  - Real-time map shows current location and route
  - Live fare calculation based on distance and time
  - Driver information display
  - Option to end the ride


  ### Ride Summary

  <div>

  </div>After completing a ride:

  - Detailed fare breakdown (base fare, distance charge, time charge)
  - Total distance traveled
  - Total time elapsed
  - Option to share ride details
  - Option to start a new ride

</details>

## 🚀 Installation

<details>
  <summary>Prerequisites</summary>

  ### Prerequisites

  - Modern web browser with JavaScript enabled
  - Internet connection for map tiles and P2P communication

</details>
<details>
  <summary>Local Setup</summary>

  ### Local Setup

  1. Clone the repository:


  ```shellscript
  git clone https://github.com/natty4/freepeerX.git
  cd freepeerx
  ```

  2. Open the project in a web server. You can use any of these methods:


  Using Python:

  ```shellscript
  # Python 3
  python -m http.server 8000

  # Python 2
  python -m SimpleHTTPServer 8000
  ```

  Using Node.js:

  ```shellscript
  # Install http-server if you haven't already
  npm install -g http-server

  # Run the server
  http-server -p 8000
  ```

3. Open your browser and navigate to `http://localhost:8000`

</details>




## 📖 Usage Guide

<details>
  <summary>For Passengers</summary>

  ### 1. Start a Ride:

  1. Click "Get Started" on the landing page
  2. Select "Passenger"
  3. Note your unique code (you can share this with a specific driver if desired)
  4. Click "Find a Driver"

  ### 2. Select a Driver:

  1. Browse available drivers on the map
  2. Click on a driver card to select them
  3. For real P2P drivers, a ride request will be sent automatically
  4. For simulated drivers, you'll proceed directly to the pairing screen

  ### 3. Pair with Driver:

  1. Enter the 6-digit code provided by the driver
  2. Click "Verify & Start Ride"

  ### 4. During the Ride:

  1. Monitor your route on the map
  2. Watch the fare calculation in real-time
  3. Click "End Ride" when you reach your destination

  ### 5. After the Ride:

  1. Review the fare breakdown
  2. Share ride details if desired
  3. Start a new ride or exit the application

</details>

<details>
  <summary>For Drivers</summary>

  ### 1. Register as a Driver:

  1. Click "Get Started" on the landing page
  2. Select "Driver"
  3. Fill in your details in the registration form
  4. Check "Remember Me" if you want to save your information
  5. Click "Register"

  ### 2. Manage Your Availability:

  1. Use the "Online/Offline" toggle to control your availability
  2. When online, your location will be broadcast to nearby passengers

  ### 3. Accept Ride Requests:

  1. Ride requests will appear in your dashboard
  2. Review passenger details and distance
  3. Accept or decline the request
  4. If accepted, note the generated code to share with the passenger

  ### 4. During the Ride:

  1. Monitor your route on the map
  2. The fare is calculated automatically based on distance and time

  ### 5. End the Ride:

  1. The ride ends when the passenger clicks "End Ride"
  2. Your earnings will be updated in your dashboard

</details>

## 🏗 Architecture

FreePeerX is built with a modular architecture that separates concerns into distinct classes:

<details>
  <summary>Core Components</summary>
  
  1. **P2PCommunicationManager**: Handles all peer-to-peer communication using PeerJS
  2. **DriverRegistration**: Manages driver information and online status
  3. **LocationTracker**: Tracks and records user location using the Geolocation API
  4. **FareCalculator**: Calculates ride fares based on distance and time
  5. **CodeManager**: Generates and verifies unique codes for ride pairing
  6. **DriversManager**: Manages driver discovery and selection
  7. **MapManager**: Handles map initialization, markers, and routes

</details>

### Data Flow


## 🔄 P2P Communication

FreePeerX uses WebRTC (via PeerJS) for direct peer-to-peer communication between drivers and passengers:

<details>
  <summary>How P2P Works</summary>

  - **Peer Creation**: Each user creates a unique peer ID when they join the network
  - **Discovery**: Drivers register with a discovery service (simulated in this demo)
  - **Connection**: Passengers connect directly to drivers using their peer IDs
  - **Data Exchange**: Location updates and ride requests are sent directly between peers
  - **Fallback**: If P2P connection fails, the app falls back to simulated drivers
</details>

<details>
  <summary>Security Features</summary>

  - Unique 6-digit codes for ride verification
  - Code expiration after 5 minutes
  - Secure WebRTC data channels with encryption

</details>


## 👨‍💻 Setting Up for Development

<details>
  <summary>Project Structure</summary>

  The project is organized into the following structure:

  ```plaintext
  freepeerx/
  ├── index.html          # Main HTML file
  ├── styles.css          # CSS styles
  ├── js/
  │   └── app.js          # Main JavaScript file with all functionality
  ├── assets/             # Images and other assets
  └── README.md           # Project documentation
  ```
  </details>


## 🔧 Development Workflow

<details>
  <summary>Local Development</summary>

  1. Make changes to the HTML, CSS, or JavaScript files
  2. Refresh your browser to see changes

</details>

<details>
  <summary>Testing P2P Functionality</summary>

  1. Open two browser windows to simulate a driver and passenger
  2. Register as a driver in one window
  3. Connect as a passenger in the other window

</details>

<details>
  <summary>Simulated Mode</summary>

  1. Set `CONFIG.p2p.enabled = false` in app.js to use simulated drivers
  2. This is useful for testing without a second device

</details>



## 🤝 Contributing

Contributions are welcome! Here's how you can contribute:
<details>
  <summary>How to Contribute</summary>

  1. Fork the repository
  2. Create a feature branch: `git checkout -b feature/amazing-feature`
  3. Commit your changes: `git commit -m 'Add amazing feature'`
  4. Push to the branch: `git push origin feature/amazing-feature`
  5. Open a Pull Request


  ### Code Style Guidelines
  - Use ES6+ features where appropriate
  - Follow the existing modular pattern
  - Add comments for complex logic
  - Test P2P functionality thoroughly
</details>
<details>
  <summary>Reporting Issues</summary>

  If you encounter any bugs or issues, please open an issue on GitHub. Include the following information:
  - Steps to reproduce
  - Expected behavior
  - Actual behavior
  - Screenshots (if applicable)
  - Browser and OS information
</details>



## Call

  If you're interested in contributing to the project, please feel free to reach out. I'm looking for collaborators who are passionate about P2P technology and want to help build a better ride-hailing experience as well the P2P communication. Whether you're a developer, designer, or just someone with great ideas, your input is welcome!


## Note
  This project is a proof of concept and is not intended for production use. It highlights the potential of P2P technology in the ride-hailing industry. The app is fully built using V0. I just added some features and modified the code a little bit. While the full P2P communication is still in progress (no worries, the app works with simulated drivers for now), so I continue working on and refining this functionality. The app is fully functional and can be used to demonstrate the concept of P2P ride-hailing.



## 📄 License

This project is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for details.

---

  

<div>
Built with 💙   •
  <a href="https://github.com/natty4/freepeerX">GitHub</a> •
  <a href="https://freepeerX.vercel.app/">Website</a> •
  <a href="#">Contact</a>
</div>