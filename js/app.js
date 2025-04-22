/**
 * FreePeerX - Meter Taxi Web Application
 * All JavaScript functionality in a single file
 */

// Declare L and Peer as global variable


document.addEventListener("DOMContentLoaded", () => {
  // Check if Leaflet is loaded (L should be a global variable from the Leaflet script)
  if (typeof L === "undefined") {
    console.error("Leaflet library not loaded")
    // Create a notification function if it doesn't exist yet
    if (typeof showNotification !== "function") {
      window.showNotification = (message, type = "error") => {
        alert(message)
      }
    }
    showNotification("Error: Map library not loaded. Please refresh the page.", "error")
    return
  }

  // Check if PeerJS is loaded
  if (typeof Peer === "undefined") {
    console.error("PeerJS library not loaded")
    showNotification("Warning: P2P library not loaded. Using simulated mode.", "info")
  } else {
    // Enable P2P if PeerJS is available
    CONFIG.p2p.enabled = true
  }

  // Initialize the app
  initApp()
})

/************************************
 * CONFIGURATION
 ************************************/
const CONFIG = {
  // Fare calculation settings
  fare: {
    baseFare: 5.0, // Base fare in dollars
    perKilometer: 2.0, // Rate per kilometer in dollars
    perMinute: 0.5, // Rate per minute in dollars
    currency: "$", // Currency symbol
  },

  // Map settings
  map: {
    defaultZoom: 15, // Default zoom level for maps
    userMarkerColor: "#2ecc71", // Updated to green for user's marker
    driverMarkerColor: "#27ae60", // Updated to darker green for driver's marker
    routeColor: "#1abc9c", // Updated to teal-green for route line
    tileLayer: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", // Map tile layer URL
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', // Map attribution
  },

  // Location tracking settings
  location: {
    trackingInterval: 5000, // Location update interval in milliseconds
    simulationSpeed: 1, // Multiplier for simulation speed (for testing)
    useSimulation: true, // Whether to use simulated movement (for testing)
  },

  // Code generation settings
  code: {
    length: 6, // Length of generated codes
    expiryTime: 300000, // Code expiry time in milliseconds (5 minutes)
  },

  // P2P settings
  p2p: {
    // Using multiple STUN servers for better connectivity
    stunServer: { host: "stun.l.google.com", port: 19302 },
    // How often to broadcast location updates (in milliseconds)
    broadcastInterval: 3000,
    // Prefix for driver peer IDs
    driverPrefix: "freepeerx-driver-",
    // Prefix for passenger peer IDs
    passengerPrefix: "freepeerx-passenger-",
    // How long to wait for driver connections (in milliseconds)
    connectionTimeout: 8000, // Reduced timeout
    // Whether to use P2P (set to true by default, will be disabled if PeerJS is unavailable)
    enabled: true,
    // Discovery server URL (in a real app, this would be your signaling server)
    discoveryServer: "https://freepeerx-discovery.example.com",
    // Maximum number of drivers to discover
    maxDrivers: 10,
    // Whether to use local discovery (for testing)
    useLocalDiscovery: true,
  },

  // App settings
  app: {
    // User types
    userTypes: {
      PASSENGER: "passenger",
      DRIVER: "driver",
    },
    // Default user type
    defaultUserType: "passenger",
  },
}

/************************************
 * P2P COMMUNICATION MANAGER
 ************************************/

// Update the P2P initialization to handle server connection issues better
class P2PCommunicationManager {
  constructor() {
    this.peer = null
    this.peerId = null
    this.connections = {}
    this.isDriver = false
    this.isConnected = false
    this.locationBroadcastInterval = null
    this.onDriverUpdate = null
    this.onlineDrivers = {}
    this.pendingConnections = 0
    this.isPeerJSAvailable = typeof Peer !== "undefined"
    this.discoveryCallbacks = []
    this.connectionError = null
  }

  /**
   * Initialize P2P communication
   * @param {boolean} isDriver - Whether this peer is a driver
   * @param {Object} driverData - Driver data if this peer is a driver
   * @returns {Promise} - Promise that resolves when P2P is initialized
   */
  async init(isDriver, driverData = null) {
    // If P2P is disabled or PeerJS is not available, resolve with mock data
    if (!CONFIG.p2p.enabled || !this.isPeerJSAvailable) {
      console.log("P2P is disabled or PeerJS is not available. Using mock data.")
      return Promise.resolve("mock-peer-id")
    }

    this.isDriver = isDriver

    // Generate a unique ID for this peer
    const randomId = Math.random().toString(36).substring(2, 10)
    this.peerId = isDriver ? CONFIG.p2p.driverPrefix + randomId : CONFIG.p2p.passengerPrefix + randomId

    return new Promise((resolve, reject) => {
      try {
        // Create a new Peer with the generated ID and custom server options
        this.peer = new Peer(this.peerId, {
          // Use a more reliable configuration
          config: {
            iceServers: [
              { urls: `stun:${CONFIG.p2p.stunServer.host}:${CONFIG.p2p.stunServer.port}` },
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:global.stun.twilio.com:3478" },
            ],
          },
          // Set a shorter timeout for connections
          debug: 1, // Only show errors
          pingInterval: 5000, // Ping more frequently
        })

        // Set a timeout for the connection attempt
        const connectionTimeout = setTimeout(() => {
          console.error("Connection to PeerJS server timed out")
          this.connectionError = "Connection to server timed out"
          reject(new Error("Connection to PeerJS server timed out"))
        }, 10000)

        // Handle connection open event
        this.peer.on("open", (id) => {
          clearTimeout(connectionTimeout)
          console.log("My peer ID is: " + id)
          this.isConnected = true
          this.connectionError = null

          // If this is a driver, start broadcasting location
          if (isDriver && driverData) {
            this.startLocationBroadcast(driverData)
          }

          // Set up event listeners
          this.setupEventListeners()

          // Register with discovery service if this is a driver
          if (isDriver) {
            this.registerAsDriver(driverData)
          }

          resolve(id)
        })

        // Handle connection error
        this.peer.on("error", (err) => {
          clearTimeout(connectionTimeout)
          console.error("Peer connection error:", err)
          this.isConnected = false
          this.connectionError = err.message || "Connection error"

          // Don't reject if it's just a connection error to a specific peer
          if (err.type === "peer-unavailable") {
            console.log("Peer unavailable, continuing with other peers or mock data")
          } else {
            reject(err)
          }
        })

        // Handle disconnection from the server
        this.peer.on("disconnected", () => {
          console.log("Disconnected from PeerJS server, attempting to reconnect")
          this.isConnected = false

          // Try to reconnect
          setTimeout(() => {
            if (this.peer) {
              this.peer.reconnect()
            }
          }, 3000)
        })
      } catch (error) {
        console.error("Error initializing P2P:", error)
        this.connectionError = error.message || "Initialization error"
        reject(error)
      }
    })
  }

  /**
   * Register as a driver with the discovery service
   * @param {Object} driverData - Driver data
   */
  registerAsDriver(driverData) {
    // In a real app, you would register with a signaling server
    // For this demo, we'll simulate registration
    console.log("Driver registered with discovery service:", this.peerId)
  }

  /**
   * Set up P2P event listeners
   */
  setupEventListeners() {
    if (!this.peer) return

    // Handle incoming connections
    this.peer.on("connection", (conn) => {
      const peerId = conn.peer
      console.log("Incoming connection from:", peerId)

      // Store the connection
      this.connections[peerId] = conn

      // Set up connection event handlers
      this.setupConnectionHandlers(conn)
    })
  }

  /**
   * Set up handlers for a specific connection
   * @param {Object} conn - The connection object
   */
  setupConnectionHandlers(conn) {
    // Handle connection open
    conn.on("open", () => {
      console.log("Connection opened with:", conn.peer)

      // If this is a driver, send initial driver data
      if (this.isDriver) {
        const driverData = driverRegistration.getDriverData()
        if (driverData) {
          this.sendDriverData(conn, driverData)
        }
      }
    })

    // Handle incoming data
    conn.on("data", (data) => {
      console.log("Received data:", data)

      // Handle different types of data
      if (data.type === "driverData") {
        this.handleDriverData(conn.peer, data.driverData)
      } else if (data.type === "requestDrivers") {
        // If this is a driver and we're online, send driver data
        if (this.isDriver && driverRegistration.isDriverOnline()) {
          const driverData = driverRegistration.getDriverData()
          if (driverData) {
            this.sendDriverData(conn, driverData)
          }
        }
      } else if (data.type === "rideRequest") {
        // Handle ride request (for drivers)
        if (this.isDriver) {
          this.handleRideRequest(conn.peer, data.request)
        }
      } else if (data.type === "rideResponse") {
        // Handle ride response (for passengers)
        if (!this.isDriver) {
          this.handleRideResponse(conn.peer, data.response)
        }
      }
    })

    // Handle connection close
    conn.on("close", () => {
      console.log("Connection closed with:", conn.peer)

      // Remove the connection
      delete this.connections[conn.peer]

      // If this was a driver connection, remove from online drivers
      if (conn.peer.startsWith(CONFIG.p2p.driverPrefix)) {
        delete this.onlineDrivers[conn.peer]

        // Notify about driver update
        if (this.onDriverUpdate) {
          this.onDriverUpdate(Object.values(this.onlineDrivers))
        }
      }
    })

    // Handle connection error
    conn.on("error", (err) => {
      console.error("Connection error with " + conn.peer + ":", err)

      // Remove the connection
      delete this.connections[conn.peer]

      // If this was a driver connection, remove from online drivers
      if (conn.peer.startsWith(CONFIG.p2p.driverPrefix)) {
        delete this.onlineDrivers[conn.peer]

        // Notify about driver update
        if (this.onDriverUpdate) {
          this.onDriverUpdate(Object.values(this.onlineDrivers))
        }
      }
    })
  }

