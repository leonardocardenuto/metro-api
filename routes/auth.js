// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const db = require('../utils/db');

require('dotenv').config();

// Rota de registro
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Verificar se o usuário já existe
        const user = await db.executeQuery('SELECT * FROM Users WHERE email = $1', [email]);
        if (user.length > 0) {
            return res.status(400).json({ message: 'Usuário já existe!' });
        }

        // Hash da senha
        const hash = await bcrypt.hash(password, 10);
        await db.insertData('Users', { username, email, password: hash });
        
        res.status(201).json({ message: 'Usuário registrado com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor!' });
    }
});

// Rota de login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await db.executeQuery('SELECT * FROM Users WHERE email = $1', [email]);
        if (user.length === 0) {
            return res.status(400).json({ message: 'Credenciais inválidas!' });
        }

        const isMatch = await bcrypt.compare(password, user[0].password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenciais inválidas!' });
        }

        const token = jwt.sign({ userId: user[0].id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        console.error(error);
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
        const user = await db.executeQuery('SELECT * FROM Users WHERE email = $1', [email]);
        if (user.length === 0) {
            return res.status(400).json({ message: 'Usuário não encontrado!' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = Date.now() + 10 * 60 * 1000; // Token expira em 10 minutos

        await db.updateData('Users', { reset_password_token: resetToken, reset_password_expires: tokenExpiry }, `email = $3`, [email]);

        /*
        const mailOptions = {
            from: process.env.EMAIL,
            to: user[0].email,
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
        const user = await db.executeQuery('SELECT * FROM Users WHERE reset_password_token = $1 AND reset_password_expires > $2', [token, Date.now()]);
        if (user.length === 0) {
            return res.status(400).json({ message: 'Código inválido ou expirado!' });
        }

        res.json({ message: 'Código validado com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor!' });
    }
});

// Rota para redefinir a senha
router.patch('/reset-password/:token', async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        const user = await db.executeQuery('SELECT * FROM Users WHERE reset_password_token = $1 AND reset_password_expires > $2', [token, Date.now()]);
        if (user.length === 0) {
            return res.status(400).json({ message: 'Código inválido ou expirado!' });
        }
        
        const hash = await bcrypt.hash(password, 10);
        await db.updateData('Users', { password: hash , reset_password_token : null, reset_password_expires: null}, `id = $4`, [user[0].id]);

        res.json({ message: 'Senha redefinida com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor!' });
    }
});

// Função para verificar o token
async function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded;
    } catch (error) {
        return null;
    }
}

// Rota para procurar extintores
router.get('/search', async (req, res) => {
    const { query } = req.query;

    const token = req.headers.authorization;

    const decoded = await verifyToken(token);

    if (!decoded) {
        return res.status(401).json({ message: 'Token inválido ou expirado. Acesso não autorizado.' });
    }

    try {
        let sqlQuery = `
            SELECT numero_equipamento, tipo, status 
            FROM extintores 
            WHERE 1=1
        `;
        const params = [];

        if (query) {
            const numeroEquipamentoQuery = Number(query);
        
            sqlQuery += ` AND (numero_equipamento ILIKE $1 OR tipo ILIKE $2)`;
            params.push(numeroEquipamentoQuery, `%${query}%`);
        }

        console.log('Executing query:', sqlQuery);
        console.log('With parameters:', params);

        const resultados = await db.executeQuery(sqlQuery, params);

        if (resultados.length === 0) {
            return res.status(404).json({ message: 'Nenhum equipamento encontrado.' });
        }

        res.json(resultados);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor!' });
    }
});

// Rota para adicionar extintores
router.post('/add-extinguisher', async (req, res) => {
    const { numero_equipamento, tipo, capacidade, codigo_fabricante, data_fabricacao, data_validade, ultima_recarga, proxima_inspecao, status, id_localizacao,  observacoes } = req.body;

    try {
        await db.insertData('Extintores', {
            numero_equipamento,
            tipo,
            capacidade,
            codigo_fabricante,
            data_fabricacao,
            data_validade,
            ultima_recarga,
            proxima_inspecao,
            status,
            id_localizacao,
            observacoes
        });

        res.status(201).json({ message: 'Extintor registrado com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor!' });
    }
// Exemplo de request
// {
//     "numero_equipamento" : 12314124,
//     "tipo" : "pqs",
//     "capacidade" : "10L",
//     "data_fabricacao" : "2022-01-15",
//     "data_validade" : "2022-01-15",
//     "status" : "Em Manutenção",
//     "id_localizacao" : 1,
//     "observacoes" : ""
// }



});

// Rota para pegar estacoes da linha
router.get('/get-station', async (req, res) => {
    const { linha } = req.query;

    if (!linha) {
        return res.status(400).json({ message: 'Linha não informada!' });
    }

    try {
        const sqlQuery = `
            SELECT estacao 
            FROM localizacoes 
            WHERE linha = $1
        `;
        const params = [linha];

        console.log('Executing query:', sqlQuery);
        console.log('With parameters:', params);

        const resultados = await db.executeQuery(sqlQuery, params);

        if (resultados.length === 0) {
            return res.status(404).json({ message: 'Nenhuma estacao encontrada para a linha informada.' });
        }

        res.json(resultados);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Erro no servidor!' });
    }

    //http://localhost:5000/api/auth/get-station?linha=Verde
});

// Rota para pegar detalhes das estacoes
router.get('/get-station-details', async (req, res) => {
    const { linha, estacao } = req.query;

    if (!linha) {
        return res.status(400).json({ message: 'Linha não informada!' });
    }

    if (!estacao) {
        return res.status(400).json({ message: 'Estação não informada!' });
    }

    try {
        const sqlQuery = `
            SELECT local_detalhado 
            FROM Localizacoes 
            WHERE linha = $1 AND estacao = $2
        `;
        const params = [linha, estacao];  

        console.log('Executing query:', sqlQuery);
        console.log('With parameters:', params);

        const resultados = await db.executeQuery(sqlQuery, params);

        if (resultados.length === 0) {
            return res.status(404).json({ message: 'Nenhum local detalhado encontrado para a estação informada.' });
        }

        res.json(resultados);  
    } catch (error) {
        console.error(error);  
        res.status(500).json({ message: 'Erro no servidor!' });  
    }
    // http://localhost:5000/api/auth/get-station-details?linha=Verde&estacao=Penha
});

//Rota para pegar o id da localizacao a partir da area, subarea e local detalhado
router.get('/get-location-id', async (req, res) => {
    const { linha, estacao, localDetalhado } = req.query;

    // Validações de entrada
    if (!linha) {
        return res.status(400).json({ message: 'Área não informada!' });
    }

    if (!estacao) {
        return res.status(400).json({ message: 'Subárea não informada!' });
    }

    if (!localDetalhado) {
        return res.status(400).json({ message: 'Local detalhado não informado!' });
    }

    try {
        const sqlQuery = `
            SELECT id_localizacao 
            FROM Localizacoes 
            WHERE linha = $1 AND estacao = $2 AND local_detalhado = $3
        `;
        const params = [linha, estacao, localDetalhado];

        console.log('Executing query:', sqlQuery);
        console.log('With parameters:', params);

        const resultados = await db.executeQuery(sqlQuery, params);

        if (resultados.length === 0) {
            return res.status(404).json({ message: 'Nenhuma localização encontrada.' });
        }

        res.json(resultados);  
    } catch (error) {
        console.error(error);  
        res.status(500).json({ message: 'Erro no servidor!' });  
    }
    // http://localhost:5000/api/auth/get-location-id?linha=Verde&estacao=Penha&localDetalhado=Saida Sul
});

module.exports = router;
