const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const User = require('../Models/User');

require('dotenv').config();

// Rota de registro
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'Usuário já existe!' });
        }

        bcrypt.hash(password, 10, async (err, hash) => {
            if (err) {
                return res.status(500).json({ message: 'Erro ao criptografar a senha!' });
            }

            user = new User({
                username,
                email,
                password: hash,
            });

            await user.save();
            res.status(201).json({ message: 'Usuário registrado com sucesso!' });
        });
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor!' });
    }
});

// Rota de login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        let user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Credenciais inválidas!' });
        }

        bcrypt.compare(password.trim(), user.password, (err, isMatch) => {
            if (err) {
                return res.status(500).json({ message: 'Erro ao comparar as senhas!' });
            }

            if (!isMatch) {
                return res.status(400).json({ message: 'Credenciais inválidas!' });
            }

            const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
                expiresIn: '1h',
            });

            res.json({ token });
        });
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor!' });
    }
});

// Transportador para enviar emails (usando nodemailer)
const transporter = nodemailer.createTransport({
    service: 'hotmail',
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Rota de esqueci a senha
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Usuário não encontrado!' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = Date.now() + 10 * 60 * 1000; // Token expira em 10 minutos

        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = tokenExpiry;

        await user.save();

        /*
        const mailOptions = {
            from: process.env.EMAIL,
            to: user.email,
            subject: 'Solicitação de Redefinição de Senha',
            text: `Prezado(a) Usuário(a),

            Você está recebendo este email porque (ou alguém em seu nome) solicitou a redefinição da senha da sua conta.
            
            Para completar o processo de redefinição de senha, por favor, utilize o código abaixo no app:
            
            ${resetToken}
            
            Se você não solicitou a redefinição da senha, por favor, ignore este email. Sua senha permanecerá inalterada.
            
            Atenciosamente,
            MetroMaua`
        };

        await transporter.sendMail(mailOptions);
        */

        res.json({ message: 'Email de redefinição de senha enviado com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor!' });
    }
});

// Rota para verificar o código de redefinição
router.get('/verify-reset-token/:token', async (req, res) => {
    const { token } = req.params;

    try {
        // Encontrar usuário pelo código de redefinição e garantir que não esteja expirado
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Código inválido ou expirado!' });
        }

        res.json({ message: 'Código validado com sucesso!' });
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor!' });
    }
});

// Rota para redefinir a senha
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
            return res.status(400).json({ message: 'Código inválido ou expirado!' });
        }

        bcrypt.hash(password.trim(), 10, async (err, hash) => {
            if (err) {
                return res.status(500).json({ message: 'Erro ao criptografar a senha!' });
            }

            user.password = hash;
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;

            await user.save();
            res.json({ message: 'Senha redefinida com sucesso!' });
        });
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor!' });
    }
});

module.exports = router;