  /**
   * Connect to a specific peer
   * @param {string} peerId - ID of the peer to connect to
   * @returns {Object} - The connection object
   */
  connectToPeer(peerId) {
    if (!this.isConnected || !this.peer) {
      console.error("P2P not connected")
      return null
    }

    // Check if already connected
    if (this.connections[peerId]) {
      return this.connections[peerId]
    }

    try {
      // Connect to the peer with a shorter timeout
      const conn = this.peer.connect(peerId, {
        reliable: true,
        metadata: { timeout: 5000 },
      })

      // Store the connection
      this.connections[peerId] = conn

      // Set up connection event handlers
      this.setupConnectionHandlers(conn)

      return conn
    } catch (error) {
      console.error(`Error connecting to peer ${peerId}:`, error)
      return null
    }
  }

  /**
   * Start broadcasting driver location
   * @param {Object} driverData - Driver data to broadcast
   */
  startLocationBroadcast(driverData) {
    if (!CONFIG.p2p.enabled || !this.isPeerJSAvailable) return

    // Clear any existing interval
    if (this.locationBroadcastInterval) {
      clearInterval(this.locationBroadcastInterval)
    }

    // Start a new interval to broadcast location
    this.locationBroadcastInterval = setInterval(() => {
      // Only broadcast if we're online
      if (!driverRegistration.isDriverOnline()) {
        return
      }

      // Get current location
      locationTracker.getCurrentLocation().then((location) => {
        // Update driver data with current location
        const updatedDriverData = {
          ...driverData,
          location: location,
          lastUpdated: new Date().toISOString(),
        }

        // Broadcast to all connected passengers
        Object.values(this.connections).forEach((conn) => {
          if (conn.peer.startsWith(CONFIG.p2p.passengerPrefix)) {
            this.sendDriverData(conn, updatedDriverData)
          }
        })
      })
    }, CONFIG.p2p.broadcastInterval)
  }

  /**
   * Stop broadcasting driver location
   */
  stopLocationBroadcast() {
    if (this.locationBroadcastInterval) {
      clearInterval(this.locationBroadcastInterval)
      this.locationBroadcastInterval = null
    }
  }

  /**
   * Send driver data to a specific connection
   * @param {Object} conn - The connection object
   * @param {Object} driverData - Driver data to send
   */
  sendDriverData(conn, driverData) {
    conn.send({
      type: "driverData",
      driverData: {
        ...driverData,
        peerId: this.peerId,
      },
    })
  }

  /**
   * Handle incoming driver data
   * @param {string} peerId - ID of the peer that sent the data
   * @param {Object} driverData - Driver data received
   */
  handleDriverData(peerId, driverData) {
    // Store the driver data
    this.onlineDrivers[peerId] = {
      ...driverData,
      id: peerId, // Use peer ID as driver ID
      peerId: peerId,
    }

    // Decrement pending connections counter
    if (this.pendingConnections > 0) {
      this.pendingConnections--
    }

    // Notify about driver update
    if (this.onDriverUpdate) {
      this.onDriverUpdate(Object.values(this.onlineDrivers))
    }
  }

  /**
   * Handle ride request (for drivers)
   * @param {string} passengerPeerId - ID of the passenger
   * @param {Object} request - Ride request data
   */
  handleRideRequest(passengerPeerId, request) {
    // In a real app, you would show the request to the driver
    // and let them accept or decline

    // For this demo, we'll automatically accept after a short delay
    setTimeout(() => {
      const conn = this.connections[passengerPeerId]
      if (conn) {
        conn.send({
          type: "rideResponse",
          response: {
            accepted: true,
            driverCode: codeManager.generateDriverCode(),
            driverData: driverRegistration.getDriverData(),
          },
        })
      }
    }, 2000)

    // Add the request to the driver's UI
    this.addRideRequestToUI(passengerPeerId, request)
  }

  /**
   * Add a ride request to the driver's UI
   * @param {string} passengerPeerId - ID of the passenger
   * @param {Object} request - Ride request data
   */
  addRideRequestToUI(passengerPeerId, request) {
    const requestsContainer = document.getElementById("driver-requests")
    const noRequestsMessage = requestsContainer.querySelector(".no-requests-message")

    if (noRequestsMessage) {
      noRequestsMessage.style.display = "none"
    }

    const requestCard = document.createElement("div")
    requestCard.className = "request-card"
    requestCard.dataset.passengerId = passengerPeerId

    requestCard.innerHTML = `
      <div class="request-info">
        <div class="request-passenger">Passenger: ${request.passengerName || "Anonymous"}</div>
        <div class="request-distance">${request.distance || "Unknown"} km away</div>
      </div>
      <div class="request-actions">
        <button class="secondary-btn decline-btn">Decline</button>
        <button class="primary-btn accept-btn">Accept</button>
      </div>
    `

    // Add event listeners for accept/decline buttons
    const acceptBtn = requestCard.querySelector(".accept-btn")
    const declineBtn = requestCard.querySelector(".decline-btn")

    acceptBtn.addEventListener("click", () => {
      this.acceptRideRequest(passengerPeerId, request)
      requestCard.remove()

      // Show no requests message if no more requests
      if (requestsContainer.querySelectorAll(".request-card").length === 0) {
        if (noRequestsMessage) {
          noRequestsMessage.style.display = "block"
        }
      }
    })

    declineBtn.addEventListener("click", () => {
      this.declineRideRequest(passengerPeerId)
      requestCard.remove()

      // Show no requests message if no more requests
      if (requestsContainer.querySelectorAll(".request-card").length === 0) {
        if (noRequestsMessage) {
          noRequestsMessage.style.display = "block"
        }
      }
    })

    requestsContainer.appendChild(requestCard)
  }

  /**
   * Accept a ride request
   * @param {string} passengerPeerId - ID of the passenger
   * @param {Object} request - Ride request data
   */
  acceptRideRequest(passengerPeerId, request) {
    const conn = this.connections[passengerPeerId]
    if (conn) {
      const driverCode = codeManager.generateDriverCode()

      conn.send({
        type: "rideResponse",
        response: {
          accepted: true,
          driverCode: driverCode,
          driverData: driverRegistration.getDriverData(),
        },
      })

      showNotification(`Ride accepted. Your code is: ${driverCode}`, "success")
    }
  }

  /**
   * Decline a ride request
   * @param {string} passengerPeerId - ID of the passenger
   */
  declineRideRequest(passengerPeerId) {
    const conn = this.connections[passengerPeerId]
    if (conn) {
      conn.send({
        type: "rideResponse",
        response: {
          accepted: false,
          reason: "Driver declined the request",
        },
      })
    }
  }

  /**
   * Handle ride response (for passengers)
   * @param {string} driverPeerId - ID of the driver
   * @param {Object} response - Ride response data
   */
  handleRideResponse(driverPeerId, response) {
    if (response.accepted) {
      // Store the driver code
      codeManager.driverCode = response.driverCode

      // Select the driver
      const driver = this.onlineDrivers[driverPeerId]
      if (driver) {
        driversManager.selectDriver(driver.id)
      }

      // Show notification
      showNotification(`Driver accepted! Code: ${response.driverCode}`, "success")

      // Show the pairing screen
      showScreen("pairing-screen")
    } else {
      // Show notification
      showNotification(`Driver declined: ${response.reason || "No reason provided"}`, "error")
    }
  }

  /**
   * Send a ride request to a driver
   * @param {string} driverPeerId - ID of the driver
   * @param {Object} requestData - Ride request data
   */
  sendRideRequest(driverPeerId, requestData) {
    const conn = this.connections[driverPeerId]
    if (!conn) {
      const newConn = this.connectToPeer(driverPeerId)
      if (newConn) {
        newConn.on("open", () => {
          newConn.send({
            type: "rideRequest",
            request: requestData,
          })
        })
      }
    } else {
      conn.send({
        type: "rideRequest",
        request: requestData,
      })
    }
  }

