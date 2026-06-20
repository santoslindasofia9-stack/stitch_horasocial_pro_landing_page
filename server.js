const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const fs = require('fs');

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
    
    // Crear tabla solicitudes_recuperacion si no existe
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS solicitudes_recuperacion (
            id INT AUTO_INCREMENT PRIMARY KEY,
            usuario VARCHAR(50) NOT NULL,
            nombre_completo VARCHAR(150) NOT NULL,
            telefono VARCHAR(20) NOT NULL,
            curso VARCHAR(20) NOT NULL,
            fecha_solicitud TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            estado ENUM('Pendiente', 'Autorizado') DEFAULT 'Pendiente'
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    db.query(createTableQuery, (tableErr) => {
        if (tableErr) {
            console.error('Error al verificar/crear la tabla solicitudes_recuperacion:', tableErr.message);
        } else {
            console.log('Tabla solicitudes_recuperacion verificada/creada correctamente.');
        }
    });
});

// Helper de persistencia local (fallback si MySQL está desconectado)
const SOLICITUDES_FILE = path.join(__dirname, 'solicitudes_recuperacion.json');

function getLocalRequests() {
    try {
        if (fs.existsSync(SOLICITUDES_FILE)) {
            const data = fs.readFileSync(SOLICITUDES_FILE, 'utf8');
            return JSON.parse(data || '[]');
        }
    } catch (err) {
        console.error('Error leyendo archivo local de solicitudes:', err.message);
    }
    return [];
}

function saveLocalRequests(requests) {
    try {
        fs.writeFileSync(SOLICITUDES_FILE, JSON.stringify(requests, null, 2), 'utf8');
    } catch (err) {
        console.error('Error escribiendo archivo local de solicitudes:', err.message);
    }
}

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
// ENDPOINTS PARA LA RECUPERACIÓN DE CONTRASEÑA
// ==========================================

// 1. Enviar solicitud de recuperación
app.post('/api/recuperar-contrasena', (req, res) => {
    const { usuario, nombre, telefono, curso } = req.body;
    if (!usuario || !nombre || !telefono || !curso) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios' });
    }

    const dbConnected = db && db.state !== 'disconnected';
    
    const saveRequestToLocal = () => {
        const requests = getLocalRequests();
        const newRequest = {
            id: Date.now(),
            usuario,
            nombre_completo: nombre,
            telefono,
            curso,
            fecha_solicitud: new Date().toISOString(),
            estado: 'Pendiente'
        };
        requests.push(newRequest);
        saveLocalRequests(requests);
        res.json({ success: true, message: 'Solicitud enviada a la administración (Modo local)', id: newRequest.id });
    };

    if (dbConnected) {
        const query = 'INSERT INTO solicitudes_recuperacion (usuario, nombre_completo, telefono, curso, estado) VALUES (?, ?, ?, ?, ?)';
        db.query(query, [usuario, nombre, telefono, curso, 'Pendiente'], (err, result) => {
            if (err) {
                console.error('Error insertando solicitud en MySQL, recurriendo a local:', err.message);
                saveRequestToLocal();
            } else {
                res.json({ success: true, message: 'Solicitud enviada a la administración', id: result.insertId });
            }
        });
    } else {
        saveRequestToLocal();
    }
});

// 2. Obtener solicitudes de recuperación
app.get('/api/solicitudes-recuperacion', (req, res) => {
    const dbConnected = db && db.state !== 'disconnected';
    
    if (dbConnected) {
        db.query('SELECT * FROM solicitudes_recuperacion WHERE estado = "Pendiente" ORDER BY fecha_solicitud DESC', (err, results) => {
            if (err) {
                console.error('Error consultando MySQL, recurriendo a local:', err.message);
                res.json(getLocalRequests().filter(r => r.estado === 'Pendiente'));
            } else {
                res.json(results);
            }
        });
    } else {
        res.json(getLocalRequests().filter(r => r.estado === 'Pendiente'));
    }
});

// 3. Autorizar solicitud de recuperación
app.post('/api/autorizar-solicitud', (req, res) => {
    const { id, usuario } = req.body;
    if (!id) {
        return res.status(400).json({ error: 'ID de solicitud es requerido' });
    }

    const dbConnected = db && db.state !== 'disconnected';
    
    const updateRequestLocal = () => {
        const requests = getLocalRequests();
        const index = requests.findIndex(r => r.id === parseInt(id) || r.id === id);
        if (index !== -1) {
            requests[index].estado = 'Autorizado';
            saveLocalRequests(requests);
            res.json({ success: true, message: 'Solicitud autorizada en modo local. Contraseña restablecida a: 123456' });
        } else {
            res.status(404).json({ error: 'Solicitud no encontrada' });
        }
    };

    if (dbConnected) {
        db.query('UPDATE solicitudes_recuperacion SET estado = "Autorizado" WHERE id = ?', [id], (err, result) => {
            if (err) {
                console.error('Error actualizando solicitud en MySQL, recurriendo a local:', err.message);
                updateRequestLocal();
            } else {
                if (usuario) {
                    db.query('UPDATE usuarios_a SET password = ? WHERE nombre_usuario = ?', ['123456', usuario], (userErr) => {
                        if (userErr) {
                            console.error('Error al actualizar contraseña del usuario en base de datos:', userErr.message);
                        } else {
                            console.log(`Contraseña para usuario ${usuario} restablecida a "123456"`);
                        }
                    });
                }
                res.json({ success: true, message: 'Solicitud autorizada correctamente. Contraseña restablecida a: 123456' });
            }
        });
    } else {
        updateRequestLocal();
    }
});

// 4. Ignorar/rechazar solicitud de recuperación
app.post('/api/rechazar-solicitud', (req, res) => {
    const { id } = req.body;
    if (!id) {
        return status(400).json({ error: 'ID de solicitud es requerido' });
    }

    const dbConnected = db && db.state !== 'disconnected';
    
    const deleteRequestLocal = () => {
        let requests = getLocalRequests();
        requests = requests.filter(r => r.id !== parseInt(id) && r.id !== id);
        saveLocalRequests(requests);
        res.json({ success: true, message: 'Solicitud ignorada correctamente' });
    };

    if (dbConnected) {
        db.query('DELETE FROM solicitudes_recuperacion WHERE id = ?', [id], (err, result) => {
            if (err) {
                console.error('Error al eliminar solicitud en MySQL, recurriendo a local:', err.message);
                deleteRequestLocal();
            } else {
                res.json({ success: true, message: 'Solicitud ignorada correctamente' });
            }
        });
    } else {
        deleteRequestLocal();
    }
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

// 3. Login Estudiante (RUTA ORIGINAL - NO SE TOCA)
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'login_estudiante_distribuci_n_centrada_y_logo_optimizado_2', 'code.html'));
});

// 4. Login Profesor (RUTA NUEVA - SIN CONFLICTOS)
app.get('/profesor/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'login_profesor', 'code.html'));
});

// --- RUTA SOBRE / AYUDA ---
app.get('/sobre', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'sobre_horasocial_pro_identidad_y_prop_sito', 'code.html'));
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