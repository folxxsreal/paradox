import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  const { nombre, apellido, email, telefono, servicio, mensaje } = req.body;

  // Validar campos requeridos
  if (!nombre || !apellido || !email || !telefono || !servicio || !mensaje) {
    return res.status(400).json({ message: 'Todos los campos son requeridos' });
  }

  try {
    // Configurar nodemailer con Gmail
    const transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER, // Tu email de Gmail
        pass: process.env.GMAIL_APP_PASSWORD, // Tu contraseña de aplicación de Gmail
      },
    });

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
      to: process.env.GMAIL_USER, // Tu email donde quieres recibir los mensajes
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
    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: 'Email enviado correctamente' });
  } catch (error) {
    console.error('Error enviando email:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
}