  /**
   * Find online drivers
   * @param {Function} callback - Function to call with driver data
   */
  findOnlineDrivers(callback) {
    // If P2P is disabled, PeerJS is not available, or there was a connection error
    // use mock drivers
    if (!CONFIG.p2p.enabled || !this.isPeerJSAvailable || this.connectionError || !this.isConnected) {
      console.log("P2P unavailable or connection error, using mock drivers")
      const mockDrivers = this.generateMockDrivers()
      callback(mockDrivers)
      return
    }

    // Set the callback
    this.onDriverUpdate = callback

    // Clear existing online drivers
    this.onlineDrivers = {}

    // Reset pending connections counter
    this.pendingConnections = 0

    // Find all driver peers
    this.discoverDriverPeers()
      .then((driverPeers) => {
        // If no drivers found, call callback with mock drivers
        if (driverPeers.length === 0) {
          console.log("No driver peers found, using mock drivers")
          const mockDrivers = this.generateMockDrivers()
          callback(mockDrivers)
          return
        }

        // Set pending connections counter
        this.pendingConnections = driverPeers.length

        // Connect to each driver peer
        let connectionAttempts = 0
        driverPeers.forEach((peerId) => {
          const conn = this.connectToPeer(peerId)

          // Request driver data
          if (conn) {
            connectionAttempts++
            conn.on("open", () => {
              conn.send({ type: "requestDrivers" })
            })

            // Handle connection error
            conn.on("error", (err) => {
              console.log(`Connection error with ${peerId}: ${err.message}`)
              this.pendingConnections--

              // If all connections failed, use mock drivers
              if (this.pendingConnections === 0 && Object.keys(this.onlineDrivers).length === 0) {
                console.log("All connections failed, using mock drivers")
                const mockDrivers = this.generateMockDrivers()
                callback(mockDrivers)
              }
            })
          } else {
            this.pendingConnections--
          }
        })

        // If no connection attempts were made, use mock drivers
        if (connectionAttempts === 0) {
          console.log("No connection attempts made, using mock drivers")
          const mockDrivers = this.generateMockDrivers()
          callback(mockDrivers)
          return
        }

        // Set a timeout to call the callback even if not all drivers respond
        setTimeout(() => {
          if (this.pendingConnections > 0) {
            console.log(`${this.pendingConnections} drivers did not respond in time`)
            this.pendingConnections = 0

            // If no drivers responded, use mock drivers
            if (Object.keys(this.onlineDrivers).length === 0) {
              console.log("No drivers responded, using mock drivers")
              const mockDrivers = this.generateMockDrivers()
              callback(mockDrivers)
            } else {
              callback(Object.values(this.onlineDrivers))
            }
          }
        }, CONFIG.p2p.connectionTimeout)
      })
      .catch((error) => {
        console.error("Error discovering driver peers:", error)
        const mockDrivers = this.generateMockDrivers()
        callback(mockDrivers)
      })
  }

  /**
   * Generate mock drivers for testing
   * @returns {Array} - Array of mock driver objects
   */
  generateMockDrivers() {
    const count = 5 // Number of mock drivers to generate
    const mockDrivers = []

    const names = ["John Smith", "Maria Garcia", "David Kim", "Sarah Johnson", "Ahmed Hassan"]

    const vehicles = ["Toyota Camry", "Honda Civic", "Ford Focus", "Tesla Model 3", "Hyundai Sonata"]

    const colors = ["Black", "White", "Silver", "Blue", "Red"]

    // Get a default location (New York City)
    const centerLocation = { latitude: 40.7128, longitude: -74.006 }

    // Generate random drivers
    for (let i = 0; i < count; i++) {
      const location = getRandomCoordinate(centerLocation, 2) // Within 2km
      const rating = (3.5 + Math.random() * 1.5).toFixed(1) // Rating between 3.5 and 5.0

      mockDrivers.push({
        id: "mock-driver-" + (i + 1),
        name: names[i],
        vehicle: vehicles[i],
        color: colors[i % colors.length],
        rating: rating,
        location: location,
        distance: calculateDistance(centerLocation, location).toFixed(1),
        eta: getRandomNumber(3, 15), // ETA in minutes
      })
    }

    return mockDrivers
  }

  /**
   * Discover driver peers
   * @returns {Promise} - Promise that resolves with an array of driver peer IDs
   */
  async discoverDriverPeers() {
    // In a real application, you would use a signaling server to discover peers
    // For this demo, we'll check if we're in a test environment with ourselves as driver
    if (this.peer && this.isDriver) {
      console.log("Test environment detected, returning self as driver")
      return [this.peerId]
    }

    // For this demo, we'll use a local discovery approach
    // In a real app, you would query a server for online drivers

    // Check if there are any other peers in the same browser session
    // This is a simple way to test P2P without a signaling server
    const localPeers = []

    // If we're in a test environment, try to find our own driver peer
    if (localStorage.getItem("driverData")) {
      try {
        const driverData = JSON.parse(localStorage.getItem("driverData"))
        if (driverData && driverData.peerId) {
          localPeers.push(driverData.peerId)
        }
      } catch (e) {
        console.error("Error parsing local driver data:", e)
      }
    }

    // If we found local peers, use them
    if (localPeers.length > 0) {
      return localPeers
    }

    // Otherwise, simulate 3-5 random driver peers
    const numDrivers = Math.floor(Math.random() * 3) + 3
    const driverPeers = []

    for (let i = 0; i < numDrivers; i++) {
      const randomId = Math.random().toString(36).substring(2, 10)
      driverPeers.push(CONFIG.p2p.driverPrefix + randomId)
    }

    return driverPeers
  }

  /**
   * Clean up P2P resources
   */
  cleanup() {
    // Stop broadcasting location
    this.stopLocationBroadcast()

    // Close all connections
    Object.values(this.connections).forEach((conn) => {
      conn.close()
    })

    // Close the peer connection
    if (this.peer) {
      this.peer.destroy()
    }

    // Reset state
    this.peer = null
    this.peerId = null
    this.connections = {}
    this.isConnected = false
    this.onlineDrivers = {}
  }
}

// Create a global instance of the P2P communication manager
const p2pManager = new P2PCommunicationManager()

/************************************
 * DRIVER REGISTRATION
 ************************************/

class DriverRegistration {
  constructor() {
    this.driverData = null
    this.isOnline = true
    this.rememberMe = false
    this.form = null
    this.onlineStatusElement = null
    this.onlineStatusTextElement = null
    this.p2pInitialized = false
  }

  /**
   * Initialize the driver registration functionality
   */
  init() {
    // Get DOM elements
    this.form = document.getElementById("driver-registration-form")
    this.onlineStatusElement = document.querySelector(".online-status")
    this.onlineStatusTextElement = document.querySelector(".driver-status span:last-child")

    // Set up event listeners
    this.setupEventListeners()

    // Load driver data if available
    this.loadDriverData()

    // Set initial online status
    this.updateOnlineStatus(true)

    // Set up online status detection
    this.setupOnlineStatusDetection()
  }

  /**
   * Set up event listeners for the sidebar and form
   */
  setupEventListeners() {
    // Sidebar toggle
    document.getElementById("sidebar-toggle").addEventListener("click", () => {
      document.getElementById("sidebar").classList.add("open")
    })

    // Close sidebar
    document.getElementById("close-sidebar").addEventListener("click", () => {
      document.getElementById("sidebar").classList.remove("open")
    })

    // Form submission
    if (this.form) {
      this.form.addEventListener("submit", (e) => {
        e.preventDefault()
        this.saveDriverData()
      })
    }

    // Remember me checkbox
    const rememberMeCheckbox = document.getElementById("remember-me")
    if (rememberMeCheckbox) {
      rememberMeCheckbox.addEventListener("change", (e) => {
        this.rememberMe = e.target.checked
      })

      // Set initial state from localStorage
      const savedRememberMe = localStorage.getItem("driverRememberMe")
      if (savedRememberMe) {
        rememberMeCheckbox.checked = savedRememberMe === "true"
        this.rememberMe = rememberMeCheckbox.checked
      }
    }

    // Driver status toggle in dashboard
    const driverStatusToggle = document.getElementById("driver-status-toggle")
    if (driverStatusToggle) {
      driverStatusToggle.addEventListener("click", () => {
        this.toggleOnlineStatus()
      })
    }
  }

  /**
   * Toggle the driver's online status
   */
  toggleOnlineStatus() {
    this.updateOnlineStatus(!this.isOnline)

    // Update the driver status toggle button
    const statusToggle = document.getElementById("driver-status-toggle")
    const statusText = document.getElementById("driver-status-text")
    const statusIndicator = statusToggle.querySelector(".online-status")

    if (this.isOnline) {
      statusIndicator.classList.add("online")
      statusIndicator.classList.remove("offline")
      statusText.textContent = "Online"
    } else {
      statusIndicator.classList.remove("online")
      statusIndicator.classList.add("offline")
      statusText.textContent = "Offline"
    }
  }

