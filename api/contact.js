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
    // Importación dinámica de nodemailer
    const nodemailer = await import('nodemailer');

    // Verificar variables de entorno CRÍTICAS
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      console.error('Variables de entorno faltantes');
      return res.status(500).json({ 
        message: 'Error de configuración del servidor',
        details: 'Variables de entorno no configuradas'
      });
    }

    if (!process.env.RECAPTCHA_SECRET_KEY) {
      console.error('RECAPTCHA_SECRET_KEY no configurada');
      return res.status(500).json({ 
        message: 'Error de configuración del servidor',
        details: 'reCAPTCHA no configurado'
      });
    }
    
    const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
    
    // Debug: verificar variables de entorno
    console.log('GMAIL_USER exists:', !!process.env.GMAIL_USER);
    console.log('GMAIL_APP_PASSWORD exists:', !!process.env.GMAIL_APP_PASSWORD);
    console.log('RECAPTCHA_SECRET_KEY exists:', !!RECAPTCHA_SECRET_KEY);

    const { nombre, apellido, email, telefono, servicio, mensaje, recaptchaToken } = req.body;

    // Validar campos requeridos
    if (!nombre || !apellido || !email || !telefono || !servicio || !mensaje) {
      return res.status(400).json({ message: 'Todos los campos son requeridos' });
    }

    // Validar reCAPTCHA
    if (!recaptchaToken) {
      return res.status(400).json({ message: 'Por favor completa el reCAPTCHA' });
    }

    // Verificar reCAPTCHA
    const recaptchaResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`
    });

    const recaptchaData = await recaptchaResponse.json();

    if (!recaptchaData.success) {
      console.log('reCAPTCHA validation failed:', recaptchaData);
      return res.status(400).json({ 
        message: 'Verificación reCAPTCHA falló. Por favor intenta de nuevo.' 
      });
    }

    // Configurar nodemailer con Gmail
    const transporter = nodemailer.default.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false
      }
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
    await transporter.sendMail(mailOptions);
    console.log('Email enviado exitosamente');

    res.status(200).json({ message: 'Email enviado correctamente' });

  } catch (error) {
    console.error('Error completo:', error);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error stack:', error.stack);
    
    // Mensaje de error más específico
    let errorMessage = 'Error interno del servidor';
    
    if (error.message.includes('self signed certificate')) {
      errorMessage = 'Error de certificado SSL';
    } else if (error.message.includes('Invalid login')) {
      errorMessage = 'Error de autenticación de correo';
    } else if (error.message.includes('ECONNREFUSED')) {
      errorMessage = 'No se pudo conectar al servidor de correo';
    }
    
    res.status(500).json({ 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
