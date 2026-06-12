// server.js - Backend simple para sistema de sorteo automatizado
const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. Cargar variables de entorno desde .env
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 0. Liberar el puerto si ya está en uso (Windows)
try {
  const netstat = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8', timeout: 3000 });
  const lines = netstat.trim().split('\n').filter(l => l.includes('LISTENING'));
  if (lines.length > 0) {
    const pid = lines[0].trim().split(/\s+/).pop();
    console.log(`⚠️ Puerto ${PORT} ocupado por PID ${pid}. Liberando...`);
    execSync(`taskkill /F /PID ${pid} 2>nul`, { timeout: 3000 });
    console.log(`✅ Puerto ${PORT} liberado.`);
  }
} catch (e) {
  // Si netstat falla (puerto libre o comando no disponible), seguimos normalmente
}

console.log('🔧 Iniciando servidor de sorteo...');
console.log(`📁 Directorio base: ${__dirname}`);

// --- Lectura del archivo clientes.csv ---
function parseCSV(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const lines = raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length < 2) {
    console.warn('⚠️ clientes.csv tiene menos de 2 líneas (sin datos).');
    return [];
  }

  // La primera línea es el encabezado: numero,nombre
  const participantes = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length >= 2) {
      const numero = cols[0].trim();
      const nombre = cols.slice(1).join(',').trim(); // por si el nombre lleva coma
      if (numero && nombre) {
        participantes.push({ numero, nombre });
      }
    }
  }

  console.log(`✅ Se cargaron ${participantes.length} participantes desde clientes.csv`);
  return participantes;
}

const csvPath = path.join(__dirname, 'clientes.csv');
let participantes = [];

try {
  participantes = parseCSV(csvPath);
} catch (err) {
  console.error(`❌ Error al leer clientes.csv: ${err.message}`);
  console.warn('⚠️ El sorteo se ejecutará sin participantes.');
}

// --- Helpers para parsear .env ---
function parseLista(str, fallback) {
  if (!str || str.trim() === '') return fallback || [];
  return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

// --- Configuración desde .env ---
const premios = parseLista(process.env.PREMIOS, ['Premio 1', 'Premio 2', 'Premio 3', 'Premio 4']);
const flyersPromo = parseLista(process.env.FLYERS_PROMO, []);
const flyersPremio = [];

// Flyers por premio: FLYER_PREMIO_1, FLYER_PREMIO_2, ... FLYER_PREMIO_N
for (let i = 1; i <= premios.length; i++) {
  const key = `FLYER_PREMIO_${i}`;
  flyersPremio.push(process.env[key] || null);
}

const config = {
  premios,
  rutaFlyer: process.env.RUTA_FLYER || './assets/flyer_espera.png',
  rutaLogo: process.env.RUTA_LOGO || './assets/logo.png',
  horaSorteo: process.env.HORA_SORTEO || null,       // "21:00" en GMT-3 (Argentina)
  minutosEspera: parseFloat(process.env.MINUTOS_ESPERA) || 5,
  flyersPromo,
  flyersPremio,  // Array del mismo largo que premios; null si no hay flyer para ese premio
};

console.log('📋 Configuración:');
console.log(`   Premios: ${config.premios.join(', ')}`);
console.log(`   Flyer principal: ${config.rutaFlyer}`);
console.log(`   Logo: ${config.rutaLogo}`);
if (config.horaSorteo) {
  console.log(`   Hora de sorteo: ${config.horaSorteo} hs (GMT-3 Argentina)`);
} else {
  console.log(`   Minutos de espera: ${config.minutosEspera}`);
}
console.log(`   Flyers promocionales: ${config.flyersPromo.length > 0 ? config.flyersPromo.join(', ') : '(ninguno)'}`);
console.log(`   Flyers por premio: ${config.flyersPremio.filter(Boolean).length} de ${premios.length}`);

// --- Servir archivos estáticos ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// --- Archivo de Log ---
const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const fechaHora = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const LOG_PATH = path.join(LOG_DIR, `sorteo_${fechaHora}.log`);

function escribirLog(evento, datos) {
  const ts = new Date().toISOString();
  const linea = `[${ts}] ${evento}` + (datos ? ` | ${JSON.stringify(datos)}` : '');
  try {
    fs.appendFileSync(LOG_PATH, linea + '\n', 'utf-8');
    console.log(`📝 LOG: ${linea}`);
  } catch (err) {
    console.error('❌ Error escribiendo log:', err.message);
  }
}

// Log de arranque
escribirLog('SERVIDOR_INICIADO', {
  participantes: participantes.length,
  premios: config.premios,
  horaSorteo: config.horaSorteo || '(minutos)',
  minutosEspera: config.minutosEspera,
});

// --- API Endpoints ---
app.get('/api/config', (_req, res) => {
  res.json(config);
});

app.get('/api/participantes', (_req, res) => {
  res.json(participantes);
});

// Endpoint de log: el frontend notifica eventos
app.post('/api/log', (req, res) => {
  const { evento, datos } = req.body;
  if (!evento) return res.status(400).json({ error: 'Falta "evento"' });
  escribirLog(evento, datos);
  res.json({ ok: true });
});

// --- Fallback para SPA (opcional) ---
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Iniciar servidor ---
function iniciarServidor() {
  const server = app.listen(PORT, () => {
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log(`🎰 Servidor de sorteo listo en:`);
    console.log(`   http://localhost:${PORT}`);
    console.log('═══════════════════════════════════════');
    console.log('📺 Abrí esta URL en OBS como "Navegador".');
    console.log('   Resolución: 1080 x 1920 (vertical).');
    if (config.horaSorteo) {
      console.log(`🕒 El sorteo está programado a las ${config.horaSorteo} hs (ARG).`);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ El puerto ${PORT} ya está en uso.`);
      console.error('   ¿Ya hay un servidor corriendo en otra terminal?');
      console.error('   Cerrá esa terminal o ejecutá:');
      console.error('   taskkill /F /IM node.exe');
      console.error('\n   Reintentando en 2 segundos...\n');
      setTimeout(() => {
        process.exit(0);
      }, 2000);
    } else {
      console.error('❌ Error al iniciar el servidor:', err.message);
      process.exit(1);
    }
  });
}

iniciarServidor();