  /**
   * Set up online status detection
   */
  setupOnlineStatusDetection() {
    // Update online status when page visibility changes
    document.addEventListener("visibilitychange", () => {
      this.updateOnlineStatus(!document.hidden)
    })

    // Update online status when window is focused/blurred
    window.addEventListener("focus", () => {
      this.updateOnlineStatus(true)
    })

    window.addEventListener("blur", () => {
      this.updateOnlineStatus(false)
    })

    // Set offline status when page is about to unload
    window.addEventListener("beforeunload", () => {
      this.updateOnlineStatus(false)
    })

    // Set online status when page is loaded
    window.addEventListener("load", () => {
      this.updateOnlineStatus(true)
    })

    // Handle network status changes
    window.addEventListener("online", () => {
      this.updateOnlineStatus(true)
    })

    window.addEventListener("offline", () => {
      this.updateOnlineStatus(false)
    })
  }

  /**
   * Update the driver's online status
   * @param {boolean} isOnline - Whether the driver is online
   */
  updateOnlineStatus(isOnline) {
    this.isOnline = isOnline

    if (this.onlineStatusElement) {
      if (isOnline) {
        this.onlineStatusElement.classList.add("online")
        this.onlineStatusElement.classList.remove("offline")
        this.onlineStatusTextElement.textContent = "You are currently online"
      } else {
        this.onlineStatusElement.classList.remove("online")
        this.onlineStatusElement.classList.add("offline")
        this.onlineStatusTextElement.textContent = "You are currently offline"
      }
    }

    // Save online status if driver data exists
    if (this.driverData) {
      this.driverData.isOnline = isOnline
      this.saveDriverDataToStorage()
    }

    // Update P2P status if we're a driver
    if (this.driverData && this.p2pInitialized) {
      if (isOnline) {
        // Start broadcasting location
        p2pManager.startLocationBroadcast(this.driverData)
      } else {
        // Stop broadcasting location
        p2pManager.stopLocationBroadcast()
      }
    }
  }

  /**
   * Save driver data from the form
   */
  async saveDriverData() {
    try {
      // Get current location first
      const location = await locationTracker.getCurrentLocation()

      const name = document.getElementById("driver-name").value
      const carType = document.getElementById("car-type").value
      const carColor = document.getElementById("car-color").value
      const city = document.getElementById("driver-city").value
      const rememberMe = document.getElementById("remember-me").checked

      this.driverData = {
        name,
        carType,
        carColor,
        city,
        location, // Include the current location
        isOnline: this.isOnline,
        lastUpdated: new Date().toISOString(),
      }

      this.rememberMe = rememberMe

      // Save to storage
      this.saveDriverDataToStorage()

      // Initialize P2P as a driver if not already initialized
      if (!this.p2pInitialized && CONFIG.p2p.enabled) {
        try {
          const peerId = await p2pManager.init(true, this.driverData)
          this.p2pInitialized = true

          // Store the peer ID in driver data
          this.driverData.peerId = peerId
          this.saveDriverDataToStorage()

          showNotification("P2P connection established. You are now visible to passengers.", "success")
        } catch (error) {
          console.error("Error initializing P2P:", error)
          showNotification("Error establishing P2P connection. Using simulated mode.", "info")
        }
      } else if (this.isOnline) {
        // If already initialized and online, start broadcasting location
        p2pManager.startLocationBroadcast(this.driverData)
      }

      // Show success notification
      showNotification("Driver information saved successfully!", "success")

      // Close sidebar
      document.getElementById("sidebar").classList.remove("open")

      // Show driver dashboard
      showScreen("driver-dashboard-screen")

      // Initialize driver map
      this.initializeDriverMap()
    } catch (error) {
      console.error("Error getting location:", error)
      showNotification("Could not get your location. Please check your location permissions.", "error")
    }
  }

  /**
   * Initialize the driver map
   */
  initializeDriverMap() {
    locationTracker.getCurrentLocation().then((location) => {
      const driverMap = mapManager.initializeMap("driver-map")
      mapManager.setView("driver-map", location)

      // Add driver marker
      mapManager.addMarker("driver-map", "driver", location, {
        color: CONFIG.map.driverMarkerColor,
        popup: "Your Location",
        openPopup: true,
      })

      // Start tracking location for the map
      locationTracker.startTracking((locationData) => {
        // Update driver marker
        mapManager.updateMarkerPosition("driver-map", "driver", locationData.currentPosition)
      })
    })
  }

  /**
   * Save driver data to localStorage or sessionStorage
   */
  saveDriverDataToStorage() {
    if (!this.driverData) return

    // Save remember me preference to localStorage
    localStorage.setItem("driverRememberMe", this.rememberMe.toString())

    if (this.rememberMe) {
      // Save to localStorage for persistence across sessions
      localStorage.setItem("driverData", JSON.stringify(this.driverData))
    } else {
      // Save to sessionStorage for current session only
      sessionStorage.setItem("driverData", JSON.stringify(this.driverData))
      // Clear localStorage to avoid conflicts
      localStorage.removeItem("driverData")
    }
  }

  /**
   * Load driver data from storage
   */
  async loadDriverData() {
    // Check if remember me was set
    const savedRememberMe = localStorage.getItem("driverRememberMe")
    if (savedRememberMe) {
      this.rememberMe = savedRememberMe === "true"

      // Update checkbox
      const rememberMeCheckbox = document.getElementById("remember-me")
      if (rememberMeCheckbox) {
        rememberMeCheckbox.checked = this.rememberMe
      }
    }

    // Try to load from localStorage first (for remembered data)
    let driverData = localStorage.getItem("driverData")

    // If not found and not using remember me, try sessionStorage
    if (!driverData && !this.rememberMe) {
      driverData = sessionStorage.getItem("driverData")
    }

    if (driverData) {
      try {
        this.driverData = JSON.parse(driverData)

        // Fill the form with the loaded data
        this.fillFormWithDriverData()

        // Initialize P2P as a driver if P2P is enabled
        if (CONFIG.p2p.enabled) {
          try {
            await p2pManager.init(true, this.driverData)
            this.p2pInitialized = true
            showNotification("P2P connection established. You are now visible to passengers.", "success")
          } catch (error) {
            console.error("Error initializing P2P:", error)
            showNotification("Error establishing P2P connection. Using simulated mode.", "info")
          }
        }

        // Show notification
        showNotification("Driver information loaded", "info")
      } catch (error) {
        console.error("Error parsing driver data:", error)
      }
    }
  }

  /**
   * Fill the form with the loaded driver data
   */
  fillFormWithDriverData() {
    if (!this.driverData) return

    document.getElementById("driver-name").value = this.driverData.name || ""
    document.getElementById("car-type").value = this.driverData.carType || ""
    document.getElementById("car-color").value = this.driverData.carColor || ""
    document.getElementById("driver-city").value = this.driverData.city || ""
  }

  /**
   * Get the current driver data
   * @returns {Object|null} - The driver data or null if not available
   */
  getDriverData() {
    return this.driverData
  }

  /**
   * Check if the driver is online
   * @returns {boolean} - Whether the driver is online
   */
  isDriverOnline() {
    return this.isOnline
  }

  /**
   * Check if this user is registered as a driver
   * @returns {boolean} - Whether this user is a driver
   */
  isDriver() {
    return this.driverData !== null
  }
}

// Create a global instance of the driver registration
const driverRegistration = new DriverRegistration()

/************************************
 * UTILITY FUNCTIONS
 ************************************/

/**
 * Shows a specific screen and hides all others
 * @param {string} screenId - The ID of the screen to show
 */
function showScreen(screenId) {
  // Hide all screens
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active")
  })

  // Show the requested screen
  document.getElementById(screenId).classList.add("active")
}

/**
 * Formats a number to have 2 decimal places
 * @param {number} number - The number to format
 * @returns {string} - The formatted number
 */
function formatDecimal(number) {
  return number.toFixed(2)
}

/**
 * Formats a number as currency
 * @param {number} amount - The amount to format
 * @returns {string} - The formatted currency string
 */
function formatCurrency(amount) {
  return CONFIG.fare.currency + formatDecimal(amount)
}

