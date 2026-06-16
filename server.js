const express = require('express');
const mysql = require('mysql2');
const path = require('path');

const app = express();
const PORT = 3000;

// Configuración para poder leer datos enviados desde formularios (JSON y URL-encoded)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir todos los archivos estáticos (CSS, JS, imágenes del prototipo) sin servir automáticamente index.html
app.use(express.static(path.join(__dirname), { index: false }));
app.use('/stitch', express.static(path.join(__dirname, 'stitch_horasocial_pro_landing_page')));

// Configuración de la conexión a la base de datos MySQL (por defecto en XAMPP)
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // Por defecto en XAMPP la contraseña está vacía
    database: 'horas_sociales'
});

// Conectar a la base de datos
db.connect((err) => {
    if (err) {
        console.error('Error al conectar a la base de datos MySQL:', err.message);
        console.log('Asegúrate de tener XAMPP encendido con MySQL en verde.');
        return;
    }
    console.log('Conexión exitosa a la base de datos MySQL.');
});

// Ruta de prueba para verificar que el servidor está conectado a la base de datos
app.get('/api/test-db', (req, res) => {
    db.query('SELECT 1 + 1 AS result', (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Error en la consulta a la base de datos' });
        }
        res.json({ message: 'Base de datos conectada correctamente', result: results[0].result });
    });
});

// ==========================================
// RUTAS PARA SERVIR LAS PANTALLAS SELECCIONADAS
// ==========================================

// 1. Bienvenida (Landing Page)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'bienvenido_a_horasocial_pro_2', 'code.html'));
});

// 2. Selección de Rol
app.get('/seleccion-rol', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'selecci_n_de_rol_distribuci_n_expandida_vertical', 'code.html'));
});

// 3. Login Único
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'login_estudiante_distribuci_n_centrada_y_logo_optimizado_2', 'code.html'));
});

// --- RUTAS DEL ESTUDIANTE ---
app.get('/estudiante/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'dashboard_estudiante_navegaci_n_optimizada', 'code.html'));
});

app.get('/estudiante/agenda', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'agenda_estudiante_junio_2026_premium', 'code.html'));
});

app.get('/estudiante/registro', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'registro_de_asistencia_horasocial_pro', 'code.html'));
});

app.get('/estudiante/mensajes', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'mis_mensajes_bandeja_de_entrada_estudiante_1', 'code.html'));
});

// --- RUTAS DEL MAESTRO ---
app.get('/maestro/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'dashboard_maestro_navegaci_n_y_cierre_de_sesi_n_optimizado', 'code.html'));
});

app.get('/maestro/estudiantes', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'gesti_n_estudiantes_perfil_maestro', 'code.html'));
});

app.get('/maestro/tecnico', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'gesti_n_t_cnica_maestro_navegaci_n_unificada_v2', 'code.html'));
});

app.get('/maestro/mensajes', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'mensajes_e_interacci_n_perfil_maestro', 'code.html'));
});

// --- RUTAS DEL ADMINISTRADOR ---
app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'dashboard_administrador_control_y_gesti_n_central', 'code.html'));
});

app.get('/admin/docentes', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'coordinaci_n_y_ajuste_de_docentes_admin', 'code.html'));
});

app.get('/admin/alertas', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'control_de_estudiantes_y_alertas_admin_versi_n_corregida', 'code.html'));
});

app.get('/admin/mensajes', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'mensajer_a_y_canales_admin_horasocial_pro_2', 'code.html'));
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor de Horas Sociales corriendo en http://localhost:${PORT}`);
});
