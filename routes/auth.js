const express = require('express');
const router = express.Router();
const { register, login, quickAccess } = require('../controllers/authController');

/**
 * POST /api/auth/register — create new account
 * POST /api/auth/login    — authenticate and get token
 * POST /api/auth/quick-access — create/reuse teacher/student profile without password prompt
 */
router.post('/register', register);
router.post('/login', login);
router.post('/quick-access', quickAccess);

module.exports = router;