/**
 * Formats time in minutes and seconds
 * @param {number} seconds - Total seconds
 * @returns {string} - Formatted time string (MM:SS)
 */
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`
}

/**
 * Calculates the distance between two coordinates in kilometers
 * @param {Object} coord1 - First coordinate {latitude, longitude}
 * @param {Object} coord2 - Second coordinate {latitude, longitude}
 * @returns {number} - Distance in kilometers
 */
function calculateDistance(coord1, coord2) {
  if (!coord1 || !coord2) return 0

  const R = 6371 // Earth's radius in km
  const dLat = toRadians(coord2.latitude - coord1.latitude)
  const dLon = toRadians(coord2.longitude - coord1.longitude)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(coord1.latitude)) *
      Math.cos(toRadians(coord2.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Converts degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} - Angle in radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180)
}

/**
 * Generates a random number between min and max (inclusive)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Random number
 */
function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Generates a random coordinate within a certain radius of a center point
 * @param {Object} center - Center coordinate {latitude, longitude}
 * @param {number} radiusKm - Radius in kilometers
 * @returns {Object} - Random coordinate {latitude, longitude}
 */
function getRandomCoordinate(center, radiusKm) {
  const radiusInDegrees = radiusKm / 111 // Rough approximation: 1 degree ~ 111 km

  const randomAngle = Math.random() * 2 * Math.PI
  const randomRadius = Math.random() * radiusInDegrees

  const offsetLat = randomRadius * Math.cos(randomAngle)
  const offsetLon = (randomRadius * Math.sin(randomAngle)) / Math.cos(toRadians(center.latitude))

  return {
    latitude: center.latitude + offsetLat,
    longitude: center.longitude + offsetLon,
  }
}

/**
 * Creates a QR code for sharing ride details
 * @param {Object} rideDetails - Details of the ride
 * @returns {string} - URL for sharing
 */
function createShareableLink(rideDetails) {
  const baseUrl = window.location.origin + window.location.pathname
  const params = new URLSearchParams({
    distance: rideDetails.distance,
    time: rideDetails.time,
    fare: rideDetails.fare,
  })

  return `${baseUrl}?share=${btoa(params.toString())}`
}

/**
 * Shows a notification to the user
 * @param {string} message - The message to display
 * @param {string} type - The type of notification (success, error, info)
 */
function showNotification(message, type = "info") {
  // Create notification element if it doesn't exist
  let notification = document.querySelector(".notification")
  if (!notification) {
    notification = document.createElement("div")
    notification.className = "notification"
    document.body.appendChild(notification)
  }

  // Set notification content and type
  notification.textContent = message
  notification.className = `notification ${type}`

  // Show notification
  notification.style.display = "block"

  // Hide after 3 seconds
  setTimeout(() => {
    notification.style.display = "none"
  }, 3000)
}

// Add notification styles
const notificationStyle = document.createElement("style")
notificationStyle.textContent = `
  .notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 5px;
    color: white;
    font-weight: bold;
    z-index: 1000;
    display: none;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    animation: slideIn 0.3s ease-out;
  }
  
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  
  .notification.success {
    background-color: #2ecc71;
  }
  
  .notification.error {
    background-color: #e74c3c;
  }
  
  .notification.info {
    background-color: #3498db;
  }
