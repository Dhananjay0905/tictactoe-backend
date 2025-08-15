const User = require('../models/User');

// Get User Stats
const getUserStats = async (req, res) => {
    try {
        const user = await User.findById(req.user).select('-passwordHash');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update User Stats
const updateUserStats = async (req, res) => {
    const { wins, losses, draws } = req.body;

    try {
        const user = await User.findById(req.user);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.gamesPlayed += 1;
        user.wins += wins || 0;
        user.losses += losses || 0;
        user.draws += draws || 0;

        const updatedUser = await user.save();
        res.json({
            gamesPlayed: updatedUser.gamesPlayed,
            wins: updatedUser.wins,
            losses: updatedUser.losses,
            draws: updatedUser.draws,
        });

    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = { getUserStats, updateUserStats };