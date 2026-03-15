const mediasoup = require('mediasoup');
const os = require('os');

// Detect the machine's local-network IPv4 address (first non-internal).
// Used as announcedIp fallback so LAN devices can reach the SFU.
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1'; // ultimate fallback
}
const LOCAL_IP = getLocalIp();

// Store: worker + per-session routers
let worker = null;
const routers = {}; // { sessionId: router }
const transports = {}; // { transportId: transport }
const sessionTransports = {}; // { sessionId: [transportIds] }
const sessionProducers = {}; // { sessionId: [{ id, userId, kind }] }

// Media codecs supported
const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
];

/**
 * initWorker — creates the mediasoup worker on server startup
 * Called once from server.js.
 */
async function initWorker() {
  try {
    worker = await mediasoup.createWorker({
      logLevel: 'warn',
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
    });

    worker.on('died', () => {
      console.error('❌ Mediasoup worker died, restarting...');
      setTimeout(() => initWorker(), 2000);
    });

    console.log(`✅ Mediasoup worker created (pid: ${worker.pid})`);
  } catch (err) {
    console.error('❌ Failed to create mediasoup worker:', err.message);
    // Don't crash the server — mediasoup might not be available
  }
}

/**
 * createRouter — creates a mediasoup router for a session
 * One router per active classroom.
 */
async function createRouter(sessionId) {
  if (routers[sessionId]) return routers[sessionId];

  if (!worker) {
    throw new Error('Mediasoup worker not initialized');
  }

  const router = await worker.createRouter({ mediaCodecs });
  routers[sessionId] = router;
  console.log(`🔀 Router created for session: ${sessionId}`);
  return router;
}

/**
 * getRouterForSession — returns existing router for a session
 */
function getRouterForSession(sessionId) {
  return routers[sessionId] || null;
}

/**
 * createTransport — creates a WebRTC transport for a user
 */
async function createTransport(sessionId) {
  const router = routers[sessionId];
  if (!router) {
    throw new Error('No router for this session');
  }

  const announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP || LOCAL_IP;
  const transport = await router.createWebRtcTransport({
    listenIps: [{ ip: '0.0.0.0', announcedIp }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  transport.appData = { sessionId };

  transports[transport.id] = transport;
  if (!sessionTransports[sessionId]) sessionTransports[sessionId] = [];
  sessionTransports[sessionId].push(transport.id);

  transport.on('close', () => {
    delete transports[transport.id];
  });

  console.log(`🚀 Transport created: ${transport.id}`);
  return transport;
}

/**
 * connectTransport — attaches DTLS parameters to an existing transport
 */
async function connectTransport(transportId, dtlsParameters) {
  const transport = transports[transportId];
  if (!transport) {
    throw new Error('Transport not found');
  }
  await transport.connect({ dtlsParameters });
  return transport;
}

/**
 * createProducer — creates a producer on a transport
 */
async function createProducer(sessionId, transportId, userId, kind, rtpParameters, appData = {}) {
  const transport = transports[transportId];
  if (!transport) {
    throw new Error('Transport not found');
  }
  const source = appData.source || kind;
  const producer = await transport.produce({
    kind,
    rtpParameters,
    appData: { sessionId, userId, source },
  });

  if (!sessionProducers[sessionId]) sessionProducers[sessionId] = [];
  sessionProducers[sessionId].push({ id: producer.id, userId, kind: source });

  producer.on('transportclose', () => {
    sessionProducers[sessionId] = (sessionProducers[sessionId] || []).filter(
      (p) => p.id !== producer.id
    );
  });

  return producer;
}

/**
 * createConsumer — creates a consumer for a producer on a transport
 */
async function createConsumer(sessionId, transportId, producerId, rtpCapabilities) {
  const router = routers[sessionId];
  const transport = transports[transportId];
  if (!router || !transport) {
    throw new Error('Router or transport missing');
  }

  const producerInfo = (sessionProducers[sessionId] || []).find((p) => p.id === producerId);
  if (!producerInfo) {
    throw new Error('Producer not found');
  }

  if (!router.canConsume({ producerId, rtpCapabilities })) {
    throw new Error('Client cannot consume this producer');
  }

  const consumer = await transport.consume({
    producerId,
    rtpCapabilities,
    paused: false,
  });

  return consumer;
}

/**
 * listProducers — returns producer metadata for a session
 */
function listProducers(sessionId) {
  return sessionProducers[sessionId] || [];
}

/**
 * closeTransport — closes and removes a transport by id
 */
function closeTransport(transportId) {
  const transport = transports[transportId];
  if (transport) {
    const sessionId = transport.appData?.sessionId;
    transport.close();
    delete transports[transportId];
    if (sessionId && sessionTransports[sessionId]) {
      sessionTransports[sessionId] = sessionTransports[sessionId].filter((id) => id !== transportId);
    }
  }
}

/**
 * closeRouter — cleans up router when session ends
 */
function closeRouter(sessionId) {
  const router = routers[sessionId];
  if (router) {
    (sessionTransports[sessionId] || []).forEach((tId) => {
      const transport = transports[tId];
      if (transport) transport.close();
      delete transports[tId];
    });
    delete sessionTransports[sessionId];
    delete sessionProducers[sessionId];

    router.close();
    delete routers[sessionId];
    console.log(`🧹 Router closed for session: ${sessionId}`);
  }
}

module.exports = {
  initWorker,
  createRouter,
  getRouterForSession,
  createTransport,
  connectTransport,
  createProducer,
  createConsumer,
  listProducers,
  closeTransport,
  closeRouter,
};
