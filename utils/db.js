// utils/db.js
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const client = new Client({
    connectionString: process.env.DATABASE_URL, // A URI do NeonDB
});

client.connect();

const executeQuery = async (query, params) => {
    try {
        console.log('Executing query:', query);
        console.log('With parameters:', params);
        const res = await client.query(query, params);
        console.log(res.rows);
        return res.rows;
    } catch (err) {
        console.error('Erro ao executar a consulta', err);
        throw err;
    }
};


// Função para inserir dados
const insertData = async (table, data) => {
    const keys = Object.keys(data).join(', ');
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    const query = `INSERT INTO ${table} (${keys}) VALUES (${placeholders}) RETURNING *;`;
    return await executeQuery(query, values);
};

// Função para atualizar dados
const updateData = async (table, data, condition, conditionValues) => {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

    const query = `UPDATE ${table} SET ${setClause} WHERE ${condition}`;
    const allValues = [...values, ...conditionValues]; 
    console.log('Executing query:', query);
    console.log('With parameters:', allValues);
    await executeQuery(query, allValues);
};


// Função para deletar dados
const deleteData = async (table, condition) => {
    const query = `DELETE FROM ${table} WHERE ${condition}`;
    await executeQuery(query);
};

module.exports = {
    executeQuery,
    insertData,
    updateData,
    deleteData,
};