`
document.head.appendChild(notificationStyle)

/************************************
 * LOCATION TRACKER
 ************************************/

class LocationTracker {
  constructor() {
    this.currentPosition = null
    this.previousPosition = null
    this.watchId = null
    this.locationHistory = []
    this.totalDistance = 0
    this.isTracking = false
    this.onLocationUpdate = null
    this.simulationInterval = null
  }

  /**
   * Start tracking the user's location
   * @param {Function} callback - Function to call when location is updated
   */
  startTracking(callback) {
    this.onLocationUpdate = callback
    this.isTracking = true

    if (CONFIG.location.useSimulation) {
      this.startSimulation()
    } else {
      this.startRealTracking()
    }
  }

  /**
   * Start real GPS tracking using the browser's geolocation API
   */
  startRealTracking() {
    if (!navigator.geolocation) {
      showNotification("Geolocation is not supported by your browser", "error")
      return
    }

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.updatePosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      (error) => {
        this.handleLocationError(error)
      },
      {
        enableHighAccuracy: true,
      },
    )

    // Start watching position
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        this.updatePosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      (error) => {
        this.handleLocationError(error)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000,
      },
    )
  }

  /**
   * Start simulated movement (for testing without GPS)
   */
  startSimulation() {
    // Generate a random starting position if none exists
    if (!this.currentPosition) {
      // Use a default location (New York City)
      const defaultLocation = { latitude: 40.7128, longitude: -74.006 }
      this.updatePosition(defaultLocation)
    }

    // Simulate movement at regular intervals
    this.simulationInterval = setInterval(() => {
      if (!this.isTracking) return

      // Create a small random movement
      const newPosition = {
        latitude: this.currentPosition.latitude + (Math.random() - 0.5) * 0.001 * CONFIG.location.simulationSpeed,
        longitude: this.currentPosition.longitude + (Math.random() - 0.5) * 0.001 * CONFIG.location.simulationSpeed,
      }

      this.updatePosition(newPosition)
    }, CONFIG.location.trackingInterval)
  }

  /**
   * Update the current position and calculate distance
   * @param {Object} position - New position {latitude, longitude}
   */
  updatePosition(position) {
    if (!this.isTracking) return

    this.previousPosition = this.currentPosition
    this.currentPosition = position
    this.locationHistory.push(position)

    // Calculate distance if we have a previous position
    if (this.previousPosition) {
      const segmentDistance = calculateDistance(this.previousPosition, this.currentPosition)

      // Only count movement if it's significant (to filter out GPS jitter)
      if (segmentDistance > 0.005) {
        // More than 5 meters
        this.totalDistance += segmentDistance
      }
    }

    // Call the update callback if provided
    if (this.onLocationUpdate) {
      this.onLocationUpdate({
        currentPosition: this.currentPosition,
        totalDistance: this.totalDistance,
        locationHistory: this.locationHistory,
      })
    }
  }

  /**
   * Stop tracking the user's location
   */
  stopTracking() {
    this.isTracking = false

    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }

    if (this.simulationInterval) {
      clearInterval(this.simulationInterval)
      this.simulationInterval = null
    }
  }

  /**
   * Reset the tracker
   */
  reset() {
    this.stopTracking()
    this.currentPosition = null
    this.previousPosition = null
    this.locationHistory = []
    this.totalDistance = 0
  }

  /**
   * Handle location errors
   * @param {Object} error - Error object from geolocation API
   */
  handleLocationError(error) {
    let message
    switch (error.code) {
      case error.PERMISSION_DENIED:
        message = "User denied the request for geolocation."
        break
      case error.POSITION_UNAVAILABLE:
        message = "Location information is unavailable."
        break
      case error.TIMEOUT:
        message = "The request to get user location timed out."
        break
      default:
        message = "An unknown error occurred."
        break
    }
    showNotification(message, "error")

    // Fall back to simulation mode if real tracking fails
    if (!CONFIG.location.useSimulation) {
      CONFIG.location.useSimulation = true
      this.startSimulation()
    }
  }

  /**
   * Get the current location
   * @returns {Promise} - Promise that resolves with the current location
   */
  getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (this.currentPosition) {
        resolve(this.currentPosition)
        return
      }

      // Always try to get real location first, regardless of simulation setting
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }
            // Store this as the current position
            this.currentPosition = location
            resolve(location)
          },
          (error) => {
            console.error("Geolocation error:", error)

            // Fall back to simulation if real tracking fails
            if (!CONFIG.location.useSimulation) {
              CONFIG.location.useSimulation = true
              showNotification("Could not access your location. Using simulated location.", "info")
            }

            // Use a default location (New York City)
            const defaultLocation = { latitude: 40.7128, longitude: -74.006 }
            resolve(defaultLocation)
          },
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          },
        )
      } else {
        // Geolocation not supported
        console.error("Geolocation not supported")
        showNotification("Your browser doesn't support geolocation. Using simulated location.", "info")

        // Use a default location (New York City)
        const defaultLocation = { latitude: 40.7128, longitude: -74.006 }
        resolve(defaultLocation)
      }
    })
  }
}

// Create a global instance of the location tracker
const locationTracker = new LocationTracker()

/************************************
 * FARE CALCULATOR
 ************************************/

class FareCalculator {
  constructor() {
    this.baseFare = CONFIG.fare.baseFare
    this.perKilometer = CONFIG.fare.perKilometer
    this.perMinute = CONFIG.fare.perMinute
    this.startTime = null
    this.elapsedSeconds = 0
    this.distance = 0
    this.timerInterval = null
  }

  /**
   * Start the fare calculation
   */
  start() {
    this.startTime = new Date()
    this.elapsedSeconds = 0

    // Update the timer every second
    this.timerInterval = setInterval(() => {
      if (this.startTime) {
        const now = new Date()
        this.elapsedSeconds = Math.floor((now - this.startTime) / 1000)
      }
    }, 1000)
  }

  /**
   * Stop the fare calculation
   */
  stop() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval)
      this.timerInterval = null
    }
  }

  /**
   * Reset the fare calculator
   */
  reset() {
    this.stop()
    this.startTime = null
    this.elapsedSeconds = 0
    this.distance = 0
  }

  /**
   * Update the distance traveled
   * @param {number} distance - Total distance in kilometers
   */
  updateDistance(distance) {
    this.distance = distance
  }

  /**
   * Calculate the current fare
   * @returns {Object} - Fare breakdown
   */
  calculateFare() {
    const minutes = this.elapsedSeconds / 60

    const distanceCharge = this.distance * this.perKilometer
    const timeCharge = minutes * this.perMinute
    const totalFare = this.baseFare + distanceCharge + timeCharge

    return {
      baseFare: this.baseFare,
      distanceCharge: distanceCharge,
      timeCharge: timeCharge,
      totalFare: totalFare,
      distance: this.distance,
      time: this.elapsedSeconds,
    }
  }

  /**
   * Get the elapsed time in formatted string (MM:SS)
   * @returns {string} - Formatted time
   */
  getFormattedTime() {
    return formatTime(this.elapsedSeconds)
  }

  /**
   * Update fare settings
   * @param {Object} settings - New fare settings
   */
  updateSettings(settings) {
    if (settings.baseFare !== undefined) this.baseFare = settings.baseFare
    if (settings.perKilometer !== undefined) this.perKilometer = settings.perKilometer
    if (settings.perMinute !== undefined) this.perMinute = settings.perMinute
  }
}

// Create a global instance of the fare calculator
const fareCalculator = new FareCalculator()

/************************************
 * CODE MANAGER
 ************************************/

class CodeManager {
  constructor() {
    this.userCode = null
    this.driverCode = null
    this.codeLength = CONFIG.code.length
    this.expiryTime = CONFIG.code.expiryTime
    this.codeGenerationTime = null
  }

  /**
   * Generate a new random code
   * @returns {string} - Generated code
   */
  generateCode() {
    let code = ""
    for (let i = 0; i < this.codeLength; i++) {
      code += Math.floor(Math.random() * 10).toString()
    }
    return code
  }

  /**
   * Generate a new user code
   * @returns {string} - Generated user code
   */
  generateUserCode() {
    this.userCode = this.generateCode()
    this.codeGenerationTime = new Date()
    return this.userCode
  }

  /**
   * Generate a driver code for a specific user
   * @param {string} userCode - The user's code
   * @returns {string} - Generated driver code
   */
  generateDriverCode(userCode) {
    // In a real app, this would be generated on the server
    // and associated with the specific user code
    this.driverCode = this.generateCode()
    return this.driverCode
  }

  /**
   * Verify if the entered driver code matches the expected one
   * @param {string} enteredCode - Code entered by the user
   * @returns {boolean} - Whether the code is valid
   */
  verifyDriverCode(enteredCode) {
    // Check if code has expired
    if (this.isCodeExpired()) {
      return false
    }

    // In a real app, this verification would happen on the server
    return enteredCode === this.driverCode
  }

  /**
   * Check if the code has expired
   * @returns {boolean} - Whether the code has expired
   */
  isCodeExpired() {
    if (!this.codeGenerationTime) return true

    const now = new Date()
    const elapsed = now - this.codeGenerationTime
    return elapsed > this.expiryTime
  }

  /**
   * Reset all codes
   */
  resetCodes() {
    this.userCode = null
    this.driverCode = null
    this.codeGenerationTime = null
  }
}

// Create a global instance of the code manager
const codeManager = new CodeManager()

// Set up event listener to reset code when page is closed/refreshed
window.addEventListener("beforeunload", () => {
  codeManager.resetCodes()
})

/************************************
 * DRIVERS MANAGER
 ************************************/

class DriversManager {
  constructor() {
    this.drivers = []
    this.selectedDriver = null
  }

  /**
   * Initialize with real P2P drivers or mock drivers if none available
   * @param {Object} centerLocation - Center location {latitude, longitude}
   * @param {Function} callback - Function to call when drivers are initialized
   */
  async initializeDrivers(centerLocation, callback) {
    // First try to get real drivers via P2P
    try {
      // Initialize P2P as a passenger if not already a driver
      if (!driverRegistration.isDriver()) {
        await p2pManager.init(false)
      }

      // Find online drivers
      p2pManager.findOnlineDrivers((onlineDrivers) => {
        if (onlineDrivers && onlineDrivers.length > 0) {
          // Process real drivers
          this.drivers = onlineDrivers.map((driver) => {
            return {
              id: driver.peerId || driver.id,
              name: driver.name || "Unknown Driver",
              vehicle: driver.carType || driver.vehicle || "Unknown Vehicle",
              color: driver.carColor || driver.color || "Unknown Color",
              rating: driver.rating || (3.5 + Math.random() * 1.5).toFixed(1), // Random rating between 3.5 and 5.0
              location: driver.location || getRandomCoordinate(centerLocation, 2),
              distance:
                driver.distance ||
                calculateDistance(centerLocation, driver.location || getRandomCoordinate(centerLocation, 2)).toFixed(1),
              eta: driver.eta || getRandomNumber(3, 15), // Random ETA in minutes
              peerId: driver.peerId || driver.id,
            }
          })

          // Sort by distance
          this.drivers.sort((a, b) => Number.parseFloat(a.distance) - Number.parseFloat(b.distance))

          // Call the callback with the drivers
          callback(this.drivers)
        } else {
          // Fall back to mock drivers if no real drivers found
          this.generateMockDrivers(centerLocation, callback)
        }
      })
    } catch (error) {
      console.error("Error initializing P2P:", error)
      showNotification("Using simulated drivers.", "info")

      // Fall back to mock drivers
      this.generateMockDrivers(centerLocation, callback)
    }
  }

  /**
   * Generate mock drivers around a location
   * @param {Object} centerLocation - Center location {latitude, longitude}
   * @param {Function} callback - Function to call when drivers are generated
   */
  generateMockDrivers(centerLocation, callback) {
    const count = 5 // Number of mock drivers to generate
    this.drivers = []

    const names = [
      "Mamo Kimith",
      "Maria Garcia",
      "Chombe Kim",
      "Sarah Nega",
      "Ahmed Hassan",
      "Bini Bariyaw",
      "Carlos Rodriguez",
      "Emma Wilson",
      "Liu Wei",
      "Fatima Ali",
    ]

    const vehicles = [
      "Toyota Camry",
      "Honda Civic",
      "Ford Focus",
      "Tesla Model 3",
      "Hyundai Sonata",
      "Chevrolet Malibu",
      "Nissan Altima",
      "BMW 3 Series",
      "Mercedes C-Class",
      "Audi A4",
    ]

    const colors = ["Black", "White", "Silver", "Blue", "Red"]

    // Generate random drivers
    for (let i = 0; i < count; i++) {
      const nameIndex = getRandomNumber(0, names.length - 1)
      const vehicleIndex = getRandomNumber(0, vehicles.length - 1)
      const colorIndex = getRandomNumber(0, colors.length - 1)

      const location = getRandomCoordinate(centerLocation, 2) // Within 2km
      const rating = (3.5 + Math.random() * 1.5).toFixed(1) // Rating between 3.5 and 5.0

      this.drivers.push({
        id: "driver-" + (i + 1),
        name: names[nameIndex],
        vehicle: vehicles[vehicleIndex],
        color: colors[colorIndex],
        rating: rating,
        location: location,
        distance: calculateDistance(centerLocation, location).toFixed(1),
        eta: getRandomNumber(3, 15), // ETA in minutes
      })
    }

    // Sort by distance
    this.drivers.sort((a, b) => Number.parseFloat(a.distance) - Number.parseFloat(b.distance))

    // Call the callback with the drivers
    callback(this.drivers)
  }

  /**
   * Select a driver
   * @param {string} driverId - ID of the driver to select
   * @returns {Object} - Selected driver
   */
  selectDriver(driverId) {
    this.selectedDriver = this.drivers.find((driver) => driver.id === driverId)
    return this.selectedDriver
  }

  /**
   * Get the selected driver
   * @returns {Object} - Selected driver
   */
  getSelectedDriver() {
    return this.selectedDriver
  }

  /**
   * Generate a driver code for the selected driver
   * @returns {string} - Generated driver code
   */
  generateDriverCode() {
    if (!this.selectedDriver) return null

    // In a real app, this would be generated on the server
    // and sent to the driver's device
    return codeManager.generateDriverCode(this.selectedDriver.id)
  }

  /**
   * Update driver locations (for simulation)
   * @param {Object} userLocation - User's current location
   */
  updateDriverLocations(userLocation) {
    if (!this.selectedDriver || !userLocation) return

    // Move the selected driver closer to the user
    const driver = this.selectedDriver
    const moveFactor = 0.3 // How much to move toward user (0-1)

    driver.location = {
      latitude: driver.location.latitude + (userLocation.latitude - driver.location.latitude) * moveFactor,
      longitude: driver.location.longitude + (userLocation.longitude - driver.location.longitude) * moveFactor,
    }

    driver.distance = calculateDistance(userLocation, driver.location).toFixed(1)
  }

  /**
   * Send a ride request to a driver
   * @param {string} driverId - ID of the driver
   * @param {Object} requestData - Ride request data
   */
  sendRideRequest(driverId) {
    const driver = this.drivers.find((d) => d.id === driverId)
    if (!driver || !driver.peerId) {
      showNotification("Cannot connect to driver", "error")
      return
    }

    // Get current location
    locationTracker.getCurrentLocation().then((location) => {
      // Create request data
      const requestData = {
        passengerName: "Anonymous Passenger",
        location: location,
        distance: driver.distance,
        timestamp: new Date().toISOString(),
      }

      // Send request via P2P
      p2pManager.sendRideRequest(driver.peerId, requestData)

      showNotification("Ride request sent to driver", "info")
    })
  }
}

// Create a global instance of the drivers manager
const driversManager = new DriversManager()

/************************************
 * MAP MANAGER
 ************************************/

class MapManager {
  constructor() {
    this.maps = {}
    this.markers = {}
    this.routes = {}
  }

  /**
   * Initialize a map in a container
   * @param {string} containerId - ID of the container element
   * @param {Object} options - Map options
   * @returns {Object} - The created map
   */
  initializeMap(containerId, options = {}) {
    const container = document.getElementById(containerId)
    if (!container) return null

    // Create the map
    const map = L.map(containerId, {
      zoomControl: options.zoomControl !== undefined ? options.zoomControl : true,
      attributionControl: true,
    })

    // Add the tile layer
    L.tileLayer(CONFIG.map.tileLayer, {
      attribution: CONFIG.map.attribution,
      maxZoom: 19,
    }).addTo(map)

    // Store the map
    this.maps[containerId] = map
    this.markers[containerId] = {}
    this.routes[containerId] = {}

    return map
  }

  /**
   * Set the view of a map
   * @param {string} mapId - ID of the map
   * @param {Object} center - Center coordinates {latitude, longitude}
   * @param {number} zoom - Zoom level
   */
  setView(mapId, center, zoom = CONFIG.map.defaultZoom) {
    const map = this.maps[mapId]
    if (!map) return

    map.setView([center.latitude, center.longitude], zoom)
  }

  /**
   * Add a marker to a map
   * @param {string} mapId - ID of the map
   * @param {string} markerId - ID for the marker
   * @param {Object} position - Marker position {latitude, longitude}
   * @param {Object} options - Marker options
   * @returns {Object} - The created marker
   */
  addMarker(mapId, markerId, position, options = {}) {
    const map = this.maps[mapId]
    if (!map) return null

    // Remove existing marker with same ID
    if (this.markers[mapId][markerId]) {
      map.removeLayer(this.markers[mapId][markerId])
    }

    // Create marker options
    const markerOptions = {
      icon: options.icon || this.createDefaultIcon(options.color || CONFIG.map.userMarkerColor),
    }

    // Create and add the marker
    const marker = L.marker([position.latitude, position.longitude], markerOptions).addTo(map)

    // Add popup if provided
    if (options.popup) {
      marker.bindPopup(options.popup)
      if (options.openPopup) {
        marker.openPopup()
      }
    }

    // Store the marker
    this.markers[mapId][markerId] = marker

    return marker
  }

  /**
   * Update a marker's position
   * @param {string} mapId - ID of the map
   * @param {string} markerId - ID of the marker
   * @param {Object} position - New position {latitude, longitude}
   */
  updateMarkerPosition(mapId, markerId, position) {
    const marker = this.markers[mapId][markerId]
    if (!marker) return

    marker.setLatLng([position.latitude, position.longitude])
  }

  /**
   * Create a default marker icon
   * @param {string} color - Color for the icon
   * @returns {Object} - Leaflet icon
   */
  createDefaultIcon(color) {
    return L.divIcon({
      className: "custom-marker",
      html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    })
  }

  /**
   * Draw a route between points
   * @param {string} mapId - ID of the map
   * @param {string} routeId - ID for the route
   * @param {Array} points - Array of points [{latitude, longitude}, ...]
   * @param {Object} options - Route options
   */
  drawRoute(mapId, routeId, points, options = {}) {
    const map = this.maps[mapId]
    if (!map || !points || points.length < 2) return

    // Remove existing route with same ID
    if (this.routes[mapId][routeId]) {
      map.removeLayer(this.routes[mapId][routeId])
    }

    // Convert points to Leaflet format
    const latLngs = points.map((point) => [point.latitude, point.longitude])

    // Create route options
    const routeOptions = {
      color: options.color || CONFIG.map.routeColor,
      weight: options.weight || 4,
      opacity: options.opacity || 0.7,
    }

    // Create and add the route
    const route = L.polyline(latLngs, routeOptions).addTo(map)

    // Store the route
    this.routes[mapId][routeId] = route

    // Fit bounds if requested
    if (options.fitBounds) {
      map.fitBounds(route.getBounds(), { padding: [50, 50] })
    }

    return route
  }

  /**
   * Update a route with new points
   * @param {string} mapId - ID of the map
   * @param {string} routeId - ID of the route
   * @param {Array} points - Array of points [{latitude, longitude}, ...]
   * @param {Object} options - Route options
   */
  updateRoute(mapId, routeId, points, options = {}) {
    // Simply redraw the route with the new points
    return this.drawRoute(mapId, routeId, points, options)
  }

  /**
   * Clear all markers and routes from a map
   * @param {string} mapId - ID of the map
   */
  clearMap(mapId) {
    const map = this.maps[mapId]
    if (!map) return

    // Remove all markers
    Object.values(this.markers[mapId]).forEach((marker) => {
      map.removeLayer(marker)
    })
    this.markers[mapId] = {}

    // Remove all routes
    Object.values(this.routes[mapId]).forEach((route) => {
      map.removeLayer(route)
    })
    this.routes[mapId] = {}
  }

  /**
   * Destroy a map and clean up resources
   * @param {string} mapId - ID of the map
   */
  destroyMap(mapId) {
    const map = this.maps[mapId]
    if (!map) return

    this.clearMap(mapId)
    map.remove()

    delete this.maps[mapId]
    delete this.markers[mapId]
    delete this.routes[mapId]
  }
}

// Create a global instance of the map manager
const mapManager = new MapManager()

/************************************
 * MAIN APPLICATION LOGIC
 ************************************/

/**
 * Initialize the application
 */
function initApp() {
  // Initialize driver registration
  driverRegistration.init()

  // Set up event listeners
  setupEventListeners()

  // Show the splash screen
  showScreen("splash-screen")
}

/**
 * Set up all event listeners
 */
function setupEventListeners() {
  // Splash screen
  document.getElementById("get-started-btn").addEventListener("click", () => {
    // Show user type selection screen
    showScreen("user-type-screen")
  })

  // User type selection screen
  document.getElementById("passenger-btn").addEventListener("click", () => {
    // Generate user code and show code screen
    const userCode = codeManager.generateUserCode()
    document.getElementById("user-code").textContent = userCode
    showScreen("user-code-screen")
  })

  document.getElementById("driver-btn").addEventListener("click", () => {
    // Open driver registration sidebar
    document.getElementById("sidebar").classList.add("open")
  })

  // User code screen
  document.getElementById("reset-code-btn").addEventListener("click", () => {
    const userCode = codeManager.generateUserCode()
    document.getElementById("user-code").textContent = userCode
    showNotification("Code reset successfully", "success")
  })

  document.getElementById("find-driver-btn").addEventListener("click", () => {
    // Initialize drivers and show driver selection screen
    initializeDriverSelection()
  })

  // Driver selection screen
  document.getElementById("back-to-code-btn").addEventListener("click", () => {
    showScreen("user-code-screen")
  })

  // Pairing screen
  document.getElementById("verify-code-btn").addEventListener("click", () => {
    const enteredCode = document.getElementById("driver-code-input").value
    verifyAndStartRide(enteredCode)
  })

  document.getElementById("back-to-drivers-btn").addEventListener("click", () => {
    showScreen("driver-selection-screen")
  })

  // Ride screen
  document.getElementById("end-ride-btn").addEventListener("click", () => {
    endRide()
  })

  // Summary screen
  document.getElementById("share-ride-btn").addEventListener("click", () => {
    shareRide()
  })

  document.getElementById("new-ride-btn").addEventListener("click", () => {
    resetApp()
    showScreen("user-code-screen")
  })

  // Handle driver code input validation
  const driverCodeInput = document.getElementById("driver-code-input")
  driverCodeInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, "").substring(0, 6)
  })
}

// Update the initializeDriverSelection function to show connection status
async function initializeDriverSelection() {
  try {
    // Show loading notification
    showNotification("Finding drivers near you...", "info")

    // Get current location
    const location = await locationTracker.getCurrentLocation()

    // Initialize the map
    const driversMap = mapManager.initializeMap("drivers-map")
    mapManager.setView("drivers-map", location)

    // Add user marker
    mapManager.addMarker("drivers-map", "user", location, {
      popup: "Your Location",
      openPopup: true,
    })

    // Clear previous drivers list
    const driversListElement = document.getElementById("drivers-list")
    driversListElement.innerHTML = `
      <div class="loading-drivers">
        <i class="fas fa-spinner fa-spin"></i>
        <span>Searching for nearby drivers...</span>
      </div>
    `

    // Initialize P2P as a passenger if not already a driver
    let p2pInitialized = false
    if (!driverRegistration.isDriver() && CONFIG.p2p.enabled) {
      try {
        await p2pManager.init(false)
        p2pInitialized = true
      } catch (error) {
        console.error("Error initializing P2P:", error)
        showNotification("P2P connection failed. Using simulated drivers.", "info")
      }
    }

    // Initialize drivers with P2P or mock data
    driversManager.initializeDrivers(location, (drivers) => {
      // Clear loading indicator
      driversListElement.innerHTML = ""

      // Add driver markers to map
      drivers.forEach((driver) => {
        mapManager.addMarker("drivers-map", driver.id, driver.location, {
          color: CONFIG.map.driverMarkerColor,
          popup: `${driver.name}<br>${driver.vehicle}`,
        })
      })

      // Populate drivers list
      if (drivers.length === 0) {
        driversListElement.innerHTML = `
          <div class="no-drivers-message">
            <p>No drivers found nearby. Please try again later.</p>
            <button id="retry-find-drivers" class="primary-btn">Retry</button>
          </div>
        `

        // Add event listener for retry button
        document.getElementById("retry-find-drivers").addEventListener("click", () => {
          initializeDriverSelection()
        })
      } else {
        // Add a message to indicate connection status
        const connectionMessage = document.createElement("div")
        connectionMessage.className = "connection-status-message"

        if (p2pManager.connectionError || !p2pInitialized) {
          connectionMessage.innerHTML = `
            <p class="connection-error"><i class="fas fa-exclamation-triangle"></i> P2P connection failed: ${p2pManager.connectionError || "Could not connect to server"}. Using simulated drivers.</p>
          `
        } else if (!CONFIG.p2p.enabled || !p2pManager.isPeerJSAvailable) {
          connectionMessage.innerHTML = `
            <p class="connection-warning"><i class="fas fa-info-circle"></i> P2P is disabled. Using simulated drivers.</p>
          `
        } else if (Object.keys(p2pManager.onlineDrivers).length === 0) {
          connectionMessage.innerHTML = `
            <p class="connection-warning"><i class="fas fa-info-circle"></i> No real drivers found. Using simulated drivers.</p>
          `
        } else {
          connectionMessage.innerHTML = `
            <p class="connection-success"><i class="fas fa-check-circle"></i> Connected to ${Object.keys(p2pManager.onlineDrivers).length} real drivers.</p>
          `
        }

        driversListElement.appendChild(connectionMessage)

        drivers.forEach((driver) => {
          const driverCard = document.createElement("div")
          driverCard.className = "driver-card"
          driverCard.dataset.driverId = driver.id

          // Add a badge to indicate if this is a real or mock driver
          const badgeClass =
            driver.peerId && !driver.peerId.startsWith("mock") ? "real-driver-badge" : "mock-driver-badge"
          const badgeText = driver.peerId && !driver.peerId.startsWith("mock") ? "Real" : "Simulated"

          driverCard.innerHTML = `
            <div class="driver-avatar">
              <i class="fas fa-user"></i>
            </div>
            <div class="driver-info">
              <div class="driver-name">
                ${driver.name}
                <span class="${badgeClass}">${badgeText}</span>
              </div>
              <div class="driver-details">${driver.vehicle} • ${driver.color}</div>
              <div class="driver-rating">
                <i class="fas fa-star"></i> ${driver.rating}
              </div>
            </div>
            <div class="driver-meta">
              <div>${driver.distance} km</div>
              <div>${driver.eta} min</div>
            </div>
          `

          driverCard.addEventListener("click", () => {
            selectDriver(driver.id)
          })

          driversListElement.appendChild(driverCard)
        })
      }

      // Show success notification
      showNotification(`Found ${drivers.length} drivers near you`, "success")
    })

    showScreen("driver-selection-screen")
  } catch (error) {
    console.error("Error initializing driver selection:", error)
    showNotification("Error getting location. Please try again.", "error")
  }
}

/**
 * Select a driver and proceed to pairing
 * @param {string} driverId - ID of the selected driver
 */
function selectDriver(driverId) {
  const driver = driversManager.selectDriver(driverId)
  if (!driver) return

  // Check if this is a mock driver (no peerId)
  const isMockDriver = !driver.peerId || driver.peerId.startsWith("mock-driver")

  if (isMockDriver) {
    // For mock drivers, generate a code directly
    const driverCode = codeManager.generateDriverCode()

    // Show the code (in a real app, the driver would show this to the user)
    showNotification(`Driver's code: ${driverCode}`, "info")

    // Clear any previous error
    document.getElementById("pairing-error").textContent = ""
    document.getElementById("driver-code-input").value = ""

    // Show pairing screen
    showScreen("pairing-screen")
  } else {
    // For real drivers, send a ride request via P2P
    driversManager.sendRideRequest(driverId)
    showNotification("Sending ride request to driver...", "info")
  }
}

/**
 * Verify the entered code and start the ride
 * @param {string} enteredCode - Code entered by the user
 */
function verifyAndStartRide(enteredCode) {
  const errorElement = document.getElementById("pairing-error")

  // Validate code format
  if (!enteredCode || enteredCode.length !== CONFIG.code.length) {
    errorElement.textContent = "Please enter a valid 6-digit code"
    return
  }

  // Verify the code
  if (!codeManager.verifyDriverCode(enteredCode)) {
    errorElement.textContent = "Invalid or expired code. Please try again."
    return
  }

  // Start the ride
  startRide()
}

/**
 * Start the ride
 */
async function startRide() {
  try {
    // Get the selected driver
    const driver = driversManager.getSelectedDriver()
    if (!driver) {
      showNotification("No driver selected", "error")
      return
    }

    // Display driver info
    const driverInfoElement = document.getElementById("current-driver-info")
    driverInfoElement.innerHTML = `
      <div class="driver-avatar">
        <i class="fas fa-user"></i>
      </div>
      <div>
        <div class="driver-name">${driver.name}</div>
        <div class="driver-details">${driver.vehicle} • ${driver.color}</div>
      </div>
    `

    // Initialize the ride map
    const location = await locationTracker.getCurrentLocation()
    const rideMap = mapManager.initializeMap("ride-map", { zoomControl: false })
    mapManager.setView("ride-map", location)

    // Add markers
    mapManager.addMarker("ride-map", "user", location)
    mapManager.addMarker("ride-map", "driver", driver.location, {
      color: CONFIG.map.driverMarkerColor,
    })

    // Start tracking location
    locationTracker.startTracking(updateRide)

    // Start fare calculation
    fareCalculator.start()

    // Update fare display
    updateFareDisplay()

    // Show the ride screen
    showScreen("ride-screen")
  } catch (error) {
    showNotification("Error starting ride. Please try again.", "error")
  }
}

