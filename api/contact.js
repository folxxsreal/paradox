// Importación estática al inicio
const nodemailer = require('nodemailer');

export default async function handler(req, res) {
  // Agregar headers CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  try {
    // Verificar variables de entorno al inicio
    console.log('Verificando variables de entorno...');
    if (!process.env.GMAIL_USER) {
      console.error('GMAIL_USER no configurado');
      return res.status(500).json({ message: 'Configuración del servidor incompleta: GMAIL_USER' });
    }
    
    if (!process.env.GMAIL_APP_PASSWORD) {
      console.error('GMAIL_APP_PASSWORD no configurado');
      return res.status(500).json({ message: 'Configuración del servidor incompleta: GMAIL_APP_PASSWORD' });
    }
    
    if (!process.env.RECAPTCHA_SECRET_KEY) {
      console.error('RECAPTCHA_SECRET_KEY no configurado');
      return res.status(500).json({ message: 'Configuración del servidor incompleta: RECAPTCHA_SECRET_KEY' });
    }

    console.log('Variables de entorno verificadas correctamente');

    // Extraer datos del body
    const { nombre, apellido, email, telefono, servicio, mensaje, recaptchaToken } = req.body;

    // Validar campos requeridos
    if (!nombre || !apellido || !email || !telefono || !servicio || !mensaje) {
      return res.status(400).json({ message: 'Todos los campos son requeridos' });
    }

    // Validar reCAPTCHA
    if (!recaptchaToken) {
      return res.status(400).json({ message: 'Por favor completa el reCAPTCHA' });
    }

    console.log('Verificando reCAPTCHA...');
    
    // Verificar reCAPTCHA con mejor manejo de errores
    const recaptchaResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded' 
      },
      body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`
    });

    if (!recaptchaResponse.ok) {
      console.error('Error en la respuesta de reCAPTCHA:', recaptchaResponse.status);
      return res.status(500).json({ message: 'Error al verificar reCAPTCHA' });
    }

    const recaptchaData = await recaptchaResponse.json();
    console.log('Respuesta reCAPTCHA:', recaptchaData);

    if (!recaptchaData.success) {
      console.error('reCAPTCHA falló:', recaptchaData['error-codes']);
      return res.status(400).json({ message: 'Verificación reCAPTCHA falló. Por favor intenta de nuevo.' });
    }

    console.log('reCAPTCHA verificado correctamente');

    // Configurar nodemailer con Gmail
    console.log('Configurando transporter de email...');
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    // Verificar conexión SMTP
    console.log('Verificando conexión SMTP...');
    await transporter.verify();
    console.log('Conexión SMTP exitosa');

    // Mapear códigos de servicio a nombres legibles
    const servicios = {
      'casas-inteligentes': 'Casas Inteligentes',
      'plantas-solares': 'Plantas Solares',
      'ingenieria-maritima': 'Ingeniería Marítima',
      'automatizacion-procesos': 'Automatización de Procesos',
      'diseno-maquinas': 'Diseño de Máquinas',
      'cableado-estructurado': 'Cableado Estructurado',
      'desarrollo-software': 'Desarrollo de Software',
      'sistemas-incendios': 'Sistemas Contra Incendios',
      'videovigilancia': 'Videovigilancia y Control de Accesos',
      'consultoria': 'Consultoría General'
    };

    const servicioNombre = servicios[servicio] || servicio;

    // Configurar el email
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: process.env.GMAIL_USER,
      subject: `Nuevo contacto de Paradox Systems - ${servicioNombre}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #0077cc; color: white; padding: 20px; text-align: center;">
            <h1>Nuevo Mensaje de Contacto</h1>
            <p>Paradox Systems</p>
          </div>
          
          <div style="padding: 20px; background-color: #f8f9fa;">
            <h2 style="color: #333;">Información del Cliente</h2>
            
            <div style="background-color: white; padding: 15px; border-radius: 5px; margin-bottom: 15px;">
              <p><strong>Nombre:</strong> ${nombre} ${apellido}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Teléfono:</strong> ${telefono}</p>
              <p><strong>Servicio de Interés:</strong> ${servicioNombre}</p>
            </div>
            
            <div style="background-color: white; padding: 15px; border-radius: 5px;">
              <h3 style="color: #333; margin-top: 0;">Mensaje:</h3>
              <p style="line-height: 1.6;">${mensaje}</p>
            </div>
          </div>
          
          <div style="background-color: #333; color: white; padding: 15px; text-align: center;">
            <p style="margin: 0;">Este mensaje fue enviado desde el formulario de contacto de paradoxsystems.com</p>
          </div>
        </div>
      `,
    };

    // Enviar el email
    console.log('Enviando email...');
    const result = await transporter.sendMail(mailOptions);
    console.log('Email enviado exitosamente:', result.messageId);

    res.status(200).json({ 
      message: 'Email enviado correctamente',
      messageId: result.messageId 
    });

  } catch (error) {
    console.error('💥 ERROR CRÍTICO CAPTURADO:');
    console.error('🔍 Error type:', typeof error);
    console.error('🔍 Error name:', error.name);
    console.error('🔍 Error message:', error.message);
    console.error('🔍 Error code:', error.code);
    console.error('🔍 Error response:', error.response);
    console.error('🔍 Error syscall:', error.syscall);
    console.error('🔍 Error hostname:', error.hostname);
    console.error('🔍 Error port:', error.port);
    console.error('📚 Error stack completo:');
    console.error(error.stack);
    
    // Log adicional para objetos de error
    console.error('🧭 Error properties:', Object.getOwnPropertyNames(error));
    console.error('🧭 Error JSON:', JSON.stringify(error, null, 2));
    
    // Información del contexto cuando ocurrió el error
    console.error('🌍 Context info:', {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    });
    
    // Manejar errores específicos
    if (error.code === 'EAUTH') {
      console.error('🚫 Error de autenticación detectado');
      return res.status(500).json({ 
        message: 'Error de autenticación del email. Verifica las credenciales.',
        error: 'EAUTH',
        debug: 'Verifica que GMAIL_USER y GMAIL_APP_PASSWORD estén configurados correctamente'
      });
    }
    
    if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      console.error('🌐 Error de conexión detectado');
      return res.status(500).json({ 
        message: 'Error de conexión al servidor de email.',
        error: error.code,
        debug: `Problema de conectividad: ${error.message}`
      });
    }
    
    if (error.code === 'EENVELOPE') {
      console.error('📧 Error de envelope/direcciones detectado');
      return res.status(500).json({ 
        message: 'Error en las direcciones de email.',
        error: 'EENVELOPE',
        debug: `Verifica las direcciones de email: ${error.message}`
      });
    }
    
    // Error genérico con máxima información
    console.error('❓ Error no categorizado - enviando respuesta genérica');
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: error.message,
      code: error.code || 'UNKNOWN',
      type: error.name || 'UnknownError',
      debug: {
        timestamp: new Date().toISOString(),
        stack: error.stack?.split('\n').slice(0, 5) // Solo primeras 5 líneas del stack
      }
    });
  }
}