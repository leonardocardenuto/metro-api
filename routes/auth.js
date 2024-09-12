const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const User = require('../Models/User');

require('dotenv').config();

// Register route
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        bcrypt.hash(password, 10, async (err, hash) => {
            if (err) {
                return res.status(500).json({ message: 'Error hashing password' });
            }

            user = new User({
                username,
                email,
                password: hash,
            });

            await user.save();
            res.status(201).json({ message: 'User registered successfully' });
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});


// Login route
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        let user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        console.log(user);
        bcrypt.compare(password.trim(), user.password, (err, isMatch) => {
            if (err) {
                return res.status(500).json({ message: 'Error comparing passwords' });
            }

            if (!isMatch) {
                return res.status(400).json({ message: 'Invalid credentials' });
            }

            const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
                expiresIn: '1h',
            });

            res.json({ token });
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});


// Transporter to send emails (using nodemailer)
const transporter = nodemailer.createTransport({
    service: 'hotmail',
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD
    }
});


// Forgot Password Route
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = Date.now() + 10 * 60 * 1000; // Token expires in 10 minutes

        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = tokenExpiry;
        console.log('Reset token saved:', user.resetPasswordToken);
        console.log('Token expiry:', user.resetPasswordExpires);
        await user.save();
        console.log('User:', user);
        console.log('Token:', resetToken);



        // const mailOptions = {
        //     from: process.env.EMAIL,
        //     to: user.email,
        //     subject: 'Solicitação de Redefinição de Senha',
        //     text: `Prezado(a) Usuário(a),

        //     Você está recebendo este email porque (ou alguém em seu nome) solicitou a redefinição da senha da sua conta.
            
        //     Para completar o processo de redefinição de senha, por favor, utilize o código abaixo no app:
            
        //     ${resetToken}
            
        //     Se você não solicitou a redefinição da senha, por favor, ignore este email. Sua senha permanecerá inalterada.
            
        //     Atenciosamente,
        //     MetroMaua`
        //     };

        // await transporter.sendMail(mailOptions);

        res.json({ message: 'Password reset email sent' });
    } catch (error) {
        console.error(error); 
        res.status(500).json({ message: 'Server error' });
    }
});


// Verify Reset Token Route
router.get('/verify-reset-token/:token', async (req, res) => {
    const { token } = req.params;

    try {
        // Find user by reset token and make sure it's not expired
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired token' });
        }

        res.json({ message: 'Token is valid' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});


// Reset Password Route
router.patch('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        const currentTime = Date.now();
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: currentTime }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired token' });
        }

        bcrypt.hash(password.trim(), 10, async (err, hash) => {
            if (err) {
                return res.status(500).json({ message: 'Error hashing password' });
            }

            user.password = hash;
            console.log('Hashed reset',user.password)
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;

            await user.save();
            res.json({ message: 'Password reset successfully' });
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;