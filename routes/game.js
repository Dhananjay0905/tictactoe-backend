const express = require('express');
const router = express.Router();
const { getUserStats, updateUserStats } = require('../controllers/gameController');
const authMiddleware = require('../middleware/authMiddleware');

// @route   GET api/game/stats
// @desc    Get user's game stats
// @access  Private
router.get('/stats', authMiddleware, getUserStats);

// @route   PUT api/game/stats
// @desc    Update user's game stats
// @access  Private
router.put('/stats', authMiddleware, updateUserStats);

module.exports = router;