/**
 * Update the ride with new location data
 */
function updateRide(locationData) {
  // Update user marker
  mapManager.updateMarkerPosition("ride-map", "user", locationData.currentPosition)

  // Update driver position (simulation)
  driversManager.updateDriverLocations(locationData.currentPosition)
  const driver = driversManager.getSelectedDriver()
  if (driver) {
    mapManager.updateMarkerPosition("ride-map", "driver", driver.location)
  }

  // Update route
  if (locationData.locationHistory.length > 1) {
    mapManager.updateRoute("ride-map", "route", locationData.locationHistory, {
      fitBounds: true,
    })
  }

  // Update fare calculation
  fareCalculator.updateDistance(locationData.totalDistance)

  // Update fare display
  updateFareDisplay()
}

/**
 * Update the fare display
 */
function updateFareDisplay() {
  const fare = fareCalculator.calculateFare()

  document.getElementById("distance-value").textContent = formatDecimal(fare.distance) + " km"
  document.getElementById("time-value").textContent = formatTime(fare.time)
  document.getElementById("fare-value").textContent = formatCurrency(fare.totalFare)

  document.getElementById("base-fare-value").textContent = formatCurrency(fare.baseFare)
  document.getElementById("distance-rate-value").textContent = formatCurrency(CONFIG.fare.perKilometer) + "/km"
  document.getElementById("time-rate-value").textContent = formatCurrency(CONFIG.fare.perMinute) + "/min"
}

/**
 * End the current ride
 */
function endRide() {
  // Stop tracking and fare calculation
  locationTracker.stopTracking()
  fareCalculator.stop()

  // Get final fare details
  const finalFare = fareCalculator.calculateFare()

  // Update summary screen
  document.getElementById("summary-distance").textContent = formatDecimal(finalFare.distance) + " km"
  document.getElementById("summary-time").textContent = formatTime(finalFare.time)
  document.getElementById("summary-base-fare").textContent = formatCurrency(finalFare.baseFare)
  document.getElementById("summary-distance-charge").textContent = formatCurrency(finalFare.distanceCharge)
  document.getElementById("summary-time-charge").textContent = formatCurrency(finalFare.timeCharge)
  document.getElementById("summary-total-fare").textContent = formatCurrency(finalFare.totalFare)

  // Show summary screen
  showScreen("summary-screen")
}

/**
 * Share ride details
 */
function shareRide() {
  const finalFare = fareCalculator.calculateFare()

  const rideDetails = {
    distance: formatDecimal(finalFare.distance) + " km",
    time: formatTime(finalFare.time),
    fare: formatCurrency(finalFare.totalFare),
  }

  const shareableLink = createShareableLink(rideDetails)

  // In a real app, this would use the Web Share API or create a QR code
  // For this demo, we'll just show the link
  prompt("Share this link with others:", shareableLink)
}

/**
 * Reset the application state
 */
function resetApp() {
  // Reset all managers
  locationTracker.reset()
  fareCalculator.reset()
  codeManager.resetCodes()

  // Clear maps
  mapManager.destroyMap("drivers-map")
  mapManager.destroyMap("ride-map")
  mapManager.destroyMap("driver-map")

  // Generate new user code
  const userCode = codeManager.generateUserCode()
  document.getElementById("user-code").textContent = userCode
}
