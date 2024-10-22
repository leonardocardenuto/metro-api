const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const db = require('./utils/db'); // Assuming db functions are in the utils folder
require('dotenv').config();

// Create nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL,      // Your Gmail address
        pass: process.env.EMAIL_PASSWORD, // App-specific password from Gmail
    },
    tls: {
        rejectUnauthorized: false
    },
    debug: true, // Optional: log debug info
    logger: true // Optional: log email sending process
});


// Function to send email
async function sendEmail(to, subject, text) {
    const mailOptions = {
        from: process.env.EMAIL,
        to,
        subject,
        text
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}`);
    } catch (error) {
        console.error(`Error sending email to ${to}: `, error);
    }
}

// Function to get the current date and time in Brazil's time zone (UTC-3)
function getBrazilCurrentDate() {
    const now = new Date();
    const brazilTimeOffset = -3; // For UTC-3 (Brazil standard time)
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000); // Convert local time to UTC time
    const brazilTime = new Date(utcTime + (brazilTimeOffset * 3600000)); // Adjust by Brazil's offset

    return brazilTime;
}

// Function to get the date in YYYY-MM-DD format without converting to UTC
function getBrazilDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Function to calculate the next execution time based on frequency
function calculateNextExecution(frequencia) {
    const nextExecutionDate = getBrazilCurrentDate(); // Get Brazil's current date
    
    if (frequencia === 'diário') {
        nextExecutionDate.setDate(nextExecutionDate.getDate() + 1); // Set to tomorrow
    } else if (frequencia === 'semanal') {
        nextExecutionDate.setDate(nextExecutionDate.getDate() + 7); // Set to next week
    } else if (frequencia === 'mensal') {
        nextExecutionDate.setMonth(nextExecutionDate.getMonth() + 1); // Set to next month
    }

    nextExecutionDate.setHours(0, 0, 0, 0); // Set to midnight
    return nextExecutionDate; // Return the Date object
}

// Function to check and execute cron jobs
async function executeCronJobs() {
    try {
        // Get the current date and time in Brazil's time zone
        const now = getBrazilCurrentDate();
        const currentTime = now.toTimeString().split(' ')[0]; // Format: HH:MM:SS
        const currentDateString = getBrazilDateString(now); // Format: YYYY-MM-DD
        const currentDayOfWeek = now.getDay(); // 0 (Sunday) to 6 (Saturday)
        const currentDayOfMonth = now.getDate(); // 1 to 31

        console.log(`Current time in Brazil: ${currentTime}, Date: ${currentDateString}, Day of Week: ${currentDayOfWeek}, Day of Month: ${currentDayOfMonth}`);

        // Fetch cron jobs that are active
        const sql = `
            SELECT cj.id, cj.relatorio_id, r.nome, cj.frequencia, cj.hora_execucao, 
                   cj.proxima_execucao, cj.emails, cj.dia_da_semana, cj.dia_do_mes
            FROM cron_jobs cj
            JOIN relatorios r ON cj.relatorio_id = r.id
            WHERE cj.status = 'ativo'
        `;
        const cronJobs = await db.executeQuery(sql, []);
        
        if (!cronJobs.length) {
            console.log('No active cron jobs found.');
            return;
        }

        for (let cronJob of cronJobs) {
            const { frequencia, hora_execucao, proxima_execucao, emails, nome, id, dia_da_semana, dia_do_mes } = cronJob;
            let shouldExecute = false;

            const execTime = hora_execucao ? hora_execucao.split(':').join('') : ''; // Format for easy comparison

            // For "diário" jobs
            if (frequencia === 'diário') {
                let proximaExecucaoDate = new Date(proxima_execucao); // Convert to Date object if not null
                const isProximaExecucaoValid = (proxima_execucao != null);
                console.log(isProximaExecucaoValid);
                if (!isProximaExecucaoValid && execTime <= currentTime.replace(/:/g, '')) {
                    shouldExecute = true;
                } else if (isProximaExecucaoValid && getBrazilDateString(proximaExecucaoDate) === currentDateString) {
                    shouldExecute = true;
                }

            // For "semanal" jobs
            } else if (frequencia === 'semanal' && dia_da_semana == currentDayOfWeek) {
                let proximaExecucaoDate = new Date(proxima_execucao);
                const isProximaExecucaoValid = (proxima_execucao != null);

                if (!isProximaExecucaoValid && execTime <= currentTime.replace(/:/g, '')) {
                    shouldExecute = true;
                } else if (isProximaExecucaoValid && getBrazilDateString(proximaExecucaoDate) === currentDateString) {
                    shouldExecute = true;
                }

            // For "mensal" jobs
            } else if (frequencia === 'mensal' && dia_do_mes == currentDayOfMonth) {
                let proximaExecucaoDate = new Date(proxima_execucao);
                const isProximaExecucaoValid = (proxima_execucao != null);
                if (!isProximaExecucaoValid && execTime <= currentTime.replace(/:/g, '')) {
                    shouldExecute = true;
                } else if (isProximaExecucaoValid && getBrazilDateString(proximaExecucaoDate) === currentDateString) {
                    shouldExecute = true;
                }
            }

            // If executed, update proxima_execucao
            if (shouldExecute) {
                const nextExecution = calculateNextExecution(frequencia); // Calculate the next execution time
                console.log(`Cron job ${id} executed. Next execution: ${nextExecution.toISOString()}`);

                // Update the next execution time
                await db.updateData('cron_jobs', { proxima_execucao: nextExecution.toISOString() }, `id = $2`, [id]);

                // Send emails if they exist
                const subject = `Relatório: ${nome}`;
                const text = `O relatório de ID ${cronJob.relatorio_id} deve ser executado agora.`;
                console.log(subject);
                console.log(text);

                if (emails) {
                    let emailList;
                
                    // Try parsing if the emails are stored as a JSON string (e.g., '{"email1@example.com","email2@example.com"}')
                    console.log(emails);
                    emailList = emails.split(',').map(email => email.trim());

                
                    // Send emails to each recipient
                    for (let email of emailList) {
                        await sendEmail(email, subject, text);
                    }
                }
                
            }
        }
    } catch (error) {
        console.error('Error executing cron jobs:', error);
    }
}

// Run the cron jobs
executeCronJobs();
