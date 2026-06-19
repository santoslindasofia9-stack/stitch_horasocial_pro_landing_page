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
        return res.status(400).json({ error: 'ID de solicitud es requerido' });
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

// 3. Login Único
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'login_estudiante_distribuci_n_centrada_y_logo_optimizado_2', 'code.html'));
});
// --- RUTA SOBRE / AYUDA ---
app.get('/sobre', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'sobre_horasocial_pro_identidad_y_prop_sito', 'code.html'));
});
// --- RUTA AGENDA ESTUDIANTE ---
app.get('/estudiante/agenda', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'agenda_estudiante_junio_2026_premium', 'code.html'));
});
// --- RUTA REGISTRO ESTUDIANTE ---
app.get('/estudiante/registro', (req, res) => {
    res.sendFile(path.join(__dirname, 'stitch_horasocial_pro_landing_page', 'registro_de_asistencia_horasocial_pro', 'code.html'));
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
// ==================== CHAT DATA ====================
const chats = [
    {
        id: 1,
        name: "Prof. Javier Domínguez",
        initials: "JD",
        avatarColor: "from-hs-primary to-hs-accent",
        lastMessage: "Tu reporte de servicio social ha sido revisado con éxito.",
        time: "10:45 AM",
        unread: 2,
        isActive: true,
        status: "En línea",
        statusType: "online",
        messages: [
            { id: 1, type: "received", text: "Hola, he revisado tu reporte de servicio social.", time: "10:30 AM", read: true },
            { id: 2, type: "received", text: "El contenido está muy bien estructurado. Solo necesitas corregir la fecha de inicio.", time: "10:32 AM", read: true },
            { id: 3, type: "sent", text: "Gracias profesor, voy a revisarlo.", time: "10:35 AM", read: true },
            { id: 4, type: "received", text: "Tu reporte ha sido revisado con éxito. Revisa los comentarios.", time: "10:45 AM", read: false }
        ]
    },
    {
        id: 2,
        name: "Dra. Ana Martínez",
        initials: "AM",
        avatarColor: "from-purple-600 to-violet-600",
        lastMessage: "Recuerda entregar la carta de liberación el viernes.",
        time: "Ayer",
        unread: 0,
        isActive: false,
        status: "Hace 2 horas",
        statusType: "away",
        messages: [
            { id: 1, type: "received", text: "Buenas tardes, ¿cómo va tu servicio social?", time: "Ayer 3:00 PM", read: true },
            { id: 2, type: "sent", text: "Va muy bien doctora.", time: "Ayer 3:15 PM", read: true },
            { id: 3, type: "received", text: "Recuerda entregar la carta de liberación el viernes.", time: "Ayer 4:00 PM", read: true }
        ]
    },
    {
        id: 3,
        name: "Lic. Ricardo Castro",
        initials: "RC",
        avatarColor: "from-emerald-600 to-teal-600",
        lastMessage: "Se ha habilitado la nueva convocatoria para el DIF.",
        time: "Lun",
        unread: 1,
        isActive: false,
        status: "En línea",
        statusType: "online",
        messages: [
            { id: 1, type: "received", text: "Hola, tengo información sobre una nueva oportunidad.", time: "Lun 9:00 AM", read: true },
            { id: 2, type: "received", text: "Se ha habilitado la nueva convocatoria para el DIF. ¿Te interesa?", time: "Lun 9:05 AM", read: false }
        ]
    },
    {
        id: 4,
        name: "Servicios Generales",
        initials: "SG",
        avatarColor: "from-sky-600 to-blue-600",
        lastMessage: "Confirmamos la recepción de tu firma digital.",
        time: "12 Oct",
        unread: 0,
        isActive: false,
        status: "Sistema",
        statusType: "bot",
        messages: [
            { id: 1, type: "received", text: "Hemos recibido tu documento.", time: "12 Oct 10:00 AM", read: true },
            { id: 2, type: "received", text: "Confirmamos la recepción de tu firma digital.", time: "12 Oct 10:05 AM", read: true }
        ]
    },
    {
        id: 5,
        name: "Laura Caballero",
        initials: "LC",
        avatarColor: "from-rose-500 to-pink-600",
        lastMessage: "¿Ya tienes el formato de horas acumuladas?",
        time: "10 Oct",
        unread: 0,
        isActive: false,
        status: "Hace 5 min",
        statusType: "online",
        messages: [
            { id: 1, type: "received", text: "Hola, ¿cómo estás?", time: "10 Oct 11:00 AM", read: true },
            { id: 2, type: "sent", text: "Bien, gracias.", time: "10 Oct 11:05 AM", read: true },
            { id: 3, type: "received", text: "¿Ya tienes el formato de horas acumuladas?", time: "10 Oct 11:30 AM", read: true }
        ]
    }
];

const teachers = [
    { id: 6, name: "Prof. Carlos Mendoza", subject: "Servicio Social", initials: "CM", avatarColor: "from-amber-600 to-orange-600" },
    { id: 7, name: "Dra. Patricia López", subject: "Prácticas Profesionales", initials: "PL", avatarColor: "from-indigo-600 to-purple-600" },
    { id: 8, name: "Lic. Fernando Ruiz", subject: "Vinculación", initials: "FR", avatarColor: "from-cyan-600 to-sky-600" },
    { id: 9, name: "Mtra. Gabriela Soto", subject: "Servicio Social", initials: "GS", avatarColor: "from-fuchsia-600 to-pink-600" }
];

let currentChatId = null;
let chatViewOpen = false;

// ==================== VIEW TOGGLE ====================
function toggleChatView() {
    const mainView = document.getElementById('view-main');
    const chatView = document.getElementById('view-chat');
    const navItems = document.querySelectorAll('.nav-item');
    
    if (chatViewOpen) {
        // Cerrar chat, volver a main
        chatView.classList.remove('active');
        mainView.classList.add('active');
        navItems.forEach(n => n.classList.remove('active'));
        // Restaurar el activo anterior (dashboard, agenda o registro)
        document.querySelector(`#nav-${currentView}`)?.classList.add('active');
        chatViewOpen = false;
        window.scrollTo(0, 0);
    } else {
        // Abrir chat
        mainView.classList.remove('active');
        chatView.classList.add('active');
        navItems.forEach(n => n.classList.remove('active'));
        document.getElementById('nav-mensajes').classList.add('active');
        chatViewOpen = true;
        window.scrollTo(0, 0);
        renderChatList();
    }
}

// ==================== CHAT FUNCTIONS ====================
function renderChatList() {
    const container = document.getElementById('chat-list');
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';
    
    const filtered = chats.filter(chat => 
        chat.name.toLowerCase().includes(searchTerm) || 
        chat.lastMessage.toLowerCase().includes(searchTerm)
    );

    if (!container) return;
    
    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <div class="w-16 h-16 rounded-full bg-hs-secondary/10 flex items-center justify-center mx-auto mb-4">
                    <span class="material-symbols-outlined text-hs-secondary text-2xl">search_off</span>
                </div>
                <p class="text-hs-muted font-medium">No se encontraron chats</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(chat => `
        <div onclick="openChat(${chat.id})" 
             class="chat-list-item flex items-center gap-4 ${chat.isActive ? 'active' : ''}">
            <div class="relative">
                <div class="chat-avatar bg-gradient-to-br ${chat.avatarColor}">${chat.initials}</div>
                ${chat.statusType === 'online' ? `<div class="online-indicator"></div>` : ''}
                ${chat.statusType === 'away' ? `<div class="online-indicator away"></div>` : ''}
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start mb-1">
                    <h3 class="font-display font-bold text-sm text-hs-primary truncate">${chat.name}</h3>
                    <span class="text-[11px] ${chat.unread > 0 ? 'text-hs-secondary font-bold' : 'text-hs-muted'} whitespace-nowrap ml-2">${chat.time}</span>
                </div>
                <p class="text-[13px] ${chat.unread > 0 ? 'text-hs-primary font-medium' : 'text-hs-muted'} truncate leading-relaxed">${chat.lastMessage}</p>
            </div>
            ${chat.unread > 0 ? `<span class="unread-badge">${chat.unread}</span>` : ''}
        </div>
    `).join('');
}

function filterChats() {
    renderChatList();
}

function openChat(chatId) {
    currentChatId = chatId;
    const chat = chats.find(c => c.id === chatId);
    
    chat.unread = 0;
    chat.isActive = true;
    chats.forEach(c => { if (c.id !== chatId) c.isActive = false; });
    
    document.getElementById('detail-name').textContent = chat.name;
    document.getElementById('detail-status').textContent = chat.status;
    document.getElementById('detail-avatar').textContent = chat.initials;
    document.getElementById('detail-avatar').className = `chat-avatar bg-gradient-to-br ${chat.avatarColor} text-sm`;
    
    const statusDot = document.getElementById('detail-status-dot');
    statusDot.style.display = 'block';
    statusDot.className = 'online-indicator';
    if (chat.statusType === 'away') statusDot.classList.add('away');
    else if (chat.statusType === 'bot') statusDot.style.display = 'none';
    
    renderMessages();
    updateBadge();
    renderChatList();
    
    document.getElementById('chat-detail').classList.add('active');
    document.body.style.overflow = 'hidden';
    
    setTimeout(() => {
        scrollToBottom();
        document.getElementById('message-input').focus();
    }, 100);
}

function renderMessages() {
    const chat = chats.find(c => c.id === currentChatId);
    const container = document.getElementById('messages-list');
    if (!container) return;
    
    if (chat.messages.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <div class="w-16 h-16 rounded-full bg-hs-secondary/10 flex items-center justify-center mx-auto mb-4">
                    <span class="material-symbols-outlined text-hs-secondary text-2xl">chat</span>
                </div>
                <p class="text-hs-muted font-medium">Inicia una conversación</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = chat.messages.map(msg => `
        <div class="flex ${msg.type === 'sent' ? 'justify-end' : 'justify-start'}">
            <div class="message-bubble ${msg.type}">
                <p>${msg.text}</p>
                <div class="message-time ${msg.type === 'sent' ? 'text-white/70' : 'text-hs-muted'}">
                    <span>${msg.time}</span>
                    ${msg.type === 'sent' ? `<span class="material-symbols-outlined text-[14px]">${msg.read ? 'done_all' : 'check'}</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

function closeChat() {
    document.getElementById('chat-detail').classList.remove('active');
    document.body.style.overflow = '';
    currentChatId = null;
    renderChatList();
}

function scrollToBottom() {
    const container = document.getElementById('messages-container');
    if (container) container.scrollTop = container.scrollHeight;
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text || !currentChatId) return;
    
    const chat = chats.find(c => c.id === currentChatId);
    const timeStr = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    
    chat.messages.push({
        id: Date.now(),
        type: "sent",
        text: text,
        time: timeStr,
        read: false
    });
    
    chat.lastMessage = text;
    chat.time = timeStr;
    
    input.value = '';
    renderMessages();
    scrollToBottom();
    showToast('Mensaje enviado');
    
    // Simular respuesta
    setTimeout(() => {
        showTyping();
        setTimeout(() => {
            hideTyping();
            const responses = [
                "Entendido, gracias por la información.",
                "Voy a revisarlo y te confirmo.",
                "Perfecto, quedo al pendiente.",
                "Gracias, cualquier duda me avisas."
            ];
            const randomResponse = responses[Math.floor(Math.random() * responses.length)];
            
            chat.messages.push({
                id: Date.now() + 1,
                type: "received",
                text: randomResponse,
                time: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
                read: true
            });
            
            chat.lastMessage = randomResponse;
            chat.time = "Ahora";
            chat.unread = 1;
            
            renderMessages();
            scrollToBottom();
            renderChatList();
            updateBadge();
            showToast(`Nuevo mensaje de ${chat.name}`);
        }, 2000);
    }, 1000);
}

function handleKeyPress(e) {
    if (e.key === 'Enter') sendMessage();
}

function showTyping() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.classList.add('active');
    scrollToBottom();
}

function hideTyping() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.classList.remove('active');
}

// ==================== NEW MESSAGE ====================
function openNewMessageModal() {
    document.getElementById('new-message-modal').classList.add('active');
    document.getElementById('teacher-search').focus();
}

function closeNewMessageModal() {
    document.getElementById('new-message-modal').classList.remove('active');
    document.getElementById('teacher-search').value = '';
    renderTeachersList();
}

function renderTeachersList() {
    const searchTerm = document.getElementById('teacher-search')?.value.toLowerCase() || '';
    const container = document.getElementById('teachers-list');
    if (!container) return;
    
    const filtered = teachers.filter(t => 
        t.name.toLowerCase().includes(searchTerm) || 
        t.subject.toLowerCase().includes(searchTerm)
    );
    
    container.innerHTML = filtered.map(teacher => `
        <div onclick="startNewChat(${teacher.id})" class="teacher-card">
            <div class="chat-avatar bg-gradient-to-br ${teacher.avatarColor} text-sm">${teacher.initials}</div>
            <div class="flex-1">
                <h4 class="font-display font-bold text-sm text-hs-primary">${teacher.name}</h4>
                <p class="text-xs text-hs-muted">${teacher.subject}</p>
            </div>
            <span class="material-symbols-outlined text-hs-muted text-sm">chevron_right</span>
        </div>
    `).join('');
}

function filterTeachers() {
    renderTeachersList();
}

function startNewChat(teacherId) {
    const teacher = teachers.find(t => t.id === teacherId);
    let chat = chats.find(c => c.name === teacher.name);
    
    if (!chat) {
        chat = {
            id: teacher.id,
            name: teacher.name,
            initials: teacher.initials,
            avatarColor: teacher.avatarColor,
            lastMessage: "Inicia una conversación...",
            time: "Ahora",
            unread: 0,
            isActive: false,
            status: "En línea",
            statusType: "online",
            messages: []
        };
        chats.unshift(chat);
    }
    
    closeNewMessageModal();
    openChat(chat.id);
    showToast(`Chat iniciado con ${teacher.name}`);
}

function closeModalOnOverlay(event) {
    if (event.target === event.currentTarget) closeNewMessageModal();
}

// ==================== UTILITIES ====================
function showToast(message) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toast-message');
    if (!toast || !msgEl) return;
    msgEl.textContent = message;
    toast.classList.add('active');
    setTimeout(() => toast.classList.remove('active'), 3000);
}

function updateBadge() {
    const totalUnread = chats.reduce((sum, chat) => sum + chat.unread, 0);
    const badge = document.getElementById('nav-badge');
    if (!badge) return;
    if (totalUnread > 0) {
        badge.textContent = totalUnread;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Close on escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeNewMessageModal();
        closeChat();
    }
});

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    renderChatList();
    updateBadge();
    renderTeachersList();
});