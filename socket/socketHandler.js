const User = require('../models/User');
const {
  createRouter,
  createTransport,
  connectTransport,
  createProducer,
  createConsumer,
  listProducers,
  closeTransport,
  closeRouter,
} = require('../mediasoup/mediaHandler');

/**
 * initSocketHandler — attaches all Socket.io event listeners
 * Called once from server.js with the io instance.
 */
function initSocketHandler(io) {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);
    socket.transportIds = [];

    /**
     * join-room — user joins a classroom session room
     */
    socket.on('join-room', async ({ sessionId, userId, role }) => {
      try {
        socket.join(sessionId);
        socket.sessionId = sessionId;
        socket.userId = userId;
        socket.role = role;

        const user = await User.findById(userId).select('name role');
        const name = user ? user.name : 'Unknown';

        // Ensure router exists for this session
        await createRouter(sessionId);

        socket.to(sessionId).emit('user-joined', { userId, role, name });
        console.log(`📥 ${name} (${role}) joined room ${sessionId}`);
      } catch (err) {
        console.error('❌ join-room error:', err.message);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    /**
     * leave-room — user leaves the classroom
     */
    socket.on('leave-room', ({ sessionId, userId }) => {
      socket.leave(sessionId);
      socket.to(sessionId).emit('user-left', { userId });
      console.log(`📤 User ${userId} left room ${sessionId}`);
    });

    /**
     * end-class — teacher ends the live class
     */
    socket.on('end-class', ({ sessionId }) => {
      io.to(sessionId).emit('class-ended', {});
      closeRouter(sessionId);
      console.log(`🛑 Class ended: ${sessionId}`);
    });

    // ─────────────────────────────────────────────
    //  MEDIASOUP SIGNALING EVENTS
    // ─────────────────────────────────────────────

    /**
     * create-transport — creates a WebRTC transport for the user
     */
    socket.on('create-transport', async ({ sessionId }, callback) => {
      try {
        if (!socket.sessionId) socket.sessionId = sessionId;
        await createRouter(sessionId);
        const transport = await createTransport(sessionId);
        socket.transportIds.push(transport.id);

        callback({
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        });
      } catch (err) {
        console.error('❌ create-transport error:', err.message);
        callback({ error: err.message });
      }
    });

    /**
     * connect-transport — connects DTLS parameters for the transport
     */
    socket.on('connect-transport', async ({ transportId, dtlsParameters }, callback) => {
      try {
        await connectTransport(transportId, dtlsParameters);
        callback({ connected: true });
      } catch (err) {
        console.error('❌ connect-transport error:', err.message);
        callback({ error: err.message });
      }
    });

    /**
     * produce — teacher/student starts producing media
     */
    socket.on('produce', async ({ transportId, kind, rtpParameters }, callback) => {
      try {
        const sessionId = socket.sessionId;
        const producer = await createProducer(sessionId, transportId, socket.userId, kind, rtpParameters);

        socket.to(sessionId).emit('new-producer', { producerId: producer.id, userId: socket.userId, kind });
        callback({ producerId: producer.id });
        console.log(`🎬 Producer created: ${kind} by ${socket.userId}`);
      } catch (err) {
        console.error('❌ produce error:', err.message);
        callback({ error: err.message });
      }
    });

    /**
     * consume — student consumes a producer's media stream
     */
    socket.on('consume', async ({ producerId, transportId, rtpCapabilities }, callback) => {
      try {
        const sessionId = socket.sessionId;
        const consumer = await createConsumer(sessionId, transportId, producerId, rtpCapabilities);

        callback({
          producerId,
          consumerId: consumer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });
      } catch (err) {
        console.error('❌ consume error:', err.message);
        callback({ error: err.message });
      }
    });

    /**
     * get-producers — returns active producers in the room
     */
    socket.on('get-producers', ({ sessionId }, callback) => {
      const producers = listProducers(sessionId);
      callback({ producers });
    });

    /**
     * disconnect — cleanup on socket disconnect
     */
    socket.on('disconnect', () => {
      if (socket.sessionId) {
        socket.to(socket.sessionId).emit('user-left', { userId: socket.userId });
      }
      socket.transportIds.forEach((id) => closeTransport(id));
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
}

module.exports = { initSocketHandler };
