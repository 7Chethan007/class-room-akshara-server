const express = require('express');
const router = express.Router();
const { register, login } = require('../controllers/authController');

/**
 * POST /api/auth/register — create new account
 * POST /api/auth/login    — authenticate and get token
 */
router.post('/register', register);
router.post('/login', login);

module.exports = router